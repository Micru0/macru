import { NextRequest, NextResponse } from 'next/server';
import { LLMRouter, createLLMRouter } from '@/lib/llmRouter';
import { getApiKey } from '@/lib/credentials';
import { createClient as createServiceRoleClient } from '@supabase/supabase-js';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { embeddingService } from '@/lib/services/embedding-service';
import { TaskType } from '@google/generative-ai';
import { ResponseProcessor, SourceChunk, ProcessedResponse, Source } from '@/lib/services/response-processor';
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

      // --- Query Parsing for Source Type ---
      let filterSourceTypes: string[] | null = null;
      const queryLower = query.toLowerCase();
      if (/\bnotion\s+(documents?|pages?|notes?)\b/.test(queryLower) || queryLower.includes('notion source')) {
        filterSourceTypes = ['notion'];
        console.log("[API Route] Query identified as targeting Notion documents.");
      } else if (/\b(my|uploaded)\s+files?\b/.test(queryLower) || queryLower.includes('file source')) {
        filterSourceTypes = ['file_upload'];
         console.log("[API Route] Query identified as targeting uploaded files.");
      }
      // Add more rules here for other types like 'calendar events', 'emails', etc.
      // --- End Query Parsing ---

      const { data: matchData, error: matchError } = await supabaseAdmin.rpc(
        'match_documents', 
        {
          query_embedding: queryEmbedding,
          match_threshold: 0.4, // Lowered threshold for testing
          match_count: 5,
          filter_user_id: userId, // Added user ID filter
          // Pass the detected source type filter, or null if none detected
          filter_source_types: filterSourceTypes 
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
        documentType: chunk.document_type // Added documentType mapping
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
    // Regex v4: Tries to capture after 'called'/'named' OR within quotes
    const specificDocQueryMatch = query.match(/^.*\b(?:called|named)\s+['"“]?(.+?)['"”]?(\s+on\s+\w+)?\s*$|.*?['"“](.+?)['"”](\s+on\s+\w+)?\s*$/i);
    
    let potentialTitle: string | undefined = undefined;
    let potentialSuffix: string | undefined = undefined;

    if (specificDocQueryMatch) {
      // Check capture group 1 (after called/named) or group 3 (in quotes)
      potentialTitle = specificDocQueryMatch[1] || specificDocQueryMatch[3];
      // Check capture group 2 or group 4 for the suffix
      potentialSuffix = specificDocQueryMatch[2] || specificDocQueryMatch[4]; 
    }

    let specificTitle: string | undefined = undefined;
    if (potentialTitle) {
      // Clean the extracted title
      specificTitle = potentialTitle.trim(); 
      // 1. Remove optional suffix like " on Notion"
      specificTitle = specificTitle.replace(/\s+on\s+\w+\s*$/i, '').trim(); 
      // 2. Remove trailing punctuation like ?, !, .
      specificTitle = specificTitle.replace(/[?!.]+\s*$/, '').trim();
      console.log(`[API Route] Query seems to target specific document. Extracted Title: "${specificTitle}" (Cleaned)`);
    } 
    
    // --- Start Original Filtering Block (Modified) ---
    if (specificTitle) {
      // Use the CLEANED specificTitle for filtering
      const filteredChunks = retrievedChunks.filter(chunk => 
        chunk.documentName?.toLowerCase() === specificTitle?.toLowerCase()
      );
      
      if (filteredChunks.length > 0) {
        console.log(`[API Route] Filtering context to ${filteredChunks.length} chunks from document "${specificTitle}".`);
        finalChunks = filteredChunks; // Use only the filtered chunks
      } else {
        console.log(`[API Route] Specific document "${specificTitle}" identified, but no matching chunks found in retrieved set. Using all retrieved chunks.`);
        // Keep finalChunks as the original retrievedChunks - potential issue if cleaning fails?
      }
    } else {
      console.log("[API Route] Query seems general. Using all retrieved chunks for context.");
      // Keep finalChunks as the original retrievedChunks
    }
    // --- End Original Filtering Block --- 

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
              
              // --- Add Structured Metadata --- 
              const structured = chunk.metadata.structured as Record<string, any> | undefined;
              if (structured) {
                  if (structured.content_status) metadataString += `\nStatus: ${structured.content_status}`;
                  if (structured.priority) metadataString += `\nPriority: ${structured.priority}`;
                  if (structured.due_date) metadataString += `\nDue Date: ${new Date(structured.due_date).toLocaleDateString()}`;
                  if (structured.event_start_time) metadataString += `\nEvent Start: ${new Date(structured.event_start_time).toLocaleString()}`;
                  if (structured.event_end_time) metadataString += `\nEvent End: ${new Date(structured.event_end_time).toLocaleString()}`;
                  if (structured.participants) metadataString += `\nParticipants: ${Array.isArray(structured.participants) ? structured.participants.join(', ') : structured.participants}`;
                  if (structured.location) metadataString += `\nLocation: ${structured.location}`;
              }
              // --- End Add Structured Metadata --- 
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

    // --- Log Raw LLM Response --- 
    console.log("[API Route] Raw LLM Response Text:", llmResponse.text);
    // --- End Log --- 

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
    
    // --- Parse LLM response for explicit source IDs ---
    let llmAnswerText = processedResponse.responseText; // Start with the processed text
    let primarySourceIds: string[] | null = null;
    const sourceLineMatch = llmAnswerText.match(/^Primary Sources:\s*(.*)$/m); // Multiline match

    if (sourceLineMatch && sourceLineMatch[1]) {
        primarySourceIds = sourceLineMatch[1].split(',').map(id => id.trim()).filter(id => id);
        // Remove the source line from the text sent to the UI
        llmAnswerText = llmAnswerText.replace(/^Primary Sources:.*$/m, '').trim();
        console.log(`[API Route Sources] LLM identified primary sources: [${primarySourceIds.join(', ')}]`);
    } else {
        console.log("[API Route Sources] LLM did not provide explicit primary sources.");
    }

    // --- Construct final sources for the UI dropdown (Using LLM or Heuristic) ---
    let finalSources: Source[] = [];
    const similarityThresholdGap = 0.05; // Keep threshold for fallback

    // Use the CLEANED specificTitle here as well
    if (specificTitle) { 
      // Case 1: Query targeted a specific document title (Highest Priority)
      const uniqueDocs = new Map<string, SourceChunk>();
      finalChunks.forEach(chunk => { 
        if (chunk.documentName?.toLowerCase() === specificTitle?.toLowerCase()) {
          if (!uniqueDocs.has(chunk.documentId)) {
            uniqueDocs.set(chunk.documentId, chunk);
          }
        }
      });
      finalSources = Array.from(uniqueDocs.values()).map(chunk => ({
         title: `${chunk.documentType === 'notion' ? 'Notion: ' : chunk.documentType === 'file_upload' ? 'File: ' : ''}${chunk.documentName}`,
      }));
      console.log(`[API Route Sources] Specific doc query. Showing ${finalSources.length} source(s) matching title.`);

    } else if (primarySourceIds) {
        // Case 2: General query & LLM provided source IDs
        const sourceIdSet = new Set(primarySourceIds);
        const uniqueDocs = new Map<string, SourceChunk>();
        // Iterate through the *original context chunks* to find matches for the IDs
        finalChunks.forEach(chunk => { 
            // More robust check: See if any ID in the set is a prefix of the chunk's documentId
            const matchFound = primarySourceIds.some(llmId => chunk.documentId.startsWith(llmId));
            if (matchFound && !uniqueDocs.has(chunk.documentId)) {
                uniqueDocs.set(chunk.documentId, chunk);
            }
        });
        finalSources = Array.from(uniqueDocs.values()).map(chunk => ({
            title: `${chunk.documentType === 'notion' ? 'Notion: ' : chunk.documentType === 'file_upload' ? 'File: ' : ''}${chunk.documentName}`,
        }));
        console.log(`[API Route Sources] Using sources provided by LLM: ${finalSources.length} unique sources.`);

    } else if (finalChunks.length === 1) {
        // Case 3 (Fallback): Only one chunk retrieved - show that source
        const topChunk = finalChunks[0];
        finalSources = [{
          title: `${topChunk.documentType === 'notion' ? 'Notion: ' : topChunk.documentType === 'file_upload' ? 'File: ' : ''}${topChunk.documentName}`,
        }];
        console.log(`[API Route Sources] Fallback: Only 1 chunk retrieved. Showing 1 source.`);
        
    } else if (finalChunks.length > 1 && 
               (finalChunks[0].similarity || 0) - (finalChunks[1].similarity || 0) > similarityThresholdGap) {
      // Case 4 (Fallback): General query, significant similarity gap
      const topChunk = finalChunks[0];
      finalSources = [{
        title: `${topChunk.documentType === 'notion' ? 'Notion: ' : topChunk.documentType === 'file_upload' ? 'File: ' : ''}${topChunk.documentName}`,
      }];
      console.log(`[API Route Sources] Fallback: General query with significant similarity gap. Showing top 1 source.`);

    } else if (finalChunks.length > 0) {
      // Case 5 (Fallback): General query, multiple close sources or LLM didn't provide IDs
      const uniqueDocs = new Map<string, SourceChunk>();
      finalChunks.forEach(chunk => {
        if (!uniqueDocs.has(chunk.documentId)) {
          uniqueDocs.set(chunk.documentId, chunk);
        }
      });
      finalSources = Array.from(uniqueDocs.values()).map(chunk => ({
         title: `${chunk.documentType === 'notion' ? 'Notion: ' : chunk.documentType === 'file_upload' ? 'File: ' : ''}${chunk.documentName}`,
      }));
      console.log(`[API Route Sources] Fallback: General query with multiple close sources or no LLM sources provided. Showing ${finalSources.length} sources.`);
    }
    // --- End Construct final sources ---

    // --- 7. Cache Store ---
    queryCache.set(cacheKey, processedResponse);
    // --- End Cache Store ---

    const endTime = performance.now();
    const totalTime = endTime - startTime;
    // Update log to remove autoMemTime
    console.log(`[API Route - Success] Total Time: ${totalTime.toFixed(2)}ms (Embed: ${embeddingTime.toFixed(2)}ms, Search: ${searchTime.toFixed(2)}ms, Memory: ${memoryTime.toFixed(2)}ms, LLM: ${llmTime.toFixed(2)}ms, Process: ${processingTime.toFixed(2)}ms)`);

    // Use the potentially modified response object
    response = NextResponse.json({
       response: { 
         responseText: llmAnswerText, // Use the cleaned answer text
         sources: finalSources 
       } 
     });
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

// Updated function to include both document and memory context AND request source IDs
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

  // More general but clear instructions + Source ID request
  return (
    `You are a helpful and professional assistant. Respond concisely using clear Markdown formatting. `
    + `Use the provided context (documents with metadata, memory) to answer the user's query accurately. `
    + `Each document chunk in the context includes metadata like 'Source Document: [Name] (ID: [documentId], Chunk: [index])'. `
    + `Pay close attention to any structured metadata provided within the [Metadata] block of each chunk, such as Status, Priority, Due Date, Event Start/End Times, Participants, or Location. Use this information when relevant to the query.

`
    + `== Primary Task Determination ==
`
    + `1. IF the user query asks for a LIST or SUMMARY of items OR asks about information likely contained in structured metadata (e.g., 'List my Notion documents', 'What is the status of X?', 'Show tasks due today', 'Summarize my files'), your primary task is SYNTHESIS. Synthesize the information from ALL relevant context chunks provided, utilizing both the text content and the structured metadata fields. Your answer should reflect the full scope of the relevant context provided.
`
    + `2. ELSE IF the query refers to a SPECIFIC document or topic mentioned in the context (e.g., 'What is document X about?', 'Details on the Y meeting'), your primary task is FOCUSED EXTRACTION. Structure your response logically around that specific topic using headings and summaries as appropriate, incorporating relevant structured metadata found in the context for that document/topic.
`
    + `3. ELSE (for general questions not covered above), your primary task is GENERAL QA. Synthesize information from the most relevant context sources professionally, including structured metadata if pertinent.

`
    + `== Response Formatting ==
`
    + `Regardless of the task, DO NOT include inline source citations (like \"Source Document: ...\") directly in your main response text. Source attribution will be handled separately.
`
    + `If the context does not contain the answer for the *determined primary task*, state that clearly. Do not invent information.

`
    // --- ADDED INSTRUCTION FOR SOURCE IDs ---
    + `== Source Attribution ==
`
    + `After providing your complete answer based on the determined task, add a new line starting EXACTLY with 'Primary Sources:' followed by a comma-separated list of the document IDs (e.g., 'abc-123, def-456') corresponding to the document(s) you used to formulate the answer. `
    + `IMPORTANT: For SYNTHESIS tasks (summaries/lists), you MUST include ALL the unique document IDs from the context you used to create that list or summary in the 'Primary Sources:' line. For example, if context contained chunks from documents 'doc-A', 'doc-B', and 'doc-C', and you summarized all three, the line must be 'Primary Sources: doc-A, doc-B, doc-C'. Do not omit any used IDs. For FOCUSED EXTRACTION or GENERAL QA tasks, list only the essential ID(s) used.

` 
    // --- END ADDED INSTRUCTION ---
    + `== Provided Context and Query ==
`
    + `${formattedHistory}${memContextSection}${docContextSection}`
    + `User: ${query}

`
    + `Assistant:`
  );
} 