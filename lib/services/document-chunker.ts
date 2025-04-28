/**
 * DocumentChunker service
 * 
 * This service provides strategies for splitting text documents into manageable chunks
 * for embedding generation, with various methods of chunking and overlap.
 */

import { DocumentChunk } from '../types/document';

/**
 * Configuration options for the document chunker
 */
export interface ChunkerOptions {
  // Maximum number of characters per chunk
  chunkSize: number;
  // Number of characters to overlap between adjacent chunks (to maintain context)
  chunkOverlap: number;
  // Strategy for splitting the text
  strategy: 'fixed' | 'paragraph' | 'semantic';
  // Separator to use when chunking by semantic units (sentences)
  semanticUnitSeparator?: string;
  // Whether to ensure chunks don't break mid-sentence
  preserveSentences?: boolean;
  // Custom separator regex for paragraph chunking
  paragraphSeparator?: RegExp;
}

/**
 * Default chunker options
 */
export const DEFAULT_CHUNKER_OPTIONS: ChunkerOptions = {
  chunkSize: 1000,
  chunkOverlap: 200,
  strategy: 'fixed',
  preserveSentences: true,
  semanticUnitSeparator: '.',
  paragraphSeparator: /\n\s*\n/,
};

/**
 * Document chunking service for splitting text into manageable chunks
 */
export class DocumentChunker {
  private options: ChunkerOptions;

  /**
   * Create a new DocumentChunker with the specified options
   */
  constructor(options: Partial<ChunkerOptions> = {}) {
    this.options = { ...DEFAULT_CHUNKER_OPTIONS, ...options };
  }

  /**
   * Split text into chunks based on the configured strategy
   * @param text Full text to chunk
   * @param documentId ID of the parent document
   * @param metadata Optional metadata to include with each chunk
   * @returns Array of document chunks
   */
  chunkDocument(
    text: string,
    documentId: string,
    metadata: Record<string, any> = {}
  ): DocumentChunk[] {
    // The constructor modification above will force 'fixed' strategy
    // so this switch case will always go to chunkByFixed
    switch (this.options.strategy) {
      case 'paragraph':
        return this.chunkByParagraph(text, documentId, metadata);
      case 'semantic':
        return this.chunkBySemantic(text, documentId, metadata);
      case 'fixed':
      default:
        return this.chunkByFixed(text, documentId, metadata);
    }
  }

  /**
   * Split text into fixed-size chunks with optional overlap
   */
  private chunkByFixed(
    text: string,
    documentId: string,
    metadata: Record<string, any>
  ): DocumentChunk[] {
    const { chunkSize, chunkOverlap } = this.options;
    const chunks: DocumentChunk[] = [];
    const cleanedText = this.cleanText(text);

    if (cleanedText.length === 0) {
      console.warn('[DocumentChunker.chunkByFixed] Input text is empty after cleaning.');
      return []; // Handle empty text
    }

    // If text is smaller than chunk size, return it as a single chunk
    if (cleanedText.length <= chunkSize) {
      console.log('[DocumentChunker.chunkByFixed] Text length <= chunkSize, returning single chunk.');
      return [this.createChunk(cleanedText, documentId, 0, metadata)];
    }

    let chunkIndex = 0;
    const step = chunkSize - chunkOverlap;

    // Ensure step size is positive to prevent infinite loops
    if (step <= 0) {
        console.error(`[DocumentChunker.chunkByFixed] Invalid configuration: chunkSize (${chunkSize}) must be greater than chunkOverlap (${chunkOverlap}). Returning empty array.`);
        return []; // Indicate failure due to invalid config
    }

    for (let startIndex = 0; startIndex < cleanedText.length; startIndex += step) {
        let endIndex = startIndex + chunkSize;
        // Clamp endIndex to the text length
        if (endIndex > cleanedText.length) {
            endIndex = cleanedText.length;
        }

        const chunkContent = cleanedText.substring(startIndex, endIndex);

        if (chunkContent.trim().length > 0) {
            chunks.push(this.createChunk(chunkContent, documentId, chunkIndex, metadata));
            chunkIndex++;
        }

        // Exit loop if we've processed the last possible segment
        if (endIndex === cleanedText.length) {
            break; 
        }
    }

    return chunks;
  }

  /**
   * Split text into paragraph-based chunks
   */
  private chunkByParagraph(
    text: string,
    documentId: string,
    metadata: Record<string, any>
  ): DocumentChunk[] {
    const { chunkSize, chunkOverlap, paragraphSeparator } = this.options;
    const chunks: DocumentChunk[] = [];
    
    // Split text into paragraphs
    const paragraphs = text.split(paragraphSeparator || /\n\s*\n/);
    let currentChunk = '';
    let chunkIndex = 0;
    
    for (let i = 0; i < paragraphs.length; i++) {
      const paragraph = paragraphs[i].trim();
      
      // Skip empty paragraphs
      if (paragraph.length === 0) continue;
      
      // If adding this paragraph would exceed the chunk size, 
      // and we already have content in the current chunk
      if (currentChunk.length > 0 && 
          currentChunk.length + paragraph.length > chunkSize) {
        
        // Add the current chunk to the result
        chunks.push(this.createChunk(currentChunk, documentId, chunkIndex, metadata));
        chunkIndex++;
        
        // Start a new chunk with overlap from the previous chunk
        if (chunkOverlap > 0 && currentChunk.length > chunkOverlap) {
          const overlapText = currentChunk.substring(currentChunk.length - chunkOverlap);
          currentChunk = overlapText;
        } else {
          currentChunk = '';
        }
      }
      
      // Add paragraph to the current chunk
      currentChunk += (currentChunk.length > 0 ? '\n\n' : '') + paragraph;
      
      // If a single paragraph is larger than the chunk size, split it
      if (currentChunk.length > chunkSize) {
        const fixedChunks = this.chunkByFixed(currentChunk, documentId, metadata);
        
        // Adjust chunk indices
        for (let j = 0; j < fixedChunks.length; j++) {
          fixedChunks[j].chunk_index = chunkIndex++;
          chunks.push(fixedChunks[j]);
        }
        
        currentChunk = '';
      }
    }
    
    // Add the last chunk if there's content
    if (currentChunk.trim().length > 0) {
      chunks.push(this.createChunk(currentChunk, documentId, chunkIndex, metadata));
    }
    
    return chunks;
  }

