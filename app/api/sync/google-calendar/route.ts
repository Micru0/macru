import { NextResponse } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { Database } from '@/lib/types/database.types';
import { GoogleCalendarConnector } from '@/lib/connectors/google-calendar';
import { DocumentProcessor, ProcessDocumentArgs } from '@/lib/services/document-processor'; // Corrected import name and added ProcessDocumentArgs
import { SyncResult } from '@/lib/types/data-connector'; // Corrected import path
import { ConnectorType } from '@/lib/types/data-connector';

export async function POST() {
    console.log('POST /api/sync/google-calendar triggered');
    
    // Initialize Supabase client
    let supabase;
    try {
        const cookieStore = await cookies(); 
        supabase = createServerClient<Database>(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
            {
                cookies: {
                    get(name: string) { return cookieStore.get(name)?.value; },
                    set(name: string, value: string, options: CookieOptions) { cookieStore.set({ name, value, ...options }); },
                    remove(name: string, options: CookieOptions) { cookieStore.set({ name, value: '', ...options }); },
                },
            }
        );
        console.log('[GCal Sync] Supabase client initialized successfully.')
    } catch (clientError: any) {
        console.error('[GCal Sync] Error initializing Supabase client:', clientError);
        return NextResponse.json({ error: 'Internal server error during setup' }, { status: 500 });
    }

    // Instantiate Document Processor 
    const processorService = new DocumentProcessor(); // Corrected class name

    try {
        // Check user authentication
        const { data: { user }, error: authError } = await supabase.auth.getUser();

        if (authError || !user) {
            console.error('[GCal Sync] Authentication error:', authError);
            return NextResponse.json({ error: 'User not authenticated' }, { status: 401 });
        }
        console.log('[GCal Sync] User authenticated:', user.id);

        // Instantiate the connector 
        const connector = new GoogleCalendarConnector(user.id);
        
        // TODO: Retrieve lastSyncTime for this connector/user
        // Example: Fetch from connector_tokens or a dedicated sync_log table
        // For now, we force a full sync by passing undefined
        const lastSyncTime: Date | undefined = undefined; 
        // Remove problematic ISOString call from log for now
        console.log(`[GCal Sync] Determined last sync time: ${lastSyncTime ? 'Provided' : 'None (full sync)'}`); 

        // Call the fetchData method
        console.log('[GCal Sync] Calling connector.fetchData...');
        const fetchedData = await connector.fetchData(user.id, supabase, lastSyncTime);
        console.log(`[GCal Sync] Fetched ${fetchedData.length} items from Google Calendar.`);

        let totalProcessedCount = 0;
        let totalErrorCount = 0;
        let firstErrorMessage: string | undefined = undefined;

        if (fetchedData.length === 0) {
            // Still return success, just indicate nothing was processed
             return NextResponse.json<SyncResult>({
                 connectorType: ConnectorType.GOOGLE_CALENDAR,
                 status: 'success',
                 processedCount: 0,
                 errorCount: 0,
                 message: 'No new data found.'
             });
        }

        // Process the fetched data item by item
        console.log('[GCal Sync] Passing fetched data to DocumentProcessor...');
        const totalItems = fetchedData.length;
        let index = 0; // Manual index tracking
        for (const item of fetchedData) { 
            try {
                // --- TEMPORARY LOGGING START ---
                console.log('--- Fetched GCal Event ---');
                console.log(`  Event ID: ${item.id}`);
                const processArgs: ProcessDocumentArgs = {
                    userId: user.id,
                    fileName: item.title,
                    sourceId: item.id,
                    sourceType: item.source,
                    metadata: item.metadata, 
                    rawContent: item.content,
                    createdTime: item.metadata?.createdTime,
                    lastEditedTime: item.metadata?.lastEditedTime,
                    filePath: null, // Calendar events don't have storage file paths
                    fileType: null, 
                    fileId: null, 
                    processingOptions: null // Use defaults
                };
                // Note: processDocument returns details for ONE document
                const singleResult = await processorService.processDocument(processArgs);
                if (singleResult.status === 'processed') {
                    totalProcessedCount++;
                } else { // Assume error if not completed
                    totalErrorCount++;
                    if (!firstErrorMessage) {
                        firstErrorMessage = singleResult.error || 'Unknown processing error';
                    }
                    console.error(`[GCal Sync] Error processing item ${item.id}: ${singleResult.error}`);
                }
            } catch (processingError: any) {
                 console.error(`[GCal Sync] CRITICAL Error processing item ${item.id}:`, processingError);
                 totalErrorCount++;
                 if (!firstErrorMessage) {
                     firstErrorMessage = processingError.message;
                 }
            }

            // Log progress every 25 items or on the last item
            if ((index + 1) % 25 === 0 || index === totalItems - 1) {
                console.log(`[GCal Sync] Progress: Processed ${index + 1} / ${totalItems} items... (Errors: ${totalErrorCount})`);
            }
            index++; // Increment manual index
        }
        console.log(`[GCal Sync] Processing complete. Processed: ${totalProcessedCount}, Errors: ${totalErrorCount}`);

        // TODO: Update lastSyncTime on successful processing 
        // (Consider how to handle partial failures - maybe only update if errorCount === 0?)

        const finalResult: SyncResult = {
            connectorType: ConnectorType.GOOGLE_CALENDAR,
            status: totalErrorCount > 0 ? (totalProcessedCount > 0 ? 'partial_success' : 'error') : 'success',
            processedCount: totalProcessedCount,
            errorCount: totalErrorCount,
            message: totalErrorCount > 0 
                ? `Sync completed with ${totalErrorCount} errors processing events.` 
                : `Successfully synced ${totalProcessedCount} events.`,
            firstErrorMessage: firstErrorMessage,
        };

        return NextResponse.json(finalResult, {
            status: totalErrorCount > 0 ? (totalProcessedCount > 0 ? 207 : 500) : 200 
        });

    } catch (error: any) {
        console.error('[GCal Sync] Error during Google Calendar sync process:', error);
        return NextResponse.json<SyncResult>({
             connectorType: ConnectorType.GOOGLE_CALENDAR,
             status: 'error',
             processedCount: 0,
             errorCount: 0,
             message: `Sync failed: ${error.message}`,
        }, { status: 500 });
    }
} 