/**
 * TextExtractor service
 * 
 * This service extracts text content from various file types including PDF, DOCX, and TXT.
 * It provides a unified interface for text extraction with appropriate error handling.
 */

import mammoth from 'mammoth';
import { createHash } from 'crypto';

/**
 * Supported file types for text extraction
 */
export type SupportedFileType = 'pdf' | 'docx' | 'txt' | 'text/plain';

/**
 * Result of text extraction
 */
export interface ExtractionResult {
  text: string;
  metadata: {
    title?: string;
    author?: string;
    creationDate?: string;
    pageCount?: number;
    fileType: string;
    contentHash: string;
    wordCount: number;
    charCount: number;
  };
}

/**
 * Error thrown when extraction fails
 */
export class ExtractionError extends Error {
  constructor(
    message: string,
    public readonly fileType: string,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = 'ExtractionError';
  }
}

/**
 * Abstract base class for text extractors
 */
export abstract class BaseExtractor {
  /**
   * Extract text content from a file buffer
   * @param buffer File content as buffer
   * @param filename Original filename (used for metadata)
   */
  abstract extract(buffer: Buffer, filename: string): Promise<ExtractionResult>;

  /**
   * Generate hash for content
   * @param text Text to hash
   */
  protected generateContentHash(text: string): string {
    return createHash('sha256').update(text).digest('hex');
  }

  /**
   * Count words in text
   * @param text Text to count words in
   */
  protected countWords(text: string): number {
    return text.split(/\s+/).filter(word => word.length > 0).length;
  }

  /**
   * Clean extracted text
   * @param text Text to clean
   */
  protected cleanText(text: string): string {
    // Remove multiple whitespaces
    return text
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/\s{2,}/g, ' ')
      .trim();
  }
}

/**
 * PDF text extractor
 */
export class PdfExtractor extends BaseExtractor {
  async extract(buffer: Buffer, filename: string): Promise<ExtractionResult> {
    try {
      // Dynamically import pdf-parse
      const pdfParse = (await import('pdf-parse')).default;

      // DEBUG: Log buffer details before calling pdf-parse
      console.log(`[PdfExtractor] Attempting to parse PDF: ${filename}. Buffer length: ${buffer.length}`);
      if (!Buffer.isBuffer(buffer)) {
        console.error('[PdfExtractor] Error: Input is not a Node.js Buffer!');
        throw new Error('Invalid input type for PDF parsing.');
      }

      const data = await pdfParse(buffer); // Ensure buffer is passed correctly
      const cleanedText = this.cleanText(data.text);
      
      return {
        text: cleanedText,
        metadata: {
          title: data.info?.Title || filename,
          author: data.info?.Author,
          creationDate: data.info?.CreationDate,
          pageCount: data.numpages,
          fileType: 'pdf',
          contentHash: this.generateContentHash(cleanedText),
          wordCount: this.countWords(cleanedText),
          charCount: cleanedText.length
        }
      };
    } catch (error) {
      console.error(`[PdfExtractor] pdf-parse error for ${filename}:`, error);
      throw new ExtractionError(
        `Failed to extract text from PDF: ${(error as Error).message}`,
        'pdf',
        error as Error
      );
    }
  }
}

/**
 * DOCX text extractor
 */
export class DocxExtractor extends BaseExtractor {
  async extract(buffer: Buffer, filename: string): Promise<ExtractionResult> {
    try {
      const result = await mammoth.extractRawText({ buffer });
      const cleanedText = this.cleanText(result.value);
      
      return {
        text: cleanedText,
        metadata: {
          title: filename,
          fileType: 'docx',
          contentHash: this.generateContentHash(cleanedText),
          wordCount: this.countWords(cleanedText),
          charCount: cleanedText.length
        }
      };
    } catch (error) {
      throw new ExtractionError(
        `Failed to extract text from DOCX: ${(error as Error).message}`,
        'docx',
        error as Error
      );
    }
  }
}

/**
 * Plain text extractor
 */
export class TxtExtractor extends BaseExtractor {
  async extract(buffer: Buffer, filename: string): Promise<ExtractionResult> {
    try {
      const text = buffer.toString('utf-8');
      const cleanedText = this.cleanText(text);
      
      return {
        text: cleanedText,
        metadata: {
          title: filename,
          fileType: 'txt',
          contentHash: this.generateContentHash(cleanedText),
          wordCount: this.countWords(cleanedText),
          charCount: cleanedText.length
        }
      };
    } catch (error) {
      throw new ExtractionError(
        `Failed to extract text from TXT: ${(error as Error).message}`,
        'txt',
        error as Error
      );
    }
  }
}

/**
 * Factory for creating text extractors based on file type
 */
export class TextExtractorFactory {
  /**
   * Get appropriate extractor for file type
   * @param fileType File type or MIME type
   */
  static getExtractor(fileType: string): BaseExtractor {
    const normalizedType = fileType.toLowerCase();
    
    if (normalizedType === 'pdf' || normalizedType === 'application/pdf') {
      return new PdfExtractor();
    }
    
    if (
      normalizedType === 'docx' ||
      normalizedType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ) {
      return new DocxExtractor();
    }
    
    if (normalizedType === 'txt' || normalizedType === 'text/plain') {
      return new TxtExtractor();
    }
    
    throw new Error(`Unsupported file type: ${fileType}`);
  }

  /**
   * Extract text from file buffer with automatic type detection
   * @param buffer File content buffer
   * @param filename Original filename
   * @param fileType File type or MIME type
   */
  static async extract(
    buffer: Buffer,
    filename: string,
    fileType: string
  ): Promise<ExtractionResult> {
    try {
      const extractor = this.getExtractor(fileType);
      return await extractor.extract(buffer, filename);
    } catch (error) {
      if (error instanceof ExtractionError) {
        throw error;
      }
      
      throw new ExtractionError(
        `Text extraction failed: ${(error as Error).message}`,
        fileType,
        error as Error
      );
    }
  }
}

/**
 * Main TextExtractor service
 */
export const TextExtractor = {
  /**
   * Extract text from a file
   * @param buffer File content as buffer
   * @param filename Original filename
   * @param fileType File type or MIME type
   */
  async extractText(
    buffer: Buffer,
    filename: string,
    fileType: string
  ): Promise<ExtractionResult> {
    return TextExtractorFactory.extract(buffer, filename, fileType);
  },

  /**
   * Check if file type is supported
   * @param fileType File type or MIME type to check
   */
  isSupported(fileType: string): boolean {
    const normalizedType = fileType.toLowerCase();
    
    return (
      normalizedType === 'pdf' ||
      normalizedType === 'application/pdf' ||
      normalizedType === 'docx' ||
      normalizedType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      normalizedType === 'txt' ||
      normalizedType === 'text/plain'
    );
  }
}; 