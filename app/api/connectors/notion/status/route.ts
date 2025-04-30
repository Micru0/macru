import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { notionConnector, saveNotionToken, decryptToken } from '@/lib/connectors/notion'; // Import decryptToken from notion.ts
import { Client } from '@notionhq/client';

// Helper for user session client (copied from sync route)
const createSupabaseUserClient = (request: NextRequest) => {
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

// Helper to create Supabase service role client (copied from sync route)
const createSupabaseServiceClient = (): SupabaseClient => {
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
        throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY environment variable.');
    }
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY,
        { auth: { persistSession: false } }
    );
};

// Helper function to get token from DB using service client
// This might need adjustment based on where getNotionToken is defined/exported
async function getNotionTokenFromDb(supabase: SupabaseClient, userId: string): Promise<any | null> {
    const { data, error } = await supabase
      .from('connector_tokens')
      .select('*')
      .eq('user_id', userId)
      .eq('connector_type', 'notion') // Use string literal for connector type
      .maybeSingle();
  
    if (error) {
      console.error('[API Notion Status] Error fetching token from DB:', error);
      return null;
    }
    return data;
}
  
// TODO: Ensure decryptToken is correctly imported and handles Buffer
// Placeholder - replace with actual import if needed
// const decryptToken = (tokenBuffer: Buffer | null): string | null => { 
//     if (!tokenBuffer) return null;
//     return Buffer.from(tokenBuffer).toString(); 
// };


export async function GET(request: NextRequest) {
    console.log('[API Notion Status] Received GET request.');

    try {
        // --- Authenticate User ---
        const supabaseUserClient = createSupabaseUserClient(request);
        const { data: { user }, error: userError } = await supabaseUserClient.auth.getUser();

        if (userError || !user) {
            console.error('[API Notion Status] Authentication error:', userError);
            return NextResponse.json({ error: "Authentication required" }, { status: 401 });
        }
        const userId = user.id;
        console.log(`[API Notion Status] User authenticated: ${userId}`);

        // --- Get Token using Service Client ---
        const supabaseServiceClient = createSupabaseServiceClient();
        const tokenData = await getNotionTokenFromDb(supabaseServiceClient, userId);
        console.log(`[API Notion Status] Token data ${tokenData ? 'found' : 'NOT found'} in DB for user ${userId}.`);

        if (!tokenData || !tokenData.access_token) {
            console.log('[API Notion Status] No access token found in DB.');
            return NextResponse.json({ isConnected: false, accountIdentifier: null });
        }

        // --- Decrypt Token --- 
        // Decrypt function now expects string | null due to TEXT column type
        const accessToken = decryptToken(tokenData.access_token);
        console.log(`[API Notion Status] Token after potential decryption (now just returns input): ${accessToken ? 'present' : 'missing or null'}`);

        // ---> ADDED CHECK: Prevent validation if token looks like the escaped string <--- 
        if (accessToken && accessToken.startsWith('\\x')) { // Escape the backslash for the check
            console.warn('[API Notion Status] Detected potentially invalid escaped token format. Skipping validation.');
            return NextResponse.json({ 
                isConnected: false, 
                accountIdentifier: tokenData.account_identifier, 
                error: 'Invalid token format detected in database.' 
            });
        }
        // <--- END ADDED CHECK --- 

        if (!accessToken) {
            console.error(`[API Notion Status] Failed to get valid access token (was null after decrypt). User: ${userId}, Account: ${tokenData.account_identifier}`);
            return NextResponse.json({ isConnected: false, accountIdentifier: tokenData.account_identifier, error: 'Token retrieval failed' });
        }

        // --- Validate Token with Notion API ---
        let isValid = false;
        let validationError = null;
        try {
            console.log('[API Notion Status] Attempting to validate token with Notion API (users.me)... ');
            const notionClient = new Client({ auth: accessToken });
            await notionClient.users.me({});
            console.log('[API Notion Status] Token validation successful.');
            isValid = true;
        } catch (error: any) {
            console.error(`[API Notion Status] Token validation API call failed for user ${userId}: ${error.code || error.message}. Check server logs for full error object if needed.`);
            isValid = false;
            validationError = error.message || 'Token validation failed';
        }

        // --- Return Status ---
        return NextResponse.json({
            isConnected: isValid,
            accountIdentifier: tokenData.account_identifier,
            error: validationError,
        });

    } catch (error: any) {
        console.error(`[API Notion Status] Unhandled error: ${error.message}. Check server logs for full error object if needed.`);
        return NextResponse.json({ error: error.message || "Failed to check Notion status" }, { status: 500 });
    }
} 