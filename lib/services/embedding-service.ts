/**
 * EmbeddingService
 * 
 * This service is responsible for generating and managing embeddings
 * for document chunks using the Gemini API.
 */

import { createClient } from '@supabase/supabase-js';
import { ChunkWithEmbedding, DocumentChunk, DocumentEmbedding, EmbeddingModel } from '../types/document';
import { Database } from '../types/database.types';

// Supabase client configuration
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string;

const MAX_BATCH_SIZE = 20; // Maximum number of chunks to process in a single batch
const RATE_LIMIT_DELAY = 1000; // Delay between API calls in milliseconds
const MAX_RETRIES = 3; // Maximum number of retries for failed API calls

/**
 * Error type for embedding generation errors
 */
export class EmbeddingError extends Error {
  constructor(
    message: string,
    public readonly chunkId?: string,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = 'EmbeddingError';
  }
}

/**
 * Options for embedding generation
 */
export interface EmbeddingOptions {
  model?: EmbeddingModel;
  batchSize?: number;
  cacheEnabled?: boolean;
}

/**
 * Default embedding options
 */
const DEFAULT_EMBEDDING_OPTIONS: EmbeddingOptions = {
  model: 'gemini',
  batchSize: 10,
  cacheEnabled: true,
};

/**
 * EmbeddingService class for generating and managing embeddings
 */
export class EmbeddingService {
  private options: EmbeddingOptions;
  private supabase;

  /**
   * Create a new EmbeddingService instance
   * @param options Configuration options for the embedding service
   */
  constructor(options: EmbeddingOptions = {}) {
    this.options = { ...DEFAULT_EMBEDDING_OPTIONS, ...options };
    this.supabase = createClient(supabaseUrl, supabaseAnonKey);
  }

  /**
   * Generate embeddings for a list of document chunks
   * @param chunks Document chunks to generate embeddings for
   * @returns Chunks with their embeddings
   */
  async generateEmbeddings(
    chunks: DocumentChunk[]
  ): Promise<ChunkWithEmbedding[]> {
    try {
      if (!chunks.length) {
        return [];
      }

      // Split chunks into batches to respect rate limits
      const batches = this.createBatches(chunks, this.options.batchSize || MAX_BATCH_SIZE);
      
      let results: ChunkWithEmbedding[] = [];
      
      for (let i = 0; i < batches.length; i++) {
        const batch = batches[i];
        
        // Process batch with rate limiting
        if (i > 0) {
          await this.delay(RATE_LIMIT_DELAY);
        }
        
        const batchResults = await this.processBatch(batch);
        results = [...results, ...batchResults];
      }
      
      return results;
    } catch (error) {
      throw new EmbeddingError(
        `Failed to generate embeddings: ${(error as Error).message}`,
        undefined,
        error as Error
      );
    }
  }

  /**
   * Process a batch of chunks to generate embeddings
   * @param chunks Batch of document chunks
   * @returns Chunks with their embeddings
   */
  private async processBatch(
    chunks: DocumentChunk[]
  ): Promise<ChunkWithEmbedding[]> {
    const results: ChunkWithEmbedding[] = [];
    
    // Check cache for existing embeddings if caching is enabled
    let chunksToProcess = chunks;
    
    if (this.options.cacheEnabled) {
      const cachedResults = await this.getExistingEmbeddings(chunks);
      
      results.push(...cachedResults.cached);
      chunksToProcess = cachedResults.missing;
      
      if (!chunksToProcess.length) {
        return results;
      }
    }
    
    // Generate embeddings for chunks that aren't cached
    for (const chunk of chunksToProcess) {
      try {
        const embedding = await this.callEmbeddingAPI(chunk.content);
        
        // Store embedding in database
        const storedEmbedding = await this.storeEmbedding(chunk.id, embedding);
        
        results.push({
          ...chunk,
          embedding: storedEmbedding,
        });
      } catch (error) {
        console.error(`Error generating embedding for chunk ${chunk.id}:`, error);
        
        // Add the chunk without an embedding
        results.push({ ...chunk });
        
        // We don't throw here so we can continue processing other chunks
      }
    }
    
    return results;
  }

