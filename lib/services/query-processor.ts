/**
 * QueryProcessor
 * 
 * This service orchestrates the Cache-Augmented Generation (CAG) query processing pipeline,
 * coordinating vector search, context assembly, prompt formatting, and LLM generation.
 */

import { VectorSearchService, VectorSearchOptions, SearchResult } from './vector-search-service';
import { ContextAssembler, ContextAssemblyOptions, AssembledContext } from './context-assembler';
import { PromptFormatter, PromptFormatterOptions, FormattedPrompt } from './prompt-formatter';
import { createLLMRouter, LLMRequestOptions, LLMResponse } from '../llmRouter';
import { getApiKey } from '../credentials';

/**
 * Error type for query processing errors
 */
export class QueryProcessingError extends Error {
  constructor(
    message: string,
    public readonly stage?: 'search' | 'assembly' | 'formatting' | 'generation',
    public readonly cause?: Error
  ) {
    super(message);
    this.name = 'QueryProcessingError';
  }
}

/**
 * Options for query processing
 */
export interface QueryProcessingOptions {
  userId?: string;                      // User ID for filtering results
  searchOptions?: VectorSearchOptions;  // Options for vector search
  assemblyOptions?: ContextAssemblyOptions; // Options for context assembly
  promptOptions?: PromptFormatterOptions;   // Options for prompt formatting
  llmOptions?: LLMRequestOptions;           // Options for LLM generation
  cacheEnabled?: boolean;               // Whether to use caching
  cacheTtl?: number;                    // Time-to-live for cache entries (in seconds)
  useCitations?: boolean;               // Whether to include citations
  debugMode?: boolean;                  // Whether to include debug information
}

/**
 * Default query processing options
 */
const DEFAULT_QUERY_OPTIONS: QueryProcessingOptions = {
  searchOptions: {
    limit: 15,
    threshold: 0.7
  },
  assemblyOptions: {
    maxTokens: 6000,
    reservedTokens: 1000,
    chunkOverlapStrategy: 'truncate',
    prioritizeStrategy: 'similarity'
  },
  promptOptions: {
    promptType: 'rag',
    citationStyle: 'inline',
    includeSourceDetails: true
  },
  llmOptions: {
    temperature: 0.7,
    maxTokens: 1000
  },
  cacheEnabled: true,
  cacheTtl: 3600,
  useCitations: true,
  debugMode: false
};

/**
 * Cache entry for query results
 */
interface CacheEntry {
  result: QueryResult;
  timestamp: number;
  ttl: number;
}

/**
 * Result of query processing
 */
export interface QueryResult {
  query: string;
  content: string;
  sources: {
    id: string;
    title: string;
    content: string;
    document_type?: string;
  }[];
  metadata: {
    processingTime: number;
    searchTime?: number;
    assemblyTime?: number;
    llmTime?: number;
    totalTokens?: number;
    promptTokens?: number;
    completionTokens?: number;
    cacheHit?: boolean;
  };
  debug?: {
    searchResults?: SearchResult[];
    assembledContext?: AssembledContext;
    formattedPrompt?: FormattedPrompt;
    llmResponse?: LLMResponse;
  };
}

/**
 * QueryProcessor for processing user queries with CAG
 */
export class QueryProcessor {
  private vectorSearch: VectorSearchService;
  private contextAssembler: ContextAssembler;
  private promptFormatter: PromptFormatter;
  private options: QueryProcessingOptions;
  private cache: Map<string, CacheEntry> = new Map();

  /**
   * Create a new QueryProcessor instance
   * @param options Options for query processing
   */
  constructor(options: QueryProcessingOptions = {}) {
    this.options = { ...DEFAULT_QUERY_OPTIONS, ...options };
    this.vectorSearch = new VectorSearchService();
    this.contextAssembler = new ContextAssembler(this.options.assemblyOptions);
    this.promptFormatter = new PromptFormatter(this.options.promptOptions);
  }

