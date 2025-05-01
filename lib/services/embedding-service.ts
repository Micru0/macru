/**
 * EmbeddingService
 * 
 * This service is responsible for generating and managing embeddings
 * for document chunks using the Gemini API.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { GoogleGenerativeAI, TaskType } from '@google/generative-ai'; // Import SDK
import { ChunkWithEmbedding, DocumentChunk, DocumentEmbedding, EmbeddingModel } from '../types/document';
import { Database } from '../types/database.types';
import { getApiKey } from '@/lib/credentials'; // Import credential helper

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
  private supabaseClient: SupabaseClient<Database> | null = null; // Store the client instance
  private genAI: GoogleGenerativeAI | null = null; // Add Gemini client instance

  /**
   * Create a new EmbeddingService instance
   * @param options Configuration options for the embedding service
   */
  constructor(options: EmbeddingOptions = {}) {
    this.options = { ...DEFAULT_EMBEDDING_OPTIONS, ...options };
    
    // Initialize Gemini client (can stay here if GOOGLE_API_KEY is build-time or handled by getApiKey)
    const geminiApiKey = getApiKey('gemini');
    if (geminiApiKey) {
      this.genAI = new GoogleGenerativeAI(geminiApiKey);
    } else {
      console.error('ERROR: Gemini API key not found. Embedding generation will fail.');
      // Consider throwing an error here if Gemini is absolutely essential at construction
    }
  }

  // --- ADD LAZY INITIALIZER FOR SUPABASE CLIENT ---
  private getSupabaseClient(): SupabaseClient<Database> {
    if (!this.supabaseClient) {
      const url = process.env.SUPABASE_URL;
      const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

      if (!url) {
        throw new Error('SUPABASE_URL environment variable is not set.');
      }
      if (!serviceKey) {
        // Maybe throw or just warn depending on required operations
        console.warn('SUPABASE_SERVICE_ROLE_KEY environment variable is not set. Operations requiring service role may fail.');
        // Potentially fall back to anon key if that's useful?
        // For embedding storage, service role is likely needed.
        // throw new Error('SUPABASE_SERVICE_ROLE_KEY environment variable is not set.'); 
      }

      this.supabaseClient = createClient<Database>(url, serviceKey || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''); // Fallback to anon key if service key is missing, though likely insufficient
    }
    return this.supabaseClient;
  }
  // --- END LAZY INITIALIZER ---

  /**
   * Generate an embedding for a single text string
   * @param text Text to generate embedding for
   * @returns Vector embedding
   */
  async generateEmbeddingForText(text: string, taskType: TaskType = TaskType.RETRIEVAL_DOCUMENT): Promise<number[]> {
    try {
      // Use the same method as in callEmbeddingAPI but for a single string
      return await this.callEmbeddingAPI(text, taskType);
    } catch (error) {
      throw new EmbeddingError(
        `Failed to generate embedding for text: ${(error as Error).message}`,
        undefined,
        error as Error
      );
    }
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
  private async callEmbeddingAPI(text: string, taskType: TaskType = TaskType.RETRIEVAL_DOCUMENT, retryCount = 0): Promise<number[]> {
    if (!this.genAI) {
      throw new EmbeddingError("Gemini client not initialized due to missing API key.");
    }

    // Clean the input text (remove excessive newlines, etc.)
    const cleanedText = text.replace(/\n{2,}/g, '\n').trim();
    if (!cleanedText) {
      console.warn("[EmbeddingService] Attempted to embed empty or whitespace-only text. Returning zero vector.");
      // Return a zero vector of the correct dimension
      const dimension = this.getModelDimension(this.options.model as EmbeddingModel);
      return Array(dimension).fill(0);
    }

    try {
      // Use Gemini API for embeddings
      const model = this.genAI.getGenerativeModel({ model: "text-embedding-004" });
      
      const result = await model.embedContent({
        content: { role: "user", parts: [{ text: cleanedText }] },
        taskType: taskType,
      });

      const embedding = result.embedding;
      if (!embedding || !embedding.values) {
        throw new Error("Gemini API returned no embedding values.");
      }
      
      // Debug log for dimension check
      // console.log(`[EmbeddingService] Generated embedding dimension: ${embedding.values.length}`);

      return embedding.values;

    } catch (error: any) {
      console.error(`[EmbeddingService] Gemini API error (attempt ${retryCount + 1}/${MAX_RETRIES + 1}):`, error);
      if (retryCount < MAX_RETRIES) {
        const delay = Math.pow(2, retryCount) * 1500; // Increase base delay slightly
        console.log(`[EmbeddingService] Retrying embedding generation in ${delay}ms...`);
        await this.delay(delay);
        return this.callEmbeddingAPI(cleanedText, taskType, retryCount + 1);
      }
      
      throw new EmbeddingError(
        `Failed to generate embedding after ${MAX_RETRIES + 1} attempts: ${error.message || 'Unknown Gemini API error'}`,
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
    const supabase = this.getSupabaseClient();
    const chunkIds = chunks.map(chunk => chunk.id);
    const chunkMap = new Map(chunks.map(chunk => [chunk.id, chunk]));
    const cachedEmbeddings = new Map<string, ChunkWithEmbedding>(); // Initialize the Map
    const missingChunks: DocumentChunk[] = [];

    // Batch requests to avoid hitting URL length limits or query complexity limits
    const batchSize = 200; // Adjust batch size as needed
    for (let i = 0; i < chunkIds.length; i += batchSize) {
        const batch = chunkIds.slice(i, i + batchSize);
        if (batch.length === 0) continue;

        const { data, error } = await supabase
          .from('embeddings')
          .select('chunk_id, embedding, created_at, model')
          .in('chunk_id', batch);

        if (error) {
          console.error(
            `[EmbeddingService] Error fetching existing embeddings for batch: ${error.message}`
          );
          // Add all chunks in this batch to missing and continue
          batch.forEach(chunkId => {
            const originalChunk = chunkMap.get(chunkId);
            if (originalChunk) {
              missingChunks.push(originalChunk);
            }
          });
          continue; // Skip processing this batch further
        }

        data?.forEach((record: any) => {
          const chunkId = record.chunk_id;
          const originalChunk = chunkMap.get(chunkId);
          let parsedEmbedding: number[] | null = null;
          // Attempt to parse the embedding string from DB
          if (typeof record.embedding === 'string') {
            try {
                parsedEmbedding = JSON.parse(record.embedding.replace(/\\/g, '')); // Attempt to parse JSON array string
            } catch (e) {
                console.warn(`[EmbeddingService] Failed to parse cached embedding for chunk ${chunkId}, will regenerate.`);
            }
          }

          if (originalChunk && parsedEmbedding) {
            // Construct the DocumentEmbedding object for the cached item
            const cachedEmbeddingObject: DocumentEmbedding = {
                id: 'cached-' + chunkId, // Placeholder ID for cached
                chunk_id: chunkId,
                embedding: parsedEmbedding, // Use the parsed number array
                created_at: record.created_at || new Date().toISOString(), // Provide default
                model: record.model || 'unknown', // Provide default
            };
            cachedEmbeddings.set(chunkId, {
              ...originalChunk,
              embedding: cachedEmbeddingObject, // Assign the full object
            });
          } else if (originalChunk && !missingChunks.some(c => c.id === chunkId)) {
            // If embedding is null/missing/unparseable in DB, mark as missing
             missingChunks.push(originalChunk);
          }
        });

        // Add chunks from this batch that weren't found in the cache to missingChunks
        batch.forEach(chunkId => {
          if (!cachedEmbeddings.has(chunkId) && chunkMap.has(chunkId) && !missingChunks.some(c => c.id === chunkId)) {
              const originalChunk = chunkMap.get(chunkId);
              if(originalChunk) missingChunks.push(originalChunk);
          }
        });
    }

    return {
      cached: Array.from(cachedEmbeddings.values()),
      missing: missingChunks, // Return the missing chunks array
    };
  }

  /**
   * Store an embedding in the database
   * @param chunkId ID of the chunk the embedding belongs to
   * @param embedding Vector embedding
   * @returns Stored embedding object
   */
  private async storeEmbedding(
    chunkId: string,
    embedding: number[]
  ): Promise<DocumentEmbedding> {
    const supabase = this.getSupabaseClient();
    const embeddingModel = this.options.model || 'gemini'; // Use configured model

    // Convert number[] to string format expected by pgvector (e.g., '[1,2,3]')
    const embeddingString = JSON.stringify(embedding);

    const { data, error } = await supabase
      .from('embeddings')
      .insert({
        chunk_id: chunkId,
        embedding: embeddingString, // Store as string
        model: embeddingModel,
      })
      .select()
      .single();

    if (error) {
      console.error(`[EmbeddingService] Error storing embedding for chunk ${chunkId}:`, error);
      throw new EmbeddingError(
        `Failed to store embedding for chunk ${chunkId}: ${error.message}`,
        chunkId,
        error
      );
    }

    if (!data) {
      throw new EmbeddingError(
        `Failed to store embedding for chunk ${chunkId}: No data returned after insert.`,
        chunkId
      );
    }
    
    // Parse the string back into number[] for the return type
    let parsedEmbedding: number[];
    try {
        parsedEmbedding = JSON.parse(data.embedding || '[]');
    } catch (e) {
        console.error(`[EmbeddingService] Failed to parse embedding returned from DB for chunk ${chunkId}.`);
        parsedEmbedding = []; // Fallback to empty array
    }

    // Construct the return object matching DocumentEmbedding type
    return {
        id: data.id,
        chunk_id: data.chunk_id,
        embedding: parsedEmbedding,
        model: data.model || 'unknown', // Provide default if null
        created_at: data.created_at || new Date().toISOString() // Provide default if null
    };
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