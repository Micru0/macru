/**
 * DocumentProcessor service
 * 
 * This service orchestrates the document processing pipeline:
 * 1. Extract text from documents (PDF, DOCX, TXT)
 * 2. Split text into manageable chunks
 * 3. Generate embeddings for each chunk
 * 4. Store document, chunks, and embeddings in the database
 */

import { createClient } from '@supabase/supabase-js';
import { PostgrestError } from '@supabase/supabase-js';
import { DocumentChunker } from './document-chunker';
import { TextExtractor } from './text-extractor';
import { EmbeddingService } from './embedding-service';
import {
  DocumentStatus,
  DocumentProcessingOptions,
  DocumentProcessingResult,
  DocumentChunk
} from '../types/document';
import { ConnectorType } from '@/lib/types/data-connector';

// Supabase client configuration
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
// REMOVE anon key variable - we'll use service role key
// const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string;
// ADD service role key variable (ensure this is set in your .env.local)
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY as string;

if (!supabaseServiceRoleKey) {
  console.warn('WARNING: SUPABASE_SERVICE_ROLE_KEY is not set. DocumentProcessor may fail due to RLS.');
  // Optionally throw an error if it's absolutely required: 
  // throw new Error('SUPABASE_SERVICE_ROLE_KEY environment variable is not set.');
}

/**
 * Default document processing options
 */
const DEFAULT_PROCESSING_OPTIONS: DocumentProcessingOptions = {
  chunkSize: 1000,
  chunkOverlap: 200,
  embeddingModel: 'gemini',
};

/**
 * Error thrown during document processing
 */
export class DocumentProcessingError extends Error {
  constructor(
    message: string,
    public readonly documentId?: string,
    public readonly stage?: 'extraction' | 'chunking' | 'embedding' | 'storage',
    public readonly cause?: Error
  ) {
    super(message);
    this.name = 'DocumentProcessingError';
  }
}

// Interface for the options passed to processDocument
export interface ProcessDocumentArgs {
  userId: string;
  fileName: string; // Can be original filename or Notion title
  filePath?: string | null; // Path in storage (optional if rawContent provided)
  fileType?: string | null; // MIME type (optional if rawContent provided)
  fileId?: string | null; // Original ID from 'files' table if applicable
  sourceId?: string | null; // Original ID from external source (e.g., Notion page ID)
  sourceType?: ConnectorType | string | null; // Source type (e.g., 'notion', 'file_upload')
  rawContent?: string | null; // Raw text content if already extracted
  metadata?: Record<string, any> | null; // Additional metadata
  processingOptions?: DocumentProcessingOptions | null; // Override default chunking/embedding options
}

/**
 * DocumentProcessor service for processing documents
 */
export class DocumentProcessor {
  private supabase;
  private textExtractor;
  private documentChunker;
  private embeddingService;

  /**
   * Create a new DocumentProcessor
   */
  constructor() {
    // Use the Service Role Key for the backend processor
    // If service key is missing, client creation will use undefined/null, 
    // relying on the warning log and potential downstream errors.
    this.supabase = createClient(supabaseUrl, supabaseServiceRoleKey);
    this.textExtractor = TextExtractor;
    this.documentChunker = new DocumentChunker({
      chunkSize: DEFAULT_PROCESSING_OPTIONS.chunkSize || 1000,
      chunkOverlap: DEFAULT_PROCESSING_OPTIONS.chunkOverlap || 200,
      strategy: 'fixed',
      preserveSentences: true,
    });
    this.embeddingService = new EmbeddingService({
      model: DEFAULT_PROCESSING_OPTIONS.embeddingModel || 'gemini',
      cacheEnabled: true,
    });
  }

