/**
 * VectorSearchService
 * 
 * This service is responsible for searching document chunks using vector similarity
 * with pgvector in Supabase.
 */

import { createClient } from '@supabase/supabase-js';
import { EmbeddingService } from './embedding-service';
import { Database } from '../types/database.types';
import { ChunkWithEmbedding, DocumentChunk } from '../types/document';

// Use non-prefixed variables for server-side initialization
const supabaseUrl = process.env.SUPABASE_URL as string;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY as string;

/**
 * Error type for vector search errors
 */
export class VectorSearchError extends Error {
  constructor(
    message: string,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = 'VectorSearchError';
  }
}

/**
 * Search options for vector search
 */
export interface VectorSearchOptions {
  limit?: number;               // Maximum number of results to return
  threshold?: number;           // Minimum similarity score (0-1)
  filters?: Record<string, any>; // Metadata filters
  userId?: string;              // User ID for filtering by ownership
  excludeDocumentIds?: string[]; // Document IDs to exclude from search
}

/**
 * Default search options
 */
const DEFAULT_SEARCH_OPTIONS: VectorSearchOptions = {
  limit: 10,
  threshold: 0.7
};

/**
 * Search result including chunk and similarity score
 */
export interface SearchResult extends DocumentChunk {
  similarity: number;
  document_title?: string;
  document_type?: string;
}

/**
 * Interface for match_documents RPC function result
 */
interface MatchDocumentsResult {
  id: string;
  content: string;
  chunk_index: number;
  document_id: string;
  metadata: Record<string, any>;
  created_at: string;
  similarity: number;
  document_title: string;
  document_type: string;
}

/**
 * VectorSearchService for finding relevant document chunks using pgvector
 */
export class VectorSearchService {
  private supabase;
  private embeddingService: EmbeddingService;

  /**
   * Create a new VectorSearchService instance
   */
  constructor() {
    // Ensure variables are present
    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error('Missing Supabase URL or Anon Key for VectorSearchService');
    }
    this.supabase = createClient<Database>(supabaseUrl, supabaseAnonKey);
    this.embeddingService = new EmbeddingService();
  }

  /**
   * Search for documents similar to the query
   * @param query The search query
   * @param options Search options
   * @returns Array of search results with similarity scores
   */
  async search(query: string, options: VectorSearchOptions = {}): Promise<SearchResult[]> {
    try {
      const searchOptions = { ...DEFAULT_SEARCH_OPTIONS, ...options };
      const { limit, threshold, filters, userId } = searchOptions;

      // Generate an embedding for the query
      const queryEmbedding = await this.generateQueryEmbedding(query);

      // Call the match_documents function
      const { data, error } = await this.supabase
        .rpc('match_documents', {
          query_embedding: JSON.stringify(queryEmbedding),
          match_threshold: threshold,
          match_count: limit
        });

      if (error) {
        throw new VectorSearchError(`Error performing vector search: ${error.message}`, error);
      }

      if (!data || !Array.isArray(data)) {
        return [];
      }

      // Apply additional filters
      let results = data as MatchDocumentsResult[];

      // Filter by user ID if provided
      if (userId) {
        // We need to join with documents to filter by user_id
        // This is handled by RLS but we'll add an explicit check
        const { data: userDocuments } = await this.supabase
          .from('documents')
          .select('id')
          .eq('user_id', userId);

        if (userDocuments) {
          const userDocumentIds = userDocuments.map(doc => doc.id);
          results = results.filter(item => userDocumentIds.includes(item.document_id));
        }
      }

      // Apply document type filter
      if (filters?.document_type) {
        results = results.filter(item => item.document_type === filters.document_type);
      }

      // Apply metadata filters
      if (filters?.metadata && typeof filters.metadata === 'object') {
        results = results.filter(item => {
          for (const [key, value] of Object.entries(filters.metadata)) {
            if (!item.metadata || item.metadata[key] !== value) {
              return false;
            }
          }
          return true;
        });
      }

      // Exclude specific document IDs
      if (options.excludeDocumentIds && options.excludeDocumentIds.length > 0) {
        results = results.filter(item => !options.excludeDocumentIds?.includes(item.document_id));
      }

      // Map the results to the SearchResult interface
      return results.map(item => ({
        id: item.id,
        document_id: item.document_id,
        content: item.content,
        chunk_index: item.chunk_index,
        metadata: item.metadata || {},
        created_at: item.created_at,
        similarity: item.similarity,
        document_title: item.document_title,
        document_type: item.document_type
      }));
    } catch (error) {
      if (error instanceof VectorSearchError) {
        throw error;
      }
      throw new VectorSearchError(
        `Vector search failed: ${(error as Error).message}`,
        error as Error
      );
    }
  }

  /**
   * Generate an embedding vector for a query
   * @param query The search query
   * @returns Embedding vector
   */
  private async generateQueryEmbedding(query: string): Promise<number[]> {
    try {
      // Use the embedding service to generate an embedding
      const embedding = await this.embeddingService.generateEmbeddingForText(query);
      return embedding;
    } catch (error) {
      throw new VectorSearchError(
        `Failed to generate query embedding: ${(error as Error).message}`,
        error as Error
      );
    }
  }
} 