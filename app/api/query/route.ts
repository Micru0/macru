import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createLLMRouter } from '@/lib/llmRouter';
import { getApiKey } from '@/lib/credentials';
import { VectorSearchService } from '@/lib/services/vector-search-service';
import { ContextAssembler } from '@/lib/services/context-assembler';
import { PromptFormatter } from '@/lib/services/prompt-formatter';
import { Database } from '@/lib/types/database.types';

// Initialize Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string;

// Query cache type
interface QueryCacheEntry {
  query: string;
  response: string;
  sources: any[];
  timestamp: number;
  userId: string | undefined;
}

// Simple in-memory cache for query results
// In production, this should be replaced with a more robust solution
const queryCache: Map<string, QueryCacheEntry> = new Map();

// Cache duration in milliseconds
const CACHE_DURATION = 60 * 60 * 1000; // 1 hour

export async function POST(request: NextRequest) {
  try {
    // Get the user ID from the session
    const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey);
    const { data: { session } } = await supabase.auth.getSession();
    const userId = session?.user?.id;

    // Parse the request
    const { 
      query, 
      filters = {}, 
      options = {}, 
      useCache = true 
    } = await request.json();

    // Validate query
    if (!query || typeof query !== 'string' || query.trim().length === 0) {
      return NextResponse.json(
        { error: 'Query is required and must be a non-empty string' },
        { status: 400 }
      );
    }

    // Check cache first
    const cacheKey = generateCacheKey(query, filters, userId);
    if (useCache) {
      const cachedResult = queryCache.get(cacheKey);
      if (cachedResult && isValidCache(cachedResult)) {
        return NextResponse.json({
          response: cachedResult.response,
          sources: cachedResult.sources,
          fromCache: true
        });
      }
    }

    // Initialize services
    const vectorSearchService = new VectorSearchService();
    const contextAssembler = new ContextAssembler();
    const promptFormatter = new PromptFormatter({
      promptType: options.promptType || 'rag'
    });

    // Get API key for the LLM
    const apiKey = getApiKey('gemini');
    if (!apiKey) {
      return NextResponse.json(
        { error: 'LLM API key not configured' },
        { status: 500 }
      );
    }

    // Initialize LLM router
    const llmRouter = createLLMRouter('gemini', apiKey);

    // Perform vector search to find relevant chunks
    const searchResults = await vectorSearchService.search(query, {
      limit: options.limit || 10,
      threshold: options.threshold || 0.7,
      filters: filters,
      userId: userId
    });

    // Log search result information
    console.log(`Found ${searchResults.length} relevant chunks for query: "${query}"`);

    // Assemble context from search results
    const assembledContext = await contextAssembler.assembleContext(
      searchResults,
      query
    );

    // Format prompt using assembled context
    const formattedPrompt = promptFormatter.formatPrompt(
      query,
      assembledContext
    );

    // Combine system message and user message if needed
    let fullPrompt = formattedPrompt.userMessage;
    if (formattedPrompt.systemMessage) {
      fullPrompt = `${formattedPrompt.systemMessage}\n\n${fullPrompt}`;
    }

    // Generate response from LLM
    const llmResponse = await llmRouter.generateText(
      fullPrompt,
      {
        temperature: options.temperature || 0.7,
        maxTokens: options.maxTokens || 1024
      }
    );

    // Process response to ensure proper source attribution
    // For now, we'll use the raw LLM response
    // In the future, this would be processed by the ResponseProcessor
    const response = llmResponse.text;

    // Construct sources information
    const sources = assembledContext.sources.map(source => ({
      id: source.id,
      title: source.title,
      type: source.document_type
    }));

    // Store in cache
    if (useCache) {
      queryCache.set(cacheKey, {
        query,
        response,
        sources,
        timestamp: Date.now(),
        userId
      });
    }

    // Return the response
    return NextResponse.json({
      response,
      sources,
      metadata: {
        tokenCount: llmResponse.usage.totalTokens,
        contextSize: assembledContext.tokenCount,
        chunksFound: searchResults.length,
        chunksUsed: assembledContext.usedChunks
      },
      fromCache: false
    });
  } catch (error) {
    console.error('Error processing query:', error);
    return NextResponse.json(
      { error: 'Failed to process query', details: (error as Error).message },
      { status: 500 }
    );
  }
}

/**
 * Generate a cache key for the query
 */
function generateCacheKey(query: string, filters: any, userId: string | undefined): string {
  const normalizedQuery = query.toLowerCase().trim();
  const filtersStr = JSON.stringify(filters);
  const userPart = userId || 'anonymous';
  
  return `${userPart}:${normalizedQuery}:${filtersStr}`;
}

/**
 * Check if a cache entry is still valid
 */
function isValidCache(cacheEntry: QueryCacheEntry): boolean {
  return Date.now() - cacheEntry.timestamp < CACHE_DURATION;
} 