  /**
   * Process a user query
   * @param query User query
   * @returns Query result
   */
  async processQuery(query: string): Promise<QueryResult> {
    const startTime = Date.now();
    const cacheKey = this.generateCacheKey(query);

    try {
      // Check cache if enabled
      if (this.options.cacheEnabled) {
        const cachedResult = this.checkCache(cacheKey);
        if (cachedResult) {
          return {
            ...cachedResult,
            metadata: {
              ...cachedResult.metadata,
              cacheHit: true,
              processingTime: Date.now() - startTime
            }
          };
        }
      }

      // 1. Perform vector search
      const searchStartTime = Date.now();
      let searchResults: SearchResult[] = [];
      
      try {
        searchResults = await this.vectorSearch.search(query, {
          ...this.options.searchOptions,
          userId: this.options.userId
        });
      } catch (error) {
        throw new QueryProcessingError(
          `Vector search failed: ${(error as Error).message}`,
          'search',
          error as Error
        );
      }
      
      const searchTime = Date.now() - searchStartTime;

      // 2. Assemble context
      const assemblyStartTime = Date.now();
      let assembledContext: AssembledContext;
      
      try {
        assembledContext = await this.contextAssembler.assembleContext(
          searchResults,
          query
        );
      } catch (error) {
        throw new QueryProcessingError(
          `Context assembly failed: ${(error as Error).message}`,
          'assembly',
          error as Error
        );
      }
      
      const assemblyTime = Date.now() - assemblyStartTime;

      // 3. Format prompt
      let formattedPrompt: FormattedPrompt;
      
      try {
        formattedPrompt = this.promptFormatter.formatPrompt(
          query,
          assembledContext
        );
      } catch (error) {
        throw new QueryProcessingError(
          `Prompt formatting failed: ${(error as Error).message}`,
          'formatting',
          error as Error
        );
      }

      // 4. Generate response with LLM
      const llmStartTime = Date.now();
      let llmResponse: LLMResponse;
      
      try {
        const apiKey = getApiKey('gemini');
        
        if (!apiKey) {
          throw new Error('No API key found for Gemini LLM');
        }
        
        const llmRouter = createLLMRouter('gemini', apiKey);
        
        llmResponse = await llmRouter.generateText(
          formattedPrompt.userMessage,
          {
            ...this.options.llmOptions,
            user: this.options.userId // For tracking purposes
          }
        );
      } catch (error) {
        throw new QueryProcessingError(
          `LLM generation failed: ${(error as Error).message}`,
          'generation',
          error as Error
        );
      }
      
      const llmTime = Date.now() - llmStartTime;

      // 5. Prepare result
      const result: QueryResult = {
        query,
        content: llmResponse.text,
        sources: formattedPrompt.sources,
        metadata: {
          processingTime: Date.now() - startTime,
          searchTime,
          assemblyTime,
          llmTime,
          totalTokens: llmResponse.usage?.totalTokens,
          promptTokens: llmResponse.usage?.promptTokens,
          completionTokens: llmResponse.usage?.completionTokens,
          cacheHit: false
        }
      };

      // Add debug information if enabled
      if (this.options.debugMode) {
        result.debug = {
          searchResults,
          assembledContext,
          formattedPrompt,
          llmResponse
        };
      }

      // Cache result if enabled
      if (this.options.cacheEnabled) {
        this.cacheResult(cacheKey, result);
      }

      return result;
    } catch (error) {
      if (error instanceof QueryProcessingError) {
        throw error;
      }
      throw new QueryProcessingError(
        `Query processing failed: ${(error as Error).message}`,
        undefined,
        error as Error
      );
    }
  }

  /**
   * Generate a cache key for a query
   * @param query User query
   * @returns Cache key
   */
  private generateCacheKey(query: string): string {
    // Normalize query by trimming whitespace and converting to lowercase
    const normalizedQuery = query.trim().toLowerCase();
    
    // In a real implementation, we might include user ID, search options, etc.
    return `query:${normalizedQuery}:user:${this.options.userId || 'anonymous'}`;
  }

  /**
   * Check if a query is cached
   * @param cacheKey Cache key
   * @returns Cached result or undefined
   */
  private checkCache(cacheKey: string): QueryResult | undefined {
    const cached = this.cache.get(cacheKey);
    
    if (!cached) {
      return undefined;
    }
    
    // Check if cache entry is expired
    const now = Date.now();
    if (now - cached.timestamp > cached.ttl * 1000) {
      this.cache.delete(cacheKey);
      return undefined;
    }
    
    return cached.result;
  }

  /**
   * Cache a query result
   * @param cacheKey Cache key
   * @param result Query result
   */
  private cacheResult(cacheKey: string, result: QueryResult): void {
    this.cache.set(cacheKey, {
      result,
      timestamp: Date.now(),
      ttl: this.options.cacheTtl || DEFAULT_QUERY_OPTIONS.cacheTtl || 3600
    });
    
    // Prune cache if it gets too large (over 100 entries)
    if (this.cache.size > 100) {
      this.pruneCache();
    }
  }

  /**
   * Prune expired cache entries
   */
  private pruneCache(): void {
    const now = Date.now();
    
    // Remove expired entries
    const entries = Array.from(this.cache);
    for (const [key, entry] of entries) {
      if (now - entry.timestamp > entry.ttl * 1000) {
        this.cache.delete(key);
      }
    }
    
    // If still too large, remove oldest entries
    if (this.cache.size > 100) {
      const entriesForSorting = Array.from(this.cache.entries());
      entriesForSorting.sort((a, b) => a[1].timestamp - b[1].timestamp);
      
      // Remove oldest entries until we're under 80 entries (20% reduction)
      const toRemove = entriesForSorting.slice(0, entriesForSorting.length - 80);
      for (const [key] of toRemove) {
        this.cache.delete(key);
      }
    }
  }
} 