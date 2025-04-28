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
    
    // --- Temporary Log to Verify JWT Secret Loading ---
    const loadedSecret = process.env.SUPABASE_JWT_SECRET;
    if (loadedSecret) {
        console.log(`[API Sync Notion - DEBUG] Loaded SUPABASE_JWT_SECRET: starts('${loadedSecret.substring(0, 5)}'), ends('${loadedSecret.substring(loadedSecret.length - 5)}'), length(${loadedSecret.length})`);
    } else {
        console.error('[API Sync Notion - DEBUG] CRITICAL: SUPABASE_JWT_SECRET environment variable is NOT LOADED!');
    }
    // --- End Temporary Log ---

    let processedCount = 0;
    let errorCount = 0;
    let errorMessage = '';

    try {
        // --- Get User ID (using Bearer Token or Cookies) --- 
        const supabaseUserClient = createSupabaseUserClient(request);
        
        // Extract token from Authorization header
        const authHeader = request.headers.get('Authorization');
        const token = authHeader?.split('Bearer ')?.[1];
        
        let user, userError;
        if (token) {
            console.log('[API Sync Notion] Attempting authentication via JWT.');
            ({ data: { user }, error: userError } = await supabaseUserClient.auth.getUser(token));
        } else {
            console.log('[API Sync Notion] Attempting authentication via cookies.');
            ({ data: { user }, error: userError } = await supabaseUserClient.auth.getUser());
        }

        if (userError || !user) {
            console.error('[API Sync Notion] Authentication error:', userError, "Token provided:", !!token);
            return NextResponse.json({ error: "Authentication required" }, { status: 401 });
        }
        const userId = user.id;
        console.log(`[API Sync Notion] User authenticated: ${userId}`);

        // --- Create Service Client for DB operations --- 
        console.log('[API Sync Notion] Creating Supabase service client for token check...');
        const supabaseServiceClient = createSupabaseServiceClient(); 

        // --- Check Notion Connection Status (using Service Client for DB lookup) --- 
        console.log('[API Sync Notion] Checking Notion connection status using service client...');
        const connectionStatus = await notionConnector.getConnectionStatus(userId, supabaseServiceClient);
        
        if (!connectionStatus.isConnected) {
            console.warn(`[API Sync Notion] Notion not connected for user ${userId}. Aborting sync. Error: ${connectionStatus.error}`);
            return NextResponse.json({ error: connectionStatus.error || "Notion connection required." }, { status: 400 });
        }
        console.log('[API Sync Notion] Notion connection verified.');

        // --- Fetch Data from Notion --- 
        console.log(`[API Sync Notion] Fetching data from Notion for user ${userId}...`);
        // TODO: Get last sync time from DB to pass to fetchData for incremental sync
        const lastSyncTime = undefined; 
        const notionData: ConnectorData[] = await notionConnector.fetchData(userId, lastSyncTime);
        console.log(`[API Sync Notion] Fetched ${notionData.length} items from Notion.`);

        if (notionData.length === 0) {
            return NextResponse.json({ message: "No new data found to sync.", processedCount: 0 });
        }

        // --- Process Fetched Data --- 
        const documentProcessor = new DocumentProcessor(); 
        console.log(`[API Sync Notion] Initializing DocumentProcessor...`);

        for (const item of notionData) {
            console.log(`[API Sync Notion] Processing item: ${item.title} (ID: ${item.id}, Source: ${item.source})`);
            try {
                // Explicitly type the argument object
                const processArgs: ProcessDocumentArgs = {
                    userId: userId,
                    fileName: item.title, 
                    sourceId: item.id, 
                    sourceType: item.source,
                    metadata: item.metadata, 
                    rawContent: item.content,
                    // Explicitly set optional fields to null/undefined if not applicable
                    filePath: null, 
                    fileType: null,
                    fileId: null, 
                    processingOptions: null
                };
                await documentProcessor.processDocument(processArgs);
                processedCount++;
            } catch (processingError: any) {
                console.error(`[API Sync Notion] Error processing item ${item.id} ('${item.title}'):`, processingError);
                errorCount++;
                if (!errorMessage) errorMessage = processingError.message;
            }
        }

        // TODO: Update last sync time in DB for this user/connector

        console.log(`[API Sync Notion] Sync finished. Processed: ${processedCount}, Errors: ${errorCount}`);
        if (errorCount > 0) {
             return NextResponse.json({ 
                message: `Sync completed with ${errorCount} errors.`, 
                processedCount: processedCount, 
                errorCount: errorCount,
                firstErrorMessage: errorMessage 
            }, { status: 207 }); // Multi-Status
        } else {
            return NextResponse.json({ message: "Sync completed successfully.", processedCount: processedCount });
        }

    } catch (error: any) {
        console.error('[API Sync Notion] Unhandled error during sync process:', error);
        return NextResponse.json({ error: error.message || "Failed to sync Notion data" }, { status: 500 });
    }
} 