import { NextRequest, NextResponse } from 'next/server';
import { LLMRouter, createLLMRouter } from '@/lib/llmRouter';
import { getApiKey } from '@/lib/credentials';
import { createClient as createServiceRoleClient } from '@supabase/supabase-js';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { embeddingService } from '@/lib/services/embedding-service';
import { TaskType } from '@google/generative-ai';
import { ResponseProcessor, SourceChunk, ProcessedResponse } from '@/lib/services/response-processor';
import { MemoryService } from '@/lib/services/memory-service';
import { MemoryItem, MemoryType, MemoryPriority } from '@/lib/types/memory';
import { performance } from 'perf_hooks';
import { memoryServiceServer } from '@/lib/services/memory-service-server';
import { cookies } from 'next/headers';

// Supabase configuration
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY as string;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string;

interface HistoryItem {
  role: 'user' | 'assistant';
  content: string;
}

// --- Basic In-Memory Cache ---
const queryCache = new Map<string, ProcessedResponse>();
// --- End Cache ---

export async function POST(request: Request) {
  const startTime = performance.now(); // Start total timer
  let userId: string | null = null;
  let embeddingTime = 0, searchTime = 0, memoryTime = 0, llmTime = 0, processingTime = 0;
  
  // Create response object early for cookie handling
  let response = NextResponse.next();

  try {
    // --- Get User ID (Server-side) --- 
    const cookieStore = await cookies(); 
    const supabaseUserClient = createServerClient(supabaseUrl, supabaseAnonKey, {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          // Set cookie on the request store 
          cookieStore.set({ name, value, ...options });
          // Also set cookie on the response object
          response.cookies.set({ name, value, ...options });
        },
        remove(name: string, options: CookieOptions) {
          // Remove cookie from the request store
          cookieStore.delete({ name, ...options });
          // Also remove cookie from the response object
          response.cookies.delete({ name, ...options });
        },
      },
    });
    
    console.log('[API LLM Test] Attempting supabase.auth.getUser()...');
    const { data: { user }, error: authError } = await supabaseUserClient.auth.getUser();
    userId = user?.id || null;
    if (authError) {
        console.error('[API LLM Test] Authentication error retrieving user:', authError);
        // Return a new response for the error
        return NextResponse.json({ error: "Authentication check failed", details: authError.message }, { status: 401 });
    }
    if (!userId) {
        console.warn('[API LLM Test] No authenticated user session found. Proceeding without user context.');
        // Decide if this should be an error or just a warning. For now, warning.
        // return NextResponse.json({ error: "Unauthorized", message: "No active session found." }, { status: 401 });
    } else {
        console.log(`[API LLM Test] User authenticated: ${userId}`);
    }
    // --- End Get User ID ---

    const { query, history = [] } = await request.json();

    if (!query) {
      return NextResponse.json({ error: "No query provided" }, { status: 400 });
    }

    // --- Cache Check ---
    const cacheKey = query.trim().toLowerCase(); // Simple cache key
    if (queryCache.has(cacheKey)) {
      const cachedResponse = queryCache.get(cacheKey);
      const endTime = performance.now();
      console.log(`[API Route - Cache Hit] Query: "${query.substring(0, 30)}...", Total Time: ${(endTime - startTime).toFixed(2)}ms`);
      return NextResponse.json({ response: cachedResponse });
    }
    console.log(`[API Route - Cache Miss] Query: "${query.substring(0, 30)}..."`);
    // --- End Cache Check ---

    // --- 1. Get Query Embedding ---
    const embedStartTime = performance.now();
    let queryEmbedding: number[];
    try {
      // --- REVERTED HARDCODING ---
      // console.log("[API Route] USING HARDCODED EMBEDDING FOR TESTING!");
      // queryEmbedding = [...]; // Removed hardcoded vector
      
      // --- Generate query embedding using RETRIEVAL_DOCUMENT task type ---
      console.log("[API Route] Generating query embedding using RETRIEVAL_DOCUMENT task type...");
      queryEmbedding = await embeddingService.generateEmbeddingForText(query, TaskType.RETRIEVAL_DOCUMENT); // Changed TaskType
      embeddingTime = performance.now() - embedStartTime;
      console.log(`[API Route] Generated query embedding (first 5 dims): [${queryEmbedding.slice(0, 5).join(', ')}, ...] (Total Dims: ${queryEmbedding.length})`);
    } catch (embeddingError) {
      console.error("[API Route] Error generating query embedding:", embeddingError);
      throw new Error("Failed to generate query embedding."); // Rethrow to be caught by main handler
    }

    // --- 2. Search Relevant Chunks --- 
    // Use Service Role Client for unrestricted DB access needed by match_documents
    const supabaseAdmin = createServiceRoleClient(supabaseUrl, supabaseServiceRoleKey);
    
    let retrievedChunks: SourceChunk[] = []; // Define with correct type
    const searchStartTime = performance.now();
    try {
      // Ensure userId is available before calling the RPC
      if (!userId) {
        console.warn("[API Route] Cannot call match_documents without a user ID.");
        // Handle this case appropriately, maybe return empty chunks or throw error?
        // For now, let's proceed but expect no user-specific results.
        // If your RLS requires user_id, this call will fail anyway without it.
      } else {
        console.log(`[API Route] Calling match_documents for user: ${userId}`);
      }

      const { data: matchData, error: matchError } = await supabaseAdmin.rpc(
        'match_documents', 
        {
          query_embedding: queryEmbedding, 
          match_threshold: 0.4, // Lowered threshold for testing
          match_count: 5,       
          filter_user_id: userId, // Added user ID filter
          filter_source_types: ['notion'] // Added source type filter
        }
      );

      if (matchError) {
        console.error("[API Route] Error calling match_documents function:", matchError);
        throw new Error(`Database error searching chunks: ${matchError.message}`);
      }

      // Map Supabase result to SourceChunk interface
      const sourceChunks: SourceChunk[] = (matchData || []).map((chunk: any) => ({
        documentId: chunk.document_id, // Ensure field names match DB function output
        documentName: chunk.document_title || 'Unknown Document', // Use document_title from SQL function
        chunkIndex: chunk.chunk_index, // Ensure field names match DB function output
        content: chunk.content,
        similarity: chunk.similarity,
        metadata: chunk.metadata || {},
      }));
      
      retrievedChunks = sourceChunks; // Store the typed chunks
      searchTime = performance.now() - searchStartTime;
      console.log(`[API Route] Found ${retrievedChunks.length} relevant chunks. Search Time: ${searchTime.toFixed(2)}ms`);
      
    } catch (searchError) {
      searchTime = performance.now() - searchStartTime; // Record time even on error
      console.error("[API Route] Error during chunk search:", searchError);
      // Don't necessarily fail the whole request, maybe proceed without context?
      // For now, let's log and continue, LLM might answer without context.
    }
    
    // --- 2.5 Get Relevant Memories --- 
    let retrievedMemories: MemoryItem[] = [];
    const memoryStartTime = performance.now();
    if (process.env.ENABLE_MEMORY_LAYER === 'true' && userId) { 
      try {
        retrievedMemories = await memoryServiceServer.getRelevantMemories(query, userId, 5);
        console.log(`[API Route] Retrieved ${retrievedMemories.length} relevant memories.`);
      } catch (memoryError) {
        console.error("[API Route] Error retrieving memories:", memoryError);
      }
    } else {
        console.log('[API Route] Memory retrieval skipped: Feature disabled or user not logged in.');
    }
    memoryTime = performance.now() - memoryStartTime;
    // --- End Get Relevant Memories ---

    // --- Filter Chunks if Query Targets Specific Document --- 
    let finalChunks = retrievedChunks;
    const specificDocQueryMatch = query.match(/^\s*(?:what is|what are|tell me about|summarize)\s+(?:the\s+)?(?:contents? of|document|page|file)\s*(?:called|named)?\s*['"“](.*?)['"”]/i);
    const specificTitle = specificDocQueryMatch?.[1]; // Extract title from query if match
    
    if (specificTitle) {
      console.log(`[API Route] Query seems to target specific document: "${specificTitle}"`);
      const filteredChunks = retrievedChunks.filter(chunk => 
        chunk.documentName?.toLowerCase() === specificTitle.toLowerCase()
      );
      
      if (filteredChunks.length > 0) {
        console.log(`[API Route] Filtering context to ${filteredChunks.length} chunks from document "${specificTitle}".`);
        finalChunks = filteredChunks; // Use only the filtered chunks
      } else {
        console.log(`[API Route] Specific document "${specificTitle}" mentioned, but no matching chunks found in retrieved set. Using all retrieved chunks.`);
        // Keep finalChunks as the original retrievedChunks
      }
    } else {
      console.log("[API Route] Query seems general. Using all retrieved chunks for context.");
      // Keep finalChunks as the original retrievedChunks
    }
    // --- End Filtering Chunks --- 

    // --- 3. Assemble Contexts --- 
    // Include metadata with chunk content
    const documentContext = finalChunks
      .map(chunk => {
          // Basic formatting for metadata
          let metadataString = `Source Document: ${chunk.documentName} (ID: ${chunk.documentId}, Chunk: ${chunk.chunkIndex})`;
          if (chunk.metadata) {
              if (chunk.metadata.url) metadataString += `\nURL: ${chunk.metadata.url}`;
              if (chunk.metadata.parentType) metadataString += `\nParent Type: ${chunk.metadata.parentType}`;
              if (chunk.metadata.parentId) metadataString += `\nParent ID: ${chunk.metadata.parentId}`;
              // Add other relevant metadata fields if needed
          }
          return `--- Chunk Start ---\n[Metadata]\n${metadataString}\n\n[Content]\n${chunk.content}\n--- Chunk End ---`;
      })
      .join("\n\n"); // Separate chunks clearly
      
    const memoryContext = retrievedMemories
      .map(mem => `[Memory: ${mem.type} - ${new Date(mem.created_at).toLocaleDateString()}] ${mem.content}`)
      .join("\n\n"); 
    
    // Optional: Log partial context for debugging
    // console.log(`[API Route] Context snippet: ${context.substring(0, 200)}...`); 

    // Get the Gemini API Key
    const apiKey = getApiKey('gemini');
    
    if (!apiKey) {
      return NextResponse.json({ error: "Gemini API key not configured" }, { status: 500 });
    }
    
    // Initialize the LLM router with the Gemini provider
    const router = createLLMRouter('gemini', apiKey);

    // --- 4. Format Final Prompt --- 
    const formattedPrompt = formatPromptWithHistoryAndContext(
      query, 
      history, 
      documentContext, // Pass document context
      memoryContext   // Pass memory context
    );
    // Optional: Log final prompt (can be long)
    // console.log("[API Route] Final prompt:", formattedPrompt);

    // --- 5. Generate a response --- 
    const llmStartTime = performance.now();
    const llmResponse = await router.generate(formattedPrompt, {
      temperature: 0.7,
      maxTokens: 1024,
    });
    llmTime = performance.now() - llmStartTime;

    // --- Handle potential Action Request --- 
    if (llmResponse.actionRequest) {
      const actionRequest = llmResponse.actionRequest;
      console.log(`[API Route] LLM proposed action: ${actionRequest.type}`, actionRequest.parameters);
      // TODO: In a real application, send this actionRequest back to the client 
      //       for confirmation before sending to /api/action.
      // For now, return a message indicating action proposal.
      const endTime = performance.now();
      console.log(`[API Route - Action Proposed] Total Time: ${(endTime - startTime).toFixed(2)}ms`);
      const actionResponse = {
        response: {
          text: `The assistant proposed an action: ${actionRequest.type}. Confirmation UI not yet implemented.`,
          citations: [], // No citations for action proposals
          hasSourceAttribution: false,
        },
        proposedAction: actionRequest, // Optionally send the action back for testing
      };
      // Use the potentially modified response object
      response = NextResponse.json(actionResponse);
      // TODO: Manually copy cookies if necessary
      return response;
    }

    // --- Proceed with text response processing if no action proposed ---
    if (llmResponse.text === undefined) {
        // This should ideally not happen if actionRequest is also null, but handle defensively
        throw new Error("LLM response contained neither text nor an action request.");
    }

    // --- 6. Process Response and Add Citations --- 
    const processingStartTime = performance.now();
    const responseProcessor = new ResponseProcessor();
    const processedResponse: ProcessedResponse = responseProcessor.processResponse(
      llmResponse.text, // Pass the raw LLM text
      finalChunks // Use the potentially filtered chunks for citation
    );
    processingTime = performance.now() - processingStartTime;

    // --- 7. Cache Store ---
    queryCache.set(cacheKey, processedResponse);
    // --- End Cache Store ---

    const endTime = performance.now();
    const totalTime = endTime - startTime;
    // Update log to remove autoMemTime
    console.log(`[API Route - Success] Total Time: ${totalTime.toFixed(2)}ms (Embed: ${embeddingTime.toFixed(2)}ms, Search: ${searchTime.toFixed(2)}ms, Memory: ${memoryTime.toFixed(2)}ms, LLM: ${llmTime.toFixed(2)}ms, Process: ${processingTime.toFixed(2)}ms)`);

    // Use the potentially modified response object
    response = NextResponse.json({ response: processedResponse });
    // TODO: Manually copy cookies if necessary
    return response;
  } catch (error: any) {
    const endTime = performance.now(); // End total timer even on error
    const totalTime = endTime - startTime;
    console.error(`[API Route - Error] Total Time: ${totalTime.toFixed(2)}ms`, error);
    // Return a new response for the error
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}

// Updated function to include both document and memory context
function formatPromptWithHistoryAndContext(
  query: string, 
  history: HistoryItem[],
  documentContext: string,
  memoryContext: string // Added memory context
): string {
  const formattedHistory = history.length > 0 
    ? history.map(item => {
        const role = item.role === 'user' ? 'User' : 'Assistant';
        return `${role}: ${item.content}`;
      }).join('\n\n') + '\n\n' 
    : '';

  const docContextSection = documentContext.trim().length > 0
    ? `## Relevant Document Context:\n${documentContext}\n\n` // Use Markdown heading
    : '';

  const memContextSection = memoryContext.trim().length > 0
    ? `## Relevant Personal Memory Context:\n${memoryContext}\n\n` // Use Markdown heading
    : '';

  // More general but clear instructions
  return (
    `You are a helpful and professional assistant. Respond concisely using clear Markdown formatting. `
    + `Use the provided context (documents with metadata, memory) to answer the user's query accurately. `
    + `If the query seems to refer to a specific document or topic within the context (e.g., a Notion page), structure your response logically: `
    + `  - Start with a clear heading for the main topic (e.g., using '**Title**' or '### Title'). `
    + `  - Summarize the key information from the context related to that topic. `
    + `  - If the context indicates a hierarchy (like child pages in Notion, identified by '[Child Page: ...]' markers or metadata), represent this clearly, perhaps using nested bullet points or subheadings for children. Summarize child content briefly. `
    + `  - Example for Hierarchy: \n    **Parent Page Title**\n    [Summary of parent content]...\n    *   **Child Page 1 Title**: [Brief summary]...\n    *   **Child Page 2 Title**: [Brief summary]...\n` // Provide a clearer example
    + `For general questions, synthesize information from all relevant context sources professionally. `
    + `ALWAYS cite the source document name(s) or memory type when appropriate, but DO NOT include internal IDs or raw chunk indices. `
    + `If the context does not contain the answer, state that clearly. Do not invent information. \n\n`
    + `${formattedHistory}${memContextSection}${docContextSection}`
    + `User: ${query}\n\n`
    + `Assistant:`
  );
} 