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
 * Structure for structured metadata filters
 */
interface StructuredFilters {
  event_start_time_before?: string | Date;
  event_start_time_after?: string | Date;
  event_end_time_before?: string | Date;
  event_end_time_after?: string | Date;
  due_date_before?: string | Date;
  due_date_after?: string | Date;
  content_status?: string;
  priority?: string;
  location?: string;
  participants?: string[]; // Array of participant names/ids
  source_types?: string[]; // Keep source_types filter separate
}

/**
 * Search options for vector search
 */
export interface VectorSearchOptions {
  limit?: number;               // Maximum number of results to return
  threshold?: number;           // Minimum similarity score (0-1)
  filters?: Record<string, any> & StructuredFilters; // Combine generic filters with structured ones
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
   * Search for documents similar to the query, applying hybrid filters
   * @param query The search query
   * @param options Search options including structured filters
   * @returns Array of search results with similarity scores
   */
  async search(query: string, options: VectorSearchOptions = {}): Promise<SearchResult[]> {
    try {
      const searchOptions = { ...DEFAULT_SEARCH_OPTIONS, ...options };
      const { limit, threshold, filters = {}, userId } = searchOptions;

      // Generate an embedding for the query
      const queryEmbedding = await this.generateQueryEmbedding(query);

      // Prepare parameters for the RPC function, mapping structured filters
      const rpcParams = {
        query_embedding: JSON.stringify(queryEmbedding),
        match_threshold: threshold,
        match_count: limit,
        filter_user_id: userId, // Pass user ID directly
        filter_source_types: filters.source_types || null, // Use source_types from filters
        filter_event_start_time_before: filters.event_start_time_before || null,
        filter_event_start_time_after: filters.event_start_time_after || null,
        filter_event_end_time_before: filters.event_end_time_before || null,
        filter_event_end_time_after: filters.event_end_time_after || null,
        filter_due_date_before: filters.due_date_before || null,
        filter_due_date_after: filters.due_date_after || null,
        filter_content_status: filters.content_status || null,
        filter_priority: filters.priority || null,
        filter_location: filters.location || null,
        filter_participants: filters.participants || null,
      };

      // Call the updated match_documents function
      const { data, error } = await this.supabase
        .rpc('match_documents', rpcParams);

      if (error) {
        console.error('Error calling match_documents RPC:', error); // Log specific RPC error
        throw new VectorSearchError(`Error performing vector search: ${error.message}`, error);
      }

      if (!data || !Array.isArray(data)) {
        console.log('No results returned from match_documents RPC.'); // Log if no data
        return [];
      }

      let results = data as MatchDocumentsResult[];
      console.log(`Initial results from match_documents RPC: ${results.length}`); // Log initial count

      // --- Post-RPC Filtering (minimal, only what RPC can't handle easily) ---

      // Exclude specific document IDs (still needed post-RPC)
      if (options.excludeDocumentIds && options.excludeDocumentIds.length > 0) {
        const initialCount = results.length;
        results = results.filter(item => !options.excludeDocumentIds?.includes(item.document_id));
        console.log(`Filtered ${initialCount - results.length} results based on excludeDocumentIds.`);
      }
      
      // --- REMOVE Redundant TypeScript filtering ---
      // User ID filtering is now handled by filter_user_id parameter and RLS/SECURITY DEFINER
      // Document type filtering is handled by filter_source_types parameter
      // Other generic metadata filtering (filters.metadata) should be handled by specific structured filter parameters now.

      console.log(`Final results after post-RPC filtering: ${results.length}`); // Log final count

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
      console.error('Unexpected error during vector search:', error); // Log unexpected errors
      throw new VectorSearchError(
        `Vector search failed unexpectedly: ${(error as Error).message}`,
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