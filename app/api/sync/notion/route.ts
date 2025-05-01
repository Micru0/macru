import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { notionConnector } from '@/lib/connectors/notion';
import { DocumentProcessor, ProcessDocumentArgs } from '@/lib/services/document-processor';
import { ConnectorData } from '@/lib/types/data-connector';
// import { Database } from '@/lib/types/database.types'; // Temporarily comment out

// Helper for user session client
const createSupabaseUserClient = (request: NextRequest) => {
    // TODO: Ensure this helper correctly handles cookie setting for responses
    // return createServerClient<Database>( // Temporarily remove generic
    return createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                get(name: string) { return request.cookies.get(name)?.value; },
                set(name: string, value: string, options: CookieOptions) { request.cookies.set({ name, value, ...options }); },
                remove(name: string, options: CookieOptions) { request.cookies.set({ name, value: '', ...options }); },
            },
        }
    );
};

// Helper to create Supabase service role client (bypasses RLS)
const createSupabaseServiceClient = (): SupabaseClient => { 
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
        throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY environment variable.');
    }
    // Use createClient from @supabase/supabase-js for service role
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!, 
        process.env.SUPABASE_SERVICE_ROLE_KEY,
        { auth: { persistSession: false } } // Important for server-side
    );
};

export async function POST(request: NextRequest) {
    console.log('[API Sync Notion] Received POST request.');
    
    const internalApiKey = process.env.INTERNAL_API_SECRET; // Load the shared secret
    if (!internalApiKey) {
        console.error('[API Sync Notion - FATAL] INTERNAL_API_SECRET is not set. Cannot authenticate internal triggers.');
        // Potentially block all requests if this is missing, or just internal ones.
    }
    
    let processedCount = 0;
    let errorCount = 0;
    let errorMessage = '';
    let userId: string | null = null;

    try {
        // --- Determine Authentication Method --- 
        const authHeader = request.headers.get('Authorization');
        const internalSyncUserId = request.headers.get('X-Sync-User-ID');
        const isInternalTrigger = authHeader === `Bearer ${internalApiKey}` && internalSyncUserId;

        if (isInternalTrigger) {
            // --- Internal Trigger Authentication --- 
            console.log('[API Sync Notion] Authenticating via internal trigger...');
            userId = internalSyncUserId;
            if (!userId) { // Double check just in case
                throw new Error('Internal trigger is missing X-Sync-User-ID header.');
            }
            console.log(`[API Sync Notion] Internal trigger authenticated for user: ${userId}`);
            // No need to create supabaseUserClient or call getUser for internal triggers
        } else {
            // --- Standard User Authentication (Cookie/JWT) --- 
            console.log('[API Sync Notion] Authenticating via standard user session (Cookie/JWT)...');
            const supabaseUserClient = createSupabaseUserClient(request);
            const token = authHeader?.split('Bearer ')?.[1];
            let user, userError;
            
            if (token) {
                console.log('[API Sync Notion] Attempting authentication via provided JWT.');
                ({ data: { user }, error: userError } = await supabaseUserClient.auth.getUser(token));
            } else {
                console.log('[API Sync Notion] Attempting authentication via cookies.');
                ({ data: { user }, error: userError } = await supabaseUserClient.auth.getUser());
            }

            if (userError || !user) {
                console.error('[API Sync Notion] Standard authentication failed:', userError, "Token provided:", !!token);
                return NextResponse.json({ error: "Authentication required" }, { status: 401 });
            }
            userId = user.id;
            console.log(`[API Sync Notion] Standard user authenticated: ${userId}`);
        }
        // --- End Authentication Logic --- 
        
        // Ensure userId is set before proceeding
        if (!userId) {
             console.error('[API Sync Notion] Critical: userId not set after authentication check.');
             return NextResponse.json({ error: "Internal authentication error" }, { status: 500 });
        }

        // --- Create Service Client for DB operations --- 
        const supabaseServiceClient = createSupabaseServiceClient(); 

        // --- Check Notion Connection Status (using Service Client) --- 
        console.log(`[API Sync Notion] Checking Notion connection status for user ${userId}...`);
        const connectionStatus = await notionConnector.getConnectionStatus(userId, supabaseServiceClient);
        
        if (!connectionStatus.isConnected) {
            console.warn(`[API Sync Notion] Notion not connected for user ${userId}. Aborting sync. Error: ${connectionStatus.error}`);
            return NextResponse.json({ error: connectionStatus.error || "Notion connection required." }, { status: 400 });
        }
        console.log(`[API Sync Notion] Notion connection verified for user ${userId}.`);

        // --- Fetch Data from Notion --- 
        console.log(`[API Sync Notion] Fetching data from Notion for user ${userId}...`);
        const lastSyncTime = undefined; // TODO: Implement incremental sync
        const notionData: ConnectorData[] = await notionConnector.fetchData(userId, supabaseServiceClient, lastSyncTime);
        console.log(`[API Sync Notion] Fetched ${notionData.length} items from Notion for user ${userId}.`);

        if (notionData.length === 0) {
            return NextResponse.json({ message: "No new data found to sync.", processedCount: 0 });
        }

        // --- Process Fetched Data --- 
        const documentProcessor = new DocumentProcessor(); 
        console.log(`[API Sync Notion] Initializing DocumentProcessor for user ${userId}...`);

        let updatedCount = 0; // Add counter for updates

        for (const item of notionData) {
            // Ensure userId is passed correctly
            const currentUserId = userId; 
            console.log(`[API Sync Notion] Processing item: ${item.title} (ID: ${item.id}, Source: ${item.source}) for user ${currentUserId}`);
            
            // Helper function to safely format timestamps
            const formatTimestamp = (dateInput: string | Date | null | undefined): string | null => {
                if (!dateInput) return null;
                try {
                    return new Date(dateInput).toISOString();
                } catch (e) {
                    console.warn(`[API Sync Notion] Could not parse date for update: ${dateInput}`, e);
                    return null;
                }
            };

            // --- Check if document already exists --- 
            const { data: existingDoc, error: checkError } = await supabaseServiceClient
                .from('documents')
                .select('id, source_updated_at') // Select last known update time
                .eq('user_id', currentUserId) // Use currentUserId
                .eq('source_id', item.id)
                .eq('source_type', item.source)
                .limit(1)
                .maybeSingle();

            if (checkError) {
                console.error(`[API Sync Notion] Error checking existing doc ${item.id} for user ${currentUserId}:`, checkError);
                errorCount++;
                if (!errorMessage) errorMessage = `DB error checking doc ${item.id}`; 
                continue;
            }

            // --- Handle Existing vs New Document --- 
            if (existingDoc) {
                // --- Document Exists - UPDATE METADATA --- 
                const notionLastEdited = item.metadata?.lastEditedTime ? new Date(item.metadata.lastEditedTime) : null;
                const dbLastUpdated = existingDoc.source_updated_at ? new Date(existingDoc.source_updated_at) : null;

                // --- REMOVE Timestamp Check for Manual Sync --- 
                // Always attempt update when manually syncing existing docs to ensure metadata is populated.
                console.log(`[API Sync Notion] Updating existing document ${item.id} ('${item.title}') for user ${currentUserId}. (Timestamp check bypassed for manual sync)`);
                    
                // Extract structured data from the connector data
                const structuredData = item.metadata?.structured || {};
                const updatePayload: Record<string, any> = {
                    // Update specific structured columns
                    event_start_time: formatTimestamp(structuredData.event_start_time),
                    event_end_time: formatTimestamp(structuredData.event_end_time),
                    due_date: formatTimestamp(structuredData.due_date),
                    content_status: structuredData.content_status,
                    priority: structuredData.priority,
                    participants: structuredData.participants,
                    location: structuredData.location,
                    // Always update the source timestamp
                    source_updated_at: formatTimestamp(item.metadata?.lastEditedTime),
                    // Optionally update title if it changed?
                    // title: item.title, 
                    // Optionally update the main metadata JSONB field if needed
                    // metadata: { ...existing metadata..., ...new generic metadata... }
                };

                const { error: updateError } = await supabaseServiceClient
                    .from('documents')
                    .update(updatePayload)
                    .eq('id', existingDoc.id);

                if (updateError) {
                    console.error(`[API Sync Notion] Error updating doc ${existingDoc.id}:`, updateError);
                    errorCount++;
                    if (!errorMessage) errorMessage = `DB error updating doc ${existingDoc.id}`;
                } else {
                    updatedCount++; // Increment update counter
                }
            } else {
                 // --- Document is New - PROCESS NORMALLY --- 
                if (!item.content || item.content.trim() === '') {
                  console.warn(`[API Sync Notion] Skipping new item ${item.id} ('${item.title}') for user ${currentUserId} due to empty content.`);
                  continue;
                }
                
                try {
                    const processArgs: ProcessDocumentArgs = {
                        userId: currentUserId, // Use currentUserId
                        fileName: item.title, 
                        sourceId: item.id, 
                        sourceType: item.source,
                        metadata: item.metadata, // Pass the whole metadata object (contains structured)
                        rawContent: item.content,
                        createdTime: item.metadata?.createdTime, // Pass explicitly if available
                        lastEditedTime: item.metadata?.lastEditedTime, // Pass explicitly if available
                        filePath: null, 
                        fileType: null,
                        fileId: null, 
                        processingOptions: null
                    };
                    await documentProcessor.processDocument(processArgs);
                    processedCount++;
                } catch (processingError: any) {
                    console.error(`[API Sync Notion] Error processing new item ${item.id} ('${item.title}') for user ${currentUserId}:`, processingError);
                    errorCount++;
                    if (!errorMessage) errorMessage = processingError.message;
                }
            }
        }

        // TODO: Update last sync time in DB for this user/connector

        console.log(`[API Sync Notion] Sync finished for user ${userId}. Processed new: ${processedCount}, Updated existing: ${updatedCount}, Errors: ${errorCount}`);
        if (errorCount > 0) {
             return NextResponse.json({ 
                message: `Sync completed with ${errorCount} errors.`, 
                 processedCount: processedCount, 
                 updatedCount: updatedCount,
                 errorCount: errorCount,
                 firstErrorMessage: errorMessage 
             }, { status: 207 });
         } else {
            return NextResponse.json({ 
                message: "Sync completed successfully.", 
                processedCount: processedCount,
                updatedCount: updatedCount // Include updated count in success message
            });
        }

    } catch (error: any) {
        console.error('[API Sync Notion] Unhandled error during sync process:', error);
        return NextResponse.json({ error: error.message || "Failed to sync Notion data" }, { status: 500 });
    }
} 