  /**
   * Split text into semantic units (e.g., sentences or custom separators)
   */
  private chunkBySemantic(
    text: string,
    documentId: string,
    metadata: Record<string, any>
  ): DocumentChunk[] {
    const { chunkSize, chunkOverlap, semanticUnitSeparator } = this.options;
    const chunks: DocumentChunk[] = [];
    
    // Generate a regex pattern for splitting on semantic units (sentences by default)
    const separatorPattern = semanticUnitSeparator ?
      new RegExp(`([${semanticUnitSeparator}]\\s+)`) :
      /([.!?]\s+)/;
    
    // Split text into semantic units (preserving separators)
    const semanticUnits = text.split(separatorPattern);
    
    let currentChunk = '';
    let chunkIndex = 0;
    
    for (let i = 0; i < semanticUnits.length; i += 2) {
      // Get the current unit and its separator (if available)
      const unit = semanticUnits[i];
      const separator = i + 1 < semanticUnits.length ? semanticUnits[i + 1] : '';
      const semanticUnit = unit + separator;
      
      // If adding this unit would exceed the chunk size
      if (currentChunk.length > 0 && 
          currentChunk.length + semanticUnit.length > chunkSize) {
        
        // Add the current chunk to the result
        chunks.push(this.createChunk(currentChunk, documentId, chunkIndex, metadata));
        chunkIndex++;
        
        // Start a new chunk with overlap from the previous chunk
        if (chunkOverlap > 0 && currentChunk.length > chunkOverlap) {
          // Try to find semantic unit boundaries for the overlap
          const overlapText = currentChunk.substring(currentChunk.length - chunkOverlap);
          // Find the first semantic unit start in the overlap
          const firstUnitStart = overlapText.search(separatorPattern);
          currentChunk = firstUnitStart >= 0 ? 
            overlapText.substring(firstUnitStart) : 
            '';
        } else {
          currentChunk = '';
        }
      }
      
      // Add the semantic unit to the current chunk
      currentChunk += semanticUnit;
    }
    
    // Add the last chunk if there's content
    if (currentChunk.trim().length > 0) {
      chunks.push(this.createChunk(currentChunk, documentId, chunkIndex, metadata));
    }
    
    return chunks;
  }

  /**
   * Create a document chunk with the given content and metadata
   */
  private createChunk(
    content: string,
    documentId: string,
    chunkIndex: number,
    metadata: Record<string, any>
  ): DocumentChunk {
    // Combine metadata with chunk-specific information
    const chunkMetadata = {
      ...metadata,
      chunkIndex,
      charCount: content.length,
      wordCount: this.countWords(content),
    };
    
    return {
      id: '', // This will be set by the database
      document_id: documentId,
      content: content.trim(),
      chunk_index: chunkIndex,
      metadata: chunkMetadata,
      created_at: new Date().toISOString(),
    };
  }

  /**
   * Clean text by normalizing whitespace and line breaks
   */
  private cleanText(text: string): string {
    return text
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/\s{2,}/g, ' ')
      .trim();
  }

  /**
   * Count words in a text
   */
  private countWords(text: string): number {
    return text.split(/\s+/).filter(word => word.length > 0).length;
  }

  /**
   * Deduplicate similar chunks (remove chunks that are nearly identical)
   * @param chunks Array of document chunks to deduplicate
   * @param similarityThreshold Threshold for determining similarity (0-1)
   * @returns Deduplicated array of chunks
   */
  deduplicateChunks(
    chunks: DocumentChunk[], 
    similarityThreshold: number = 0.85
  ): DocumentChunk[] {
    if (chunks.length <= 1) return chunks;
    
    const dedupedChunks: DocumentChunk[] = [];
    const contentHashes = new Set<string>();
    
    for (const chunk of chunks) {
      // Skip empty chunks
      if (!chunk.content || chunk.content.trim().length === 0) continue;
      
      // Generate a simple hash of the content
      const contentHash = this.simpleHash(chunk.content);
      
      // If we haven't seen this content before, add it
      if (!contentHashes.has(contentHash)) {
        contentHashes.add(contentHash);
        dedupedChunks.push(chunk);
      }
    }
    
    return dedupedChunks;
  }

  /**
   * Generate a simple hash for chunk deduplication
   */
  private simpleHash(text: string): string {
    // Normalize text by removing extra whitespace, lowercasing
    const normalizedText = text.toLowerCase().replace(/\s+/g, ' ').trim();
    
    // Create a simple hash
    let hash = 0;
    for (let i = 0; i < normalizedText.length; i++) {
      hash = (hash << 5) - hash + normalizedText.charCodeAt(i);
      hash |= 0; // Convert to 32-bit integer
    }
    
    return hash.toString(16);
  }
}

/**
 * Factory function to create a DocumentChunker with specified strategy
 */
export function createChunker(options: Partial<ChunkerOptions> = {}): DocumentChunker {
  return new DocumentChunker(options);
} 