  /**
   * Process a document either from a stored file or directly from raw content.
   * @param args Arguments for processing, including user ID, identifiers, and either filePath/fileType or rawContent.
   * @returns Processing result
   */
  async processDocument(
    args: ProcessDocumentArgs
  ): Promise<DocumentProcessingResult> {
    const { userId, fileName, filePath, fileType, fileId, sourceId, sourceType, rawContent, metadata, processingOptions: optionOverrides } = args;

    // --- Argument Validation --- 
    if (!rawContent && (!filePath || !fileType)) {
      throw new DocumentProcessingError('No content source available (rawContent or filePath/fileType).', undefined, 'extraction');
    }
    if (!userId || !fileName) {
      throw new DocumentProcessingError('Missing user ID or fileName.', undefined, 'extraction');
    }
    
    const processingOptions = {
      ...DEFAULT_PROCESSING_OPTIONS,
      ...(optionOverrides || {}),
    };
    
    // --- Create Document Record FIRST --- 
    console.log(`[DocumentProcessor] Creating document record for: ${fileName}`);
    
    // Extract timestamps from metadata if they exist
    const sourceCreatedAt = metadata?.createdTime ? new Date(metadata.createdTime).toISOString() : null;
    const sourceUpdatedAt = metadata?.lastEditedTime ? new Date(metadata.lastEditedTime).toISOString() : null;
    
    const insertResult = await this.supabase
      .from('documents')
      .insert({
        title: fileName, 
        file_path: filePath, // Can be null if rawContent is provided
        file_type: fileType, // Can be null if rawContent is provided
        user_id: userId,
        status: 'processing' as DocumentStatus,
        source_type: sourceType, // Store source type
        source_id: sourceId, // Store external source ID
        source_created_at: sourceCreatedAt,
        source_updated_at: sourceUpdatedAt,
        metadata: {
          originalFileId: fileId, // Store original file ID if applicable
          processingStarted: new Date().toISOString(),
          ...(metadata || {}) // Merge provided metadata (includes original timestamps too)
        },
      })
      .select()
      .single();

    if (insertResult.error || !insertResult.data) {
      throw new DocumentProcessingError(
        `Failed to create document record: ${insertResult.error?.message || 'Unknown error'}`,
        undefined, 'storage', insertResult.error as Error
      );
    }
    
    // ---- If insert succeeded, documentId is guaranteed to be a string ----
    const documentId: string = insertResult.data.id; 
    console.log(`[DocumentProcessor] Document record created with ID: ${documentId}`);

    // ---- Main Processing Block (now assured documentId exists) ----
    try {
      await this.updateDocumentStatus(documentId, 'processing');

      // --- Conditional Content Extraction --- 
      let extractedText: string;
      let extractionMetadata: { wordCount: number; charCount: number; contentHash: string } | null = null;
      if (rawContent) {
        console.log(`[DocumentProcessor] Using provided raw content for document ${documentId}.`);
        extractedText = rawContent;
        extractionMetadata = {
          wordCount: extractedText.split(/\s+/).filter(Boolean).length, 
          charCount: extractedText.length,
          contentHash: 'raw_content_hash_placeholder' // Calculate hash if required
        };
      } else {
        // File path and type must exist if rawContent doesn't (checked above)
        console.log(`[DocumentProcessor] Downloading file from storage: ${filePath!}`);
        const { data: fileBuffer, error: downloadError } = await this.supabase
          .storage.from('documents').download(filePath!);
        if (downloadError || !fileBuffer) {
          throw new DocumentProcessingError(
            `Failed to download file: ${downloadError?.message || 'Unknown error'}`,
            documentId,
            'extraction',
            downloadError as Error
          );
        }
        console.log(`[DocumentProcessor] Extracting text for ${fileName} (${fileType!}).`);
        const extractionResult = await this.extractText(
          fileBuffer as unknown as Buffer, fileName, fileType!, documentId // Now safe
        );
        extractedText = extractionResult.text;
        extractionMetadata = extractionResult.metadata;
      }

      // --- Update Metadata, Chunking, Embedding --- 
      if (extractionMetadata) {
         await this.updateDocumentMetadata(documentId, {
          extraction: {
            ...extractionMetadata,
            extractionSource: rawContent ? 'raw' : 'file',
            extractionCompleted: new Date().toISOString(),
          },
        });
      }

      const chunks = this.chunkDocument(extractedText, documentId, processingOptions); 
      if (!chunks || chunks.length === 0) {
          console.warn(`[DocumentProcessor] No valid chunks generated for document ${documentId}.`);
          await this.updateDocumentStatus(documentId, 'processed'); // Or error status?
          return { documentId, status: 'processed', chunkCount: 0 };
      }

      const storedChunks = await this.storeChunks(chunks); 
      await this.updateDocumentMetadata(documentId, {
        chunking: { /* ... chunking metadata ... */ },
      });
      if (!storedChunks || storedChunks.length === 0) {
         console.warn(`[DocumentProcessor] No chunks were successfully stored for document ${documentId}.`);
         await this.updateDocumentStatus(documentId, 'processed');
         return { documentId, status: 'processed', chunkCount: 0 };
      }

      const chunksWithEmbeddings = await this.embeddingService.generateEmbeddings(storedChunks);
      const embedCount = chunksWithEmbeddings.filter(chunk => chunk.embedding).length;
      await this.updateDocumentMetadata(documentId, {
        embedding: { /* ... embedding metadata ... */ },
      });

      await this.updateDocumentStatus(documentId, 'processed');
      console.log(`[DocumentProcessor] Finished processing document ${documentId}. Chunks: ${storedChunks.length}, Embeddings: ${embedCount}.`);
      return { documentId, status: 'processed', chunkCount: storedChunks.length };

    } catch (processingError) {
      // --- Error Handling AFTER document record exists --- 
      console.error(`[DocumentProcessor] Error during processing stage for doc ID ${documentId}:`, processingError);
      // Update status with error message
      await this.updateDocumentStatus(
        documentId, // Guaranteed to be string here
        'error',
        (processingError as Error).message
      );
      // Re-throw error, ensuring documentId is included
      if (processingError instanceof DocumentProcessingError) {
        throw new DocumentProcessingError(processingError.message, documentId, processingError.stage, processingError.cause);
      } 
      throw new DocumentProcessingError(
        `Document processing failed: ${(processingError as Error).message}`,
        documentId, // Pass confirmed ID
        undefined, 
        processingError as Error
      );
    }
  }

