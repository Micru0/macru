/**
 * EmbeddingService
 * 
 * This service is responsible for generating and managing embeddings
 * for document chunks using the Gemini API.
 */

import { createClient } from '@supabase/supabase-js';
import { GoogleGenerativeAI, TaskType } from '@google/generative-ai'; // Import SDK
import { ChunkWithEmbedding, DocumentChunk, DocumentEmbedding, EmbeddingModel } from '../types/document';
import { Database } from '../types/database.types';
import { getApiKey } from '@/lib/credentials'; // Import credential helper

// Use non-prefixed variables for server-side initialization
const supabaseUrl = process.env.SUPABASE_URL as string;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY as string;

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
  private genAI: GoogleGenerativeAI | null = null; // Add Gemini client instance

  /**
   * Create a new EmbeddingService instance
   * @param options Configuration options for the embedding service
   */
  constructor(options: EmbeddingOptions = {}) {
    this.options = { ...DEFAULT_EMBEDDING_OPTIONS, ...options };
    
    // Check for required server-side variables
    if (!supabaseUrl) {
      // Throw immediately if URL is missing, as client creation will fail
      throw new Error('SUPABASE_URL is not set, cannot initialize EmbeddingService.');
    }
    if (!supabaseServiceRoleKey) {
      console.warn('WARNING: SUPABASE_SERVICE_ROLE_KEY is not set for EmbeddingService. RLS could block embedding storage if not configured properly.');
      // We might allow continuation if RLS/anon key is sufficient for some operations,
      // but storing embeddings usually requires service_role.
    }
    
    // Initialize with potentially null service key, relying on Supabase client/API errors later if needed
    this.supabase = createClient<Database>(supabaseUrl, supabaseServiceRoleKey);

    // Initialize Gemini client
    const geminiApiKey = getApiKey('gemini');
    if (geminiApiKey) {
      this.genAI = new GoogleGenerativeAI(geminiApiKey);
    } else {
      console.error('ERROR: Gemini API key not found. Embedding generation will fail.');
    }
  }

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
    const chunkIds = chunks.map((chunk) => chunk.id);
    const cached: ChunkWithEmbedding[] = [];
    const missing: DocumentChunk[] = [];

    try {
      const { data, error } = await this.supabase
        .from('embeddings')
        .select('chunk_id, embedding, model') // Select model too
        .in('chunk_id', chunkIds);

      if (error) {
        console.error('[EmbeddingService] Error fetching existing embeddings:', error);
        // If fetch fails, assume all are missing
        return { cached: [], missing: chunks };
      }

      const foundEmbeddings = new Map<string, { embedding: number[]; model: string }>();
      data.forEach(item => {
        let parsedEmbedding: number[] | null = null;
        if (typeof item.embedding === 'string') {
          try {
            parsedEmbedding = JSON.parse(item.embedding);
            if (!Array.isArray(parsedEmbedding) || !parsedEmbedding.every(n => typeof n === 'number')) {
                console.warn(`[EmbeddingService] Invalid embedding format retrieved for chunk ${item.chunk_id}. Skipping.`);
                parsedEmbedding = null;
            }
          } catch (parseError) {
            console.error(`[EmbeddingService] Error parsing stored embedding for chunk ${item.chunk_id}:`, parseError);
            parsedEmbedding = null;
          }
        } else if (item.embedding === null) {
             console.warn(`[EmbeddingService] Null embedding found for chunk ${item.chunk_id}`);
        } else {
            // Handle unexpected types if necessary, for now treat as null
            console.warn(`[EmbeddingService] Unexpected embedding type (${typeof item.embedding}) found for chunk ${item.chunk_id}`);
            parsedEmbedding = null;
        }

        if (parsedEmbedding) { // Only add if parsing was successful
          foundEmbeddings.set(item.chunk_id, {
            embedding: parsedEmbedding, 
            model: item.model || 'unknown' // Provide default for model
          });
        }
      });

      chunks.forEach(chunk => {
        const found = foundEmbeddings.get(chunk.id);
        if (found) {
          cached.push({ ...chunk, embedding: found }); // Push ChunkWithEmbedding
        } else {
          missing.push(chunk);
        }
      });

    } catch (error) {
      console.error('[EmbeddingService] Error processing existing embeddings:', error);
      // Fallback: assume all chunks are missing
      return { cached: [], missing: chunks };
    }

    return { cached, missing };
  }

  /**
   * Store an embedding in the database
   * @param chunkId ID of the related chunk
   * @param embedding Vector embedding
   * @returns The stored embedding data
   */
  private async storeEmbedding(
    chunkId: string,
    embedding: number[]
  ): Promise<DocumentEmbedding> {
    const embeddingString = JSON.stringify(embedding); // Convert array to string
    const modelName = this.options.model || 'unknown'; // Get model name

    try {
      const { data, error } = await this.supabase
        .from('embeddings')
        .insert({
          chunk_id: chunkId,
          embedding: embeddingString, // Store as string
          model: modelName // Store model name
        })
        .select()
        .single();

      if (error) {
        throw new EmbeddingError(`Failed to store embedding for chunk ${chunkId}: ${error.message}`, chunkId, error);
      }
      if (!data) {
          throw new EmbeddingError(`No data returned after storing embedding for chunk ${chunkId}`, chunkId);
      }

      // Parse the embedding string back for the return type if needed, or adjust return type
      // For now, assume DocumentEmbedding expects number[] and parse it back
      let parsedEmbedding: number[] | null = null;
      if (typeof data.embedding === 'string') {
          try {
              parsedEmbedding = JSON.parse(data.embedding);
          } catch { /* ignore parse error on return */ }
      }

      return {
        id: data.id,
        chunk_id: data.chunk_id,
        embedding: parsedEmbedding || [], // Return number[] or empty array
        model: data.model || 'unknown', // Provide default
        created_at: data.created_at || new Date().toISOString(),
      };

    } catch (error) {
      if (error instanceof EmbeddingError) throw error;
      throw new EmbeddingError(
        `Unexpected error storing embedding for chunk ${chunkId}: ${(error as Error).message}`,
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