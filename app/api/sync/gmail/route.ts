import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { GmailConnector } from '@/lib/connectors/gmail';
import { DocumentProcessor } from '@/lib/services/document-processor';
import { SyncResult, ConnectorType } from '@/lib/types/data-connector';
import { Database } from '@/lib/types/database.types';

export async function POST(request: Request) {
  let userId: string | null = null;
  let supabase;

  // 1. Authentication (Check for internal trigger first, then user session)
  const internalSecret = request.headers.get('X-Internal-Secret');
  const syncUserId = request.headers.get('X-Sync-User-ID');
  const expectedInternalSecret = process.env.INTERNAL_API_SECRET;

  const cookieStore = await cookies();
  supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) { return cookieStore.get(name)?.value; },
        set(name: string, value: string, options: any) { cookieStore.set(name, value, options); },
        remove(name: string, options: any) { cookieStore.set(name, '', options); },
      },
    }
  );

  if (expectedInternalSecret && internalSecret === expectedInternalSecret && syncUserId) {
    // Internal trigger: Use provided user ID but keep original Supabase client (user context)
    userId = syncUserId;
    console.log(`Gmail sync triggered internally for user: ${userId}`);
  } else {
    // Standard user session check
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return new NextResponse(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
    }
    userId = user.id;
    console.log(`Gmail sync triggered by user: ${userId}`);
  }

  if (!userId) {
     return new NextResponse(JSON.stringify({ error: 'Could not determine user ID' }), { status: 400 });
  }

  // 2. Initialize Services
  const gmailConnector = new GmailConnector();
  const documentProcessor = new DocumentProcessor();

  let processedCount = 0;
  let errorCount = 0;
  let firstErrorMessage: string | undefined = undefined;
  let overallStatus: 'success' | 'partial_success' | 'error' = 'success';

  try {
    // 3. Fetch Data
    // Pass Supabase client instance to fetchData if connector needs it
    const connectorData = await gmailConnector.fetchData(userId, supabase /*, lastSyncTime */);

    if (connectorData.length === 0) {
        return NextResponse.json({
            connectorType: ConnectorType.GMAIL,
            status: 'success',
            processedCount: 0,
            errorCount: 0,
            message: 'No new Gmail messages found to sync.'
        });
    }

    console.log(`Fetched ${connectorData.length} emails for user ${userId}. Starting ingestion...`);

    // 4. Process Data
    for (let i = 0; i < connectorData.length; i++) {
      const emailData = connectorData[i];
      try {
        await documentProcessor.processDocument({
          userId: userId,
          fileName: emailData.fileName || emailData.id,
          rawContent: emailData.content,
          sourceType: emailData.source,
          metadata: emailData.metadata,
        });
        processedCount++;
        if ((i + 1) % 25 === 0) {
            console.log(`Gmail Sync Progress (User ${userId}): Processed ${i + 1}/${connectorData.length}`);
        }
      } catch (processingError: any) {
        console.error(`Error processing Gmail item ${emailData.id} for user ${userId}:`, processingError);
        errorCount++;
        if (!firstErrorMessage) {
          firstErrorMessage = processingError.message || 'Unknown processing error';
        }
      }
    }

    // 5. Determine Final Status
    if (errorCount > 0 && processedCount > 0) {
      overallStatus = 'partial_success';
    } else if (errorCount > 0 && processedCount === 0) {
      overallStatus = 'error';
    }

    // TODO: Update lastSyncTime in DB for the user/connector

    const result: SyncResult = {
      connectorType: ConnectorType.GMAIL,
      status: overallStatus,
      processedCount: processedCount,
      errorCount: errorCount,
      message: overallStatus === 'success' ? `Successfully synced ${processedCount} Gmail messages.` : 
               overallStatus === 'partial_success' ? `Synced ${processedCount} Gmail messages with ${errorCount} errors.` : 
               `Failed to sync Gmail messages. ${errorCount} errors occurred.`,
      firstErrorMessage: firstErrorMessage,
    };

    console.log(`Gmail sync completed for user ${userId}:`, result);
    return NextResponse.json(result, { status: overallStatus === 'error' && processedCount === 0 ? 500 : (overallStatus === 'partial_success' ? 207 : 200) });

  } catch (fetchError: any) {
    console.error(`Fatal error during Gmail sync for user ${userId}:`, fetchError);
    const result: SyncResult = {
      connectorType: ConnectorType.GMAIL,
      status: 'error',
      processedCount: processedCount,
      errorCount: errorCount + 1, // Count the fetch error
      message: `Sync failed during data fetching: ${fetchError.message}`,
      firstErrorMessage: fetchError.message,
    };
    return new NextResponse(JSON.stringify(result), { status: 500 });
  }
} 