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
} from '../types/document';

// Supabase client configuration
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string;

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
    this.supabase = createClient(supabaseUrl, supabaseAnonKey);
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
   * Process a document by file ID
   * @param fileId The ID of the file to process
   * @param userId The ID of the user who owns the file
   * @param options Processing options
   * @returns Processing result
   */
  async processDocument(
    fileId: string,
    userId: string,
    options?: DocumentProcessingOptions
  ): Promise<DocumentProcessingResult> {
    // Merge default options with provided options
    const processingOptions = {
      ...DEFAULT_PROCESSING_OPTIONS,
      ...options,
    };

    try {
      // Get file metadata from the database
      const { data: fileData, error: fileError } = await this.supabase
        .from('files')
        .select('*')
        .eq('id', fileId)
        .eq('user_id', userId)
        .single();

      if (fileError || !fileData) {
        throw new DocumentProcessingError(
          `File not found or access denied: ${fileError?.message || 'Unknown error'}`,
          undefined,
          'storage',
          fileError as Error
        );
      }

      // Create document record in the database
      const { data: documentData, error: documentError } = await this.supabase
        .from('documents')
        .insert({
          title: fileData.filename,
          file_path: fileData.file_path,
          file_type: fileData.file_type,
          user_id: userId,
          status: 'processing' as DocumentStatus,
          metadata: {
            originalFileId: fileId,
            processingStarted: new Date().toISOString(),
            fileSize: fileData.file_size,
          },
        })
        .select()
        .single();

      if (documentError || !documentData) {
        throw new DocumentProcessingError(
          `Failed to create document record: ${documentError?.message || 'Unknown error'}`,
          undefined,
          'storage',
          documentError as Error
        );
      }

      const documentId = documentData.id;

      try {
        // Download file from storage
        const { data: fileBuffer, error: downloadError } = await this.supabase
          .storage
          .from('documents')
          .download(fileData.file_path);

        if (downloadError || !fileBuffer) {
          throw new DocumentProcessingError(
            `Failed to download file: ${downloadError?.message || 'Unknown error'}`,
            documentId,
            'extraction',
            downloadError as Error
          );
        }

        // Update document status
        await this.updateDocumentStatus(documentId, 'processing');

        // Extract text from the document
        const extractionResult = await this.extractText(
          fileBuffer as unknown as Buffer,
          fileData.filename,
          fileData.file_type,
          documentId
        );

        // Update document metadata with extraction info
        await this.updateDocumentMetadata(documentId, {
          extraction: {
            wordCount: extractionResult.metadata.wordCount,
            charCount: extractionResult.metadata.charCount,
            contentHash: extractionResult.metadata.contentHash,
            extractionCompleted: new Date().toISOString(),
          },
        });

        // Split text into chunks
        const chunks = this.chunkDocument(
          extractionResult.text,
          documentId,
          processingOptions
        );

        // Store chunks in the database
        const storedChunks = await this.storeChunks(chunks);

        // Update document metadata with chunking info
        await this.updateDocumentMetadata(documentId, {
          chunking: {
            chunkCount: storedChunks.length,
            chunkingCompleted: new Date().toISOString(),
            chunkingStrategy: 'fixed',
            chunkSize: processingOptions.chunkSize,
            chunkOverlap: processingOptions.chunkOverlap,
          },
        });

        // Generate embeddings for chunks
        const chunksWithEmbeddings = await this.embeddingService.generateEmbeddings(
          storedChunks
        );

        // Count successful embeddings
        const embedCount = chunksWithEmbeddings.filter(chunk => chunk.embedding).length;

        // Update document metadata with embedding info
        await this.updateDocumentMetadata(documentId, {
          embedding: {
            embeddingCount: embedCount,
            embeddingModel: processingOptions.embeddingModel,
            embeddingCompleted: new Date().toISOString(),
          },
        });

        // Update document status to processed
        await this.updateDocumentStatus(documentId, 'processed');

        return {
          documentId,
          status: 'processed',
          chunkCount: storedChunks.length,
        };
      } catch (error) {
        // Update document status to error
        await this.updateDocumentStatus(
          documentId,
          'error',
          (error as Error).message
        );

        throw error;
      }
    } catch (error) {
      if (error instanceof DocumentProcessingError) {
        throw error;
      }

      throw new DocumentProcessingError(
        `Document processing failed: ${(error as Error).message}`,
        undefined,
        undefined,
        error as Error
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
  ) {
    try {
      // Convert Blob to Buffer if needed
      const buffer = fileBuffer instanceof Blob 
        ? Buffer.from(await fileBuffer.arrayBuffer())
        : fileBuffer;
      
      return await this.textExtractor.extractText(buffer, filename, fileType);
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
  ) {
    try {
      // Update chunker options if provided
      if (options.chunkSize || options.chunkOverlap) {
        this.documentChunker = new DocumentChunker({
          chunkSize: options.chunkSize || DEFAULT_PROCESSING_OPTIONS.chunkSize,
          chunkOverlap: options.chunkOverlap || DEFAULT_PROCESSING_OPTIONS.chunkOverlap,
          strategy: 'fixed',
          preserveSentences: true,
        });
      }

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
  private async storeChunks(chunks: any[]) {
    try {
      const storedChunks = [];

      // Process chunks in batches to avoid hitting connection limits
      for (let i = 0; i < chunks.length; i += 10) {
        const batch = chunks.slice(i, i + 10);
        
        const { data, error } = await this.supabase
          .from('chunks')
          .insert(batch)
          .select();

        if (error) {
          throw error;
        }

        storedChunks.push(...data);
      }

      return storedChunks;
    } catch (error) {
      throw new DocumentProcessingError(
        `Failed to store chunks: ${(error as Error).message}`,
        chunks[0]?.document_id,
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