  /**
   * Extract text from a document
   * @param fileBuffer File content as buffer
   * @param filename Original filename
   * @param fileType File type/MIME type
   * @param documentId Document ID for error reporting
   * @returns Extraction result
   */
  private async extractText(
    fileBuffer: Buffer | Blob,
    filename: string,
    fileType: string,
    documentId: string
  ): Promise<{ text: string; metadata: any }> {
    try {
      // Convert Blob to Buffer if needed
      const buffer = fileBuffer instanceof Blob 
        ? Buffer.from(await fileBuffer.arrayBuffer())
        : fileBuffer;
      
      const extractionResult = await this.textExtractor.extractText(buffer, filename, fileType);
      return {
        text: extractionResult.text,
        metadata: extractionResult.metadata,
      };
    } catch (error) {
      throw new DocumentProcessingError(
        `Text extraction failed: ${(error as Error).message}`,
        documentId,
        'extraction',
        error as Error
      );
    }
  }

  /**
   * Split document text into chunks
   * @param text Document text
   * @param documentId Document ID
   * @param options Processing options
   * @returns Document chunks
   */
  private chunkDocument(
    text: string,
    documentId: string,
    options: DocumentProcessingOptions
  ): DocumentChunk[] {
    try {
      // Always use the chunker instance created in the constructor
      return this.documentChunker.chunkDocument(text, documentId);
    } catch (error) {
      throw new DocumentProcessingError(
        `Document chunking failed: ${(error as Error).message}`,
        documentId,
        'chunking',
        error as Error
      );
    }
  }

