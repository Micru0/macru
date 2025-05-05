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
import { getUserProfile, Profile } from '@/lib/services/user-service';

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
  const currentDateISO = new Date().toISOString(); // Get current date
  let userTimezone: string | null = null;
  
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

        // --- Fetch User Profile for Timezone --- 
        try {
          const profile = await getUserProfile(supabaseUserClient);
          userTimezone = (profile as any)?.timezone || null;
          if (userTimezone) {
            console.log(`[API LLM Test] User timezone found: ${userTimezone}`);
          } else {
            console.log(`[API LLM Test] User timezone not set in profile.`);
          }
        } catch (profileError) {
          console.error("[API LLM Test] Error fetching user profile:", profileError);
          // Proceed without timezone, don't fail the request
        }
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
          match_count: 10, // Increased from 5
          filter_user_id: userId, // Added user ID filter
          // Pass the detected source type filter, or null if none detected
          filter_source_types: filterSourceTypes 
        }
      );

      if (matchError) {
        console.error("[API Route] Error calling match_documents function:", matchError);
        throw new Error(`Database error searching chunks: ${matchError.message}`);
      }

      // Map Supabase result to SourceChunk interface, including new structured fields
      const sourceChunks: SourceChunk[] = (matchData || []).map((chunk: any) => ({
        documentId: chunk.document_id, 
        documentName: chunk.document_title || 'Unknown Document', 
        chunkIndex: chunk.chunk_index, 
        content: chunk.content,
        similarity: chunk.similarity,
        metadata: {
          // Merge existing chunk metadata with structured data from document
          ...(chunk.metadata || {}),
          // Explicitly add structured fields retrieved from the function
          event_start_time: chunk.event_start_time, // NEW
          event_end_time: chunk.event_end_time,     // NEW
          due_date: chunk.due_date,                 // NEW
          content_status: chunk.content_status,       // NEW
          priority: chunk.priority,                 // NEW
          location: chunk.location,                 // NEW
          participants: chunk.participants,         // NEW
        },
        documentType: chunk.document_type,
        source_url: chunk.source_url // Include the source URL
      }));
      
      retrievedChunks = sourceChunks; 
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
    const specificDocQueryMatch = query.match(/^.*\b(?:called|named)\s+['""?(.+?)['""]?(\s+on\s+\w+)?\s*$|.*?['""?](.+?)['"'](\s+on\s+\w+)?\s*$/i);
    
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
    let documentContext = '';
    if (finalChunks.length > 0) {
      documentContext += '\\n== CONTEXT DOCUMENTS ==\\n';
      finalChunks.forEach((chunk, index) => {
        // Add clear delimiters for each chunk
        documentContext += `\\n-- Document Chunk ${index + 1} Start --\\n`;
        documentContext += `DOCUMENT_ID: ${chunk.documentId}\\n`;
        documentContext += `DOCUMENT_NAME: ${chunk.documentName}\\n`;
        documentContext += `SOURCE_TYPE: ${chunk.documentType || 'unknown'}\\n`; // Include source type

        // Add structured metadata if available
        if (chunk.metadata) {
          documentContext += '[Metadata Start]\\n';
          documentContext += `  Chunk Index: ${chunk.metadata.chunkIndex}\\n`;
          if (chunk.metadata.event_start_time) {
            documentContext += `  Event Start: ${new Date(chunk.metadata.event_start_time).toLocaleString()}\\n`;
          }
          if (chunk.metadata.event_end_time) {
            documentContext += `  Event End: ${new Date(chunk.metadata.event_end_time).toLocaleString()}\\n`;
          }
          if (chunk.metadata.due_date) {
            documentContext += `  Due Date: ${new Date(chunk.metadata.due_date).toLocaleString()}\\n`;
          }
          if (chunk.metadata.content_status) {
            documentContext += `  Status: ${chunk.metadata.content_status}\\n`;
          }
          if (chunk.metadata.priority) {
            documentContext += `  Priority: ${chunk.metadata.priority}\\n`;
          }
           if (chunk.metadata.location) {
            documentContext += `  Location: ${chunk.metadata.location}\\n`;
          }
           if (chunk.metadata.participants && chunk.metadata.participants.length > 0) {
            documentContext += `  Participants: ${chunk.metadata.participants.join(', ')}\\n`;
          }
          // Add other relevant structured metadata fields here
          documentContext += '[Metadata End]\\n';
        }

        // Add content
        documentContext += '[Content Start]\\n';
        documentContext += `${chunk.content}\\n`;
        documentContext += '[Content End]\\n';

        documentContext += `-- Document Chunk ${index + 1} End --\\n`;
      });
    }
      
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
      memoryContext,   // Pass memory context
      process.env.ENABLE_MEMORY_LAYER === 'true',
      [], // **MODIFIED**: Pass empty tools array temporarily for troubleshooting
      currentDateISO, // Pass currentDateISO
      userTimezone     // Pass user's timezone
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
    console.log(`[API Route] Raw LLM Response Text: ${llmResponse.text}`); // Log raw response
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
          text: "Okay, please confirm the details below.", // Updated confirmation text
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
    if (llmResponse.text === undefined && !llmResponse.actionRequest) {
        // This should ideally not happen if actionRequest is also null, but handle defensively
        throw new Error("LLM response contained neither text nor an action request.");
    }

    // If action was proposed, potentially add timezone if missing
    if (llmResponse.actionRequest && typeof llmResponse.actionRequest === 'object' && llmResponse.actionRequest !== null) {
      const action = llmResponse.actionRequest as any; // Workaround
      if (action.type === 'googleCalendar.createEvent' && userTimezone && action.parameters && typeof action.parameters === 'object') {
        const params = action.parameters as { startDateTime?: string; endDateTime?: string; [key: string]: any }; // Type assertion for parameters
        if (params.startDateTime && !/[+-]\d{2}:\d{2}$|Z$/.test(params.startDateTime)) {
           console.warn(`[API LLM Test] Action ${action.type} proposed without timezone, but user has one (${userTimezone}). Appending timezone is needed but not yet implemented.`);
           // TODO: Implement robust date parsing and timezone appending here
           // Example placeholder: action.parameters.startDateTime = appendTimezone(action.parameters.startDateTime, userTimezone);
        }
        if (params.endDateTime && !/[+-]\d{2}:\d{2}$|Z$/.test(params.endDateTime)) {
           console.warn(`[API LLM Test] Action ${action.type} proposed without timezone for end time. Appending timezone is needed but not yet implemented.`);
           // TODO: Implement robust date parsing and timezone appending here
        }
      }
      // Re-assign potentially modified action back to the response object
      llmResponse.actionRequest = action;
    }

    // --- 4. Process Response & Extract Sources --- 
    const processingStartTime = performance.now();
    let identifiedSources: SourceChunk[] = [];
    let processedText = llmResponse.text || ''; // Use empty string if text is null/undefined

    const sourceLineMatch = processedText.match(/\nPrimary Sources: (.*)/);

    if (sourceLineMatch && sourceLineMatch[1].trim().toLowerCase() !== 'none') {
      const llmSourceIds = sourceLineMatch[1].split(',').map(id => id.trim()).filter(id => id);
      console.log(`[API Route Sources] LLM identified primary sources: [${llmSourceIds.join(', ')}]`);

      // Filter retrievedChunks to match LLM provided IDs
      identifiedSources = retrievedChunks.filter(chunk => 
        llmSourceIds.some(llmId => chunk.documentId.startsWith(llmId)) // Use startsWith for potential truncation
      );
      
      // Deduplicate based on documentId to avoid showing multiple chunks from the same doc unless necessary
      const uniqueSourceIds = new Set<string>();
      identifiedSources = identifiedSources.filter(source => {
        if (!uniqueSourceIds.has(source.documentId)) {
          uniqueSourceIds.add(source.documentId);
          return true;
        }
        return false;
      });
      
      console.log(`[API Route Sources] Using sources provided by LLM: ${identifiedSources.length} unique sources.`);

      // Remove the source line from the response text shown to the user
      processedText = processedText.replace(/\nPrimary Sources: .*/, '').trim();
    } else {
      // Fallback: LLM didn't provide sources or said None
      console.log("[API Route Sources] LLM did not provide explicit primary sources or indicated None.");
      // **NEW BEHAVIOR**: Return empty sources list in this case
      identifiedSources = []; 
    }

    const processingEndTime = performance.now();
    const processingTime = (processingEndTime - processingStartTime).toFixed(2);

    // --- 6. Process Response and Add Citations --- 
    const responseProcessor = new ResponseProcessor();
    const processedResponse: ProcessedResponse = responseProcessor.processResponse(
      processedText, // Pass the cleaned processed text
      identifiedSources // Use the identified sources for citation
    );

    // --- 7. Cache Store ---
    queryCache.set(cacheKey, processedResponse);
    // --- End Cache Store ---

    const endTime = performance.now();
    const totalTime = endTime - startTime;
    // Update log to remove autoMemTime
    console.log(`[API Route - Success] Total Time: ${totalTime.toFixed(2)}ms (Embed: ${embeddingTime.toFixed(2)}ms, Search: ${searchTime.toFixed(2)}ms, Memory: ${memoryTime.toFixed(2)}ms, LLM: ${llmTime.toFixed(2)}ms, Process: ${processingTime}ms)`);

    // Use the potentially modified response object
    response = NextResponse.json({
       response: { 
         responseText: processedText, // Use the cleaned processed text
         sources: identifiedSources 
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

// Helper function to format the prompt with history and context
const formatPromptWithHistoryAndContext = (
  query: string, 
  history: HistoryItem[],
  documentContext: string,
  memoryContext: string,
  enableMemory: boolean,
  tools: any[], // Added tools parameter
  currentDateISO: string, // Added currentDateISO parameter
  userTimezone: string | null // Added userTimezone parameter
): string => {
  let formattedHistory = history
    .map(item => `${item.role === 'user' ? 'User' : 'Assistant'}: ${item.content}`)
    .join('\n');

  let prompt = `You are Macru, a helpful AI assistant interacting with a user based *only* on the provided CONTEXT (documents and memory), CURRENT DATE, and conversation HISTORY. Your goal is to answer the user's query accurately and concisely.

== CURRENT DATE ==
${currentDateISO}
${userTimezone ? `\n== USER'S DEFAULT TIMEZONE ==\n${userTimezone}\n(Use this timezone for scheduling unless the user specifies otherwise. DO NOT ask for the timezone if it's already provided here or in the query.)` : ''}

== AVAILABLE TOOLS ==
${tools.length > 0 ? JSON.stringify(tools, null, 2) : 'None'}

== CONVERSATION HISTORY ==
${formattedHistory}

== CONTEXT DOCUMENTS ==
${documentContext || 'No relevant documents found in context.'}
`;

  if (enableMemory) {
    prompt += `\n== MEMORY CONTEXT ==
${memoryContext || 'No relevant memories found in context.'}\n`;
  }

  prompt += `\n== CURRENT QUERY ==
User: ${query}

== INSTRUCTIONS ==
1.  **Analyze Query:** Understand the user\\'s latest query in the context of the conversation history and the CURRENT DATE.
2.  **Consult Context:** Search the CONTEXT DOCUMENTS and MEMORY CONTEXT for relevant information. Prioritize information from CONTEXT DOCUMENTS.
3.  **Tool Use:** If the query asks for an action matching an AVAILABLE TOOL (e.g., "schedule meeting"):
    *   **Gather Parameters:** Identify all required parameters (e.g., summary, startDateTime, endDateTime/duration, attendees, timezone). Use the CURRENT DATE to resolve relative times (e.g., "tomorrow", "next Tuesday"). **If the user's default timezone is provided above, use it unless the user specifies a different one in their query.**
    *   **Check Completeness:**
        *   **If ALL parameters are clearly available** (from query + history + date context + default timezone): Proceed directly to the 'Propose Action' step below.
        *   **If parameters are MISSING or AMBIGUOUS** (e.g., time mentioned but no timezone provided in query OR default settings): Ask the user *only* for the specific missing information (e.g., "What timezone should I use?", "Who should attend?"). **Do not ask for the timezone if the default is available and the user didn't specify another.**
    *   **Propose Action:** Once all required parameters are confirmed (either initially or after user clarification), your response MUST **ONLY contain the formatted function call** for the appropriate tool (e.g., googleCalendar.createEvent). **DO NOT include any conversational text before the function call** (e.g., do not say "Okay, here is the action..." or "Scheduling the meeting now..."). Your entire response should be *just* the function call proposal that the system expects.
    *   **Function Call Format:** Formulate the function call accurately for the appropriate tool (e.g., googleCalendar.createEvent) including all parameters. Ensure the output format is precisely what the system expects for a function call proposal.
4.  **Synthesize Answer:** If no tool use is appropriate, generate an answer based *strictly* on the relevant information found in the context and history. DO NOT use external knowledge or make assumptions. If the user asks for analysis, comparison, or synthesis (e.g., \\'compare X and Y\\', \\'summarize benefits\\'), perform this analysis based *only* on the provided context, clearly indicating the basis for your reasoning.
5.  **Conciseness:** Keep your initial answer concise. For queries like \\\"remind me about X\\\" or \\\"what is X?\\\", provide a brief 1-2 sentence summary highlighting the key points. You can offer to provide more details if the user asks for them.
6.  **Formatting:** Structure your answer clearly using Markdown for readability. 
    *   **Always use Markdown bullet points (\`\\- Item\`) or numbered lists (\`1\\. Item\`) when listing multiple items, steps, pros/cons, or distinct points.**
    *   Use headings (like ## Heading) for main topics *only if providing significant detail*.
    *   Use bold text (like **important term**) for emphasis.
7.  **\\\"Not Found\\\" Handling:** If the user asks about a specific document, person, or topic that is NOT explicitly mentioned or identifiable within the provided CONTEXT DOCUMENTS or MEMORY CONTEXT, state clearly that the information is not available *in the provided context*. Do not guess or apologize.
8.  **Follow-up Handling:** If the user asks about information seemingly missing from a *previous* answer (e.g., \\\"What about X?\\\"), re-scan the *current* CONTEXT DOCUMENTS carefully for any mention of that specific item (X or Y). If found, provide the information concisely using clear Markdown formatting. If still not found in the current context, reiterate that it\\\'s not available in the provided context.
9.  **Completeness:** Ensure your entire response is generated and not cut off prematurely.
10. **Source Attribution:** IMMEDIATELY AFTER your main response text, add a new line starting EXACTLY with \\\"Primary Sources:\\\" followed by a comma-separated list of the DOCUMENT_ID(s) from the CONTEXT DOCUMENTS that you directly used to formulate the answer. Cite ALL relevant sources accurately. If the answer was general, came only from memory, or if you stated information wasn\\\'t found, use \\\"Primary Sources: None\\\".

Assistant:
`;

  return prompt;
}; 