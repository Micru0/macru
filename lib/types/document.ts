/**
 * Document processing and ingestion pipeline types
 */

import { Database } from './database.types';

/**
 * Document status types
 */
export type DocumentStatus = 'pending' | 'processing' | 'processed' | 'error';

/**
 * Document entity from database
 */
export interface Document {
  id: string;
  title: string;
  file_path: string;
  file_type: string | null;
  user_id: string;
  status: DocumentStatus;
  error_message: string | null;
  metadata: Record<string, any>;
  created_at: string;
  updated_at: string;
}

/**
 * Document chunk from database
 */
export interface DocumentChunk {
  id: string;
  document_id: string;
  content: string;
  chunk_index: number;
  metadata: Record<string, any>;
  created_at: string;
}

/**
 * Embedding model types
 */
export type EmbeddingModel = 'gemini' | 'openai' | 'custom';

/**
 * Document embedding from database
 */
export interface DocumentEmbedding {
  id: string;
  chunk_id: string;
  embedding: number[];
  model: EmbeddingModel | string;
  created_at: string;
}

/**
 * Document with its related chunks and embeddings
 */
export interface DocumentWithChunks extends Document {
  chunks?: DocumentChunk[];
}

/**
 * Represents a document chunk combined with its embedding
 */
export interface ChunkWithEmbedding extends DocumentChunk {
  embedding?: DocumentEmbedding;
}

/**
 * Document processing options
 */
export interface DocumentProcessingOptions {
  chunkSize?: number;
  chunkOverlap?: number;
  embeddingModel?: EmbeddingModel;
}

/**
 * Document ingestion request
 */
export interface DocumentIngestionRequest {
  fileId: string;
  options?: DocumentProcessingOptions;
}

/**
 * Document ingestion response
 */
export interface DocumentIngestionResponse {
  success: boolean;
  documentId?: string;
  status: DocumentStatus;
  message: string;
  error?: string;
}

/**
 * Document processing result
 */
export interface DocumentProcessingResult {
  documentId: string;
  status: DocumentStatus;
  chunkCount?: number;
  error?: string;
}

/**
 * Type guard for Document
 */
export function isDocument(obj: any): obj is Document {
  return (
    obj &&
    typeof obj.id === 'string' &&
    typeof obj.title === 'string' &&
    typeof obj.file_path === 'string' &&
    typeof obj.user_id === 'string' &&
    typeof obj.status === 'string'
  );
}

/**
 * Type guard for DocumentChunk
 */
export function isDocumentChunk(obj: any): obj is DocumentChunk {
  return (
    obj &&
    typeof obj.id === 'string' &&
    typeof obj.document_id === 'string' &&
    typeof obj.content === 'string' &&
    typeof obj.chunk_index === 'number'
  );
}

/**
 * Type guard for DocumentEmbedding
 */
export function isDocumentEmbedding(obj: any): obj is DocumentEmbedding {
  return (
    obj &&
    typeof obj.id === 'string' &&
    typeof obj.chunk_id === 'string' &&
    Array.isArray(obj.embedding) &&
    typeof obj.model === 'string'
  );
} 