  /**
   * Call the Gemini API to generate an embedding for text
   * @param text Text to generate embedding for
   * @returns Vector embedding
   */
  private async callEmbeddingAPI(text: string, retryCount = 0): Promise<number[]> {
    try {
      // TODO: Replace with actual Gemini API call to generate embeddings
      // This is a placeholder that returns a random embedding vector
      // In production, this would call the Gemini API

      // Simulate API call
      await this.delay(200);
      
      // For development testing, generate a pseudo-random vector
      // In production, this would be replaced with the actual API call
      const dimension = this.getModelDimension(this.options.model as EmbeddingModel);
      const embedding = Array.from({ length: dimension }, () => Math.random() * 2 - 1);
      
      // Normalize the vector to unit length
      const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
      return embedding.map(val => val / magnitude);
    } catch (error) {
      if (retryCount < MAX_RETRIES) {
        // Exponential backoff
        const delay = Math.pow(2, retryCount) * 1000;
        await this.delay(delay);
        return this.callEmbeddingAPI(text, retryCount + 1);
      }
      
      throw new EmbeddingError(
        `Failed to generate embedding after ${MAX_RETRIES} retries: ${(error as Error).message}`,
        undefined,
        error as Error
      );
    }
  }

  /**
   * Get the embedding dimension for a model
   * @param model Embedding model
   * @returns Dimension of the embedding vector
   */
  private getModelDimension(model: EmbeddingModel): number {
    switch (model) {
      case 'openai':
        return 1536;
      case 'gemini':
        return 768;
      case 'custom':
      default:
        return 768;
    }
  }

  /**
   * Check for existing embeddings in the database
   * @param chunks Document chunks to check
   * @returns Object containing cached chunks and missing chunks
   */
  private async getExistingEmbeddings(
    chunks: DocumentChunk[]
  ): Promise<{
    cached: ChunkWithEmbedding[];
    missing: DocumentChunk[];
  }> {
    try {
      const chunkIds = chunks.map(chunk => chunk.id);
      
      const { data, error } = await this.supabase
        .from('embeddings')
        .select('*, chunk_id')
        .in('chunk_id', chunkIds);
      
      if (error) {
        throw error;
      }
      
      const embeddingsMap = new Map<string, DocumentEmbedding>();
      
      // Convert data to DocumentEmbedding objects and map by chunk_id
      for (const row of data) {
        const embedding: DocumentEmbedding = {
          id: row.id,
          chunk_id: row.chunk_id,
          embedding: row.embedding,
          model: row.model,
          created_at: row.created_at,
        };
        
        embeddingsMap.set(row.chunk_id, embedding);
      }
      
      // Separate chunks into cached and missing
      const cached: ChunkWithEmbedding[] = [];
      const missing: DocumentChunk[] = [];
      
      for (const chunk of chunks) {
        const embedding = embeddingsMap.get(chunk.id);
        
        if (embedding) {
          cached.push({ ...chunk, embedding });
        } else {
          missing.push(chunk);
        }
      }
      
      return { cached, missing };
    } catch (error) {
      console.error('Error checking for existing embeddings:', error);
      // If there's an error checking the cache, assume all need processing
      return { cached: [], missing: chunks };
    }
  }

  /**
   * Store an embedding in the database
   * @param chunkId ID of the chunk
   * @param embedding Vector embedding
   * @returns Stored embedding object
   */
  private async storeEmbedding(
    chunkId: string,
    embedding: number[]
  ): Promise<DocumentEmbedding> {
    try {
      const model = this.options.model || 'gemini';
      
      const { data, error } = await this.supabase
        .from('embeddings')
        .insert({
          chunk_id: chunkId,
          embedding,
          model,
        })
        .select()
        .single();
      
      if (error) {
        throw error;
      }
      
      return {
        id: data.id,
        chunk_id: data.chunk_id,
        embedding: data.embedding,
        model: data.model,
        created_at: data.created_at,
      };
    } catch (error) {
      throw new EmbeddingError(
        `Failed to store embedding: ${(error as Error).message}`,
        chunkId,
        error as Error
      );
    }
  }

  /**
   * Split an array into batches
   * @param items Array to split
   * @param batchSize Size of each batch
   * @returns Array of batches
   */
  private createBatches<T>(items: T[], batchSize: number): T[][] {
    const batches: T[][] = [];
    for (let i = 0; i < items.length; i += batchSize) {
      batches.push(items.slice(i, i + batchSize));
    }
    return batches;
  }

  /**
   * Create a delay using a promise
   * @param ms Milliseconds to delay
   * @returns Promise that resolves after the delay
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Singleton instance of the EmbeddingService
 */
export const embeddingService = new EmbeddingService(); 