  /**
   * Store document chunks in the database
   * @param chunks Document chunks to store
   * @returns Stored chunks
   */
  private async storeChunks(chunks: DocumentChunk[]): Promise<DocumentChunk[]> {
    if (!chunks || chunks.length === 0) {
      console.warn('[DocumentProcessor.storeChunks] Received empty or null chunks array.');
      return [];
    }
    
    try {
      const storedChunks = [];
      const documentId = chunks[0]?.document_id; // Get documentId for error reporting

      // Process chunks in batches to avoid hitting connection limits
      for (let i = 0; i < chunks.length; i += 10) { // Batch size 10
        let batch = chunks.slice(i, i + 10);
        
        // Filter out invalid chunks before inserting
        const validBatch = batch.filter(chunk => 
          chunk.content && 
          chunk.content.trim().length > 0 && 
          chunk.document_id && 
          typeof chunk.document_id === 'string' && 
          chunk.document_id.length > 0 // Basic check for non-empty string UUID
        );
        
        if (validBatch.length === 0) {
          console.warn(`[DocumentProcessor.storeChunks] Batch ${i/10 + 1} was empty after validation.`);
          continue; // Skip empty batch
        }

        console.log(`[DocumentProcessor.storeChunks] Inserting batch ${i/10 + 1} with ${validBatch.length} chunks for doc ${documentId}`);
        
        // Prepare batch for insertion by removing the 'id' field
        const batchToInsert = validBatch.map(({ id, ...rest }) => rest);
        
        const { data, error } = await this.supabase
          .from('chunks')
          .insert(batchToInsert) // Insert the batch without the 'id' field
          .select();

        if (error) {
          console.error(`[DocumentProcessor.storeChunks] Error inserting batch:`, error);
          // Add documentId to the error for better context
          throw new Error(`Database error storing chunks for document ${documentId}: ${error.message}`); 
        }

        if (data) {
           storedChunks.push(...data);
        }
      }

      console.log(`[DocumentProcessor.storeChunks] Successfully stored ${storedChunks.length} chunks for doc ${documentId}`);
      return storedChunks as DocumentChunk[]; // Cast result back
    } catch (error) {
      const docIdForError = chunks[0]?.document_id || 'unknown';
      console.error(`[DocumentProcessor.storeChunks] Overall error for doc ${docIdForError}:`, error);
      throw new DocumentProcessingError(
        `Failed to store chunks: ${(error as Error).message}`,
        docIdForError, // Use the potentially known document ID
        'storage',
        error as Error
      );
    }
  }

  /**
   * Update document status
   * @param documentId Document ID
   * @param status New status
   * @param errorMessage Optional error message
   */
  private async updateDocumentStatus(
    documentId: string,
    status: DocumentStatus,
    errorMessage?: string
  ) {
    const updateData: { status: DocumentStatus; error_message?: string } = {
      status,
    };

    if (errorMessage && status === 'error') {
      updateData.error_message = errorMessage;
    }

    const { error } = await this.supabase
      .from('documents')
      .update(updateData)
      .eq('id', documentId);

    if (error) {
      console.error(`Failed to update document status: ${error.message}`);
      // We don't throw here to avoid cascading errors
    }
  }

  /**
   * Update document metadata
   * @param documentId Document ID
   * @param metadata Metadata to update (will be merged with existing metadata)
   */
  private async updateDocumentMetadata(
    documentId: string,
    metadata: Record<string, any>
  ) {
    try {
      // First get the current metadata
      const { data, error: fetchError } = await this.supabase
        .from('documents')
        .select('metadata')
        .eq('id', documentId)
        .single();

      if (fetchError) {
        throw fetchError;
      }

      // Merge with new metadata
      const updatedMetadata = {
        ...(data.metadata || {}),
        ...metadata,
      };

      // Update the document
      const { error: updateError } = await this.supabase
        .from('documents')
        .update({
          metadata: updatedMetadata,
        })
        .eq('id', documentId);

      if (updateError) {
        throw updateError;
      }
    } catch (error) {
      console.error(`Failed to update document metadata: ${(error as Error).message}`);
      // We don't throw here to avoid cascading errors
    }
  }
}

/**
 * Singleton instance of the DocumentProcessor
 */
export const documentProcessor = new DocumentProcessor(); 