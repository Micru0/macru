import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { saveNotionToken } from '@/lib/connectors/notion'; // Import the specific function
import { Client } from '@notionhq/client'; // Import Notion SDK

// Helper function to create Supabase server client for user session
const createSupabaseServerClient = (request: NextRequest) => {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          // Note: Setting cookies in route handlers requires careful handling
          // The response object needs to be updated. This might need refinement.
          request.cookies.set({ name, value, ...options }); 
        },
        remove(name: string, options: CookieOptions) {
          request.cookies.set({ name, value: '', ...options });
        },
      },
    }
  );
};

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const error = searchParams.get('error');

  console.log(`[Notion Auth Callback] Received callback. Code: ${code ? 'present' : 'missing'}, State: ${state}, Error: ${error}`);

  // --- Security Check: Verify State --- 
  // TODO: Retrieve the original state stored during the /start request 
  // and compare it with the received state parameter. If they don't match, abort.
  const storedState = null; // Placeholder
  // if (!state || state !== storedState) {
  //   console.error('[Notion Auth Callback] Invalid state parameter. Potential CSRF attack.');
  //   return NextResponse.redirect(new URL('/dashboard/settings?error=notion_auth_failed', request.url)); // Redirect to settings with error
  // }

  if (error) {
    console.error(`[Notion Auth Callback] Error received from Notion: ${error}`);
    // Redirect back to settings or connection page with an error message
    return NextResponse.redirect(new URL(`/dashboard/settings?error=notion_auth_error_${error}`, request.url));
  }

  if (!code) {
    console.error('[Notion Auth Callback] No authorization code received from Notion.');
    return NextResponse.redirect(new URL('/dashboard/settings?error=notion_auth_no_code', request.url));
  }

  // --- Get User ID --- 
  const supabase = createSupabaseServerClient(request);
  const { data: { user }, error: userError } = await supabase.auth.getUser();

  if (userError || !user) {
    console.error('[Notion Auth Callback] Error fetching user or user not logged in:', userError);
    return NextResponse.redirect(new URL('/auth/login?error=auth_required', request.url)); // Redirect to login
  }
  const userId = user.id;
  console.log(`[Notion Auth Callback] User ID found: ${userId}`);

  // --- Exchange Code for Token --- 
  const notionClientId = process.env.NOTION_CLIENT_ID;
  const notionClientSecret = process.env.NOTION_CLIENT_SECRET;
  const notionRedirectUri = process.env.NOTION_REDIRECT_URI;

  if (!notionClientId || !notionClientSecret || !notionRedirectUri) {
    console.error('[Notion Auth Callback] Missing Notion OAuth environment variables (ID, Secret, or Redirect URI).');
    return NextResponse.redirect(new URL('/dashboard/settings?error=notion_config_error', request.url));
  }

  // Encode Client ID and Secret for Basic Auth header
  const encoded = Buffer.from(`${notionClientId}:${notionClientSecret}`).toString('base64');

  try {
    console.log('[Notion Auth Callback] Exchanging code for access token...');
    // Use fetch directly or the Notion SDK if it supports this flow simply
    // Using fetch for clarity on the request structure:
    const response = await fetch('https://api.notion.com/v1/oauth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${encoded}`,
        'Notion-Version': '2022-06-28' // Specify Notion API version
      },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: notionRedirectUri,
      }),
    });

    const tokenData = await response.json();

    if (!response.ok || !tokenData.access_token) {
      console.error('[Notion Auth Callback] Failed to exchange code for token:', tokenData);
      throw new Error(tokenData.error_description || tokenData.error || 'Failed to get access token');
    }

    console.log('[Notion Auth Callback] Access token obtained successfully. Saving token...');
    console.log('[Notion Auth Callback] Full token data received from Notion:', JSON.stringify(tokenData, null, 2)); // Log the full token data object

    // --- Save Token using Imported Function --- 
    const saveSuccess = await saveNotionToken(
        supabase,
        userId,
        tokenData.access_token,
        tokenData.refresh_token,
        tokenData.expires_in ? new Date(Date.now() + tokenData.expires_in * 1000) : undefined,
        tokenData.workspace_name,
        tokenData.workspace_icon,
        tokenData.scopes
    );

    if (!saveSuccess) {
      throw new Error('Failed to save Notion token to database.');
    }

    console.log('[Notion Auth Callback] Token saved successfully.');

    // --- Trigger Immediate Sync (Fire and Forget) --- 
    const internalApiKey = process.env.INTERNAL_API_SECRET;
    const syncApiUrl = `${process.env.APP_URL}/api/sync/notion`; // Construct API URL
    
    if (internalApiKey && syncApiUrl && process.env.APP_URL) {
        console.log(`[Notion Auth Callback] Triggering immediate sync for user ${userId}...`);
        fetch(syncApiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${internalApiKey}`,
                'X-Sync-User-ID': userId,
                'X-Sync-Provider': 'notion' // Consistent with Edge Function call
            },
            // No body needed for this trigger
        }).then(async (syncRes) => {
            if (!syncRes.ok) {
                const errorBody = await syncRes.text();
                console.error(`[Notion Auth Callback] Immediate sync trigger failed with status ${syncRes.status}: ${errorBody}`);
            } else {
                console.log(`[Notion Auth Callback] Immediate sync trigger successful for user ${userId}.`);
            }
        }).catch(syncError => {
            console.error(`[Notion Auth Callback] Error triggering immediate sync fetch:`, syncError);
        });
        // We don't await this fetch - let it run in the background
    } else {
        console.warn('[Notion Auth Callback] Cannot trigger immediate sync: Missing INTERNAL_API_SECRET or APP_URL.');
    }
    // --- End Trigger Immediate Sync ---

    // --- Redirect User --- 
    // Redirect back to the settings or connections page with success
    return NextResponse.redirect(new URL('/dashboard/settings?success=notion_connected', request.url));

  } catch (error: any) {
    console.error('[Notion Auth Callback] Error during token exchange or saving:', error);
    return NextResponse.redirect(new URL(`/dashboard/settings?error=notion_token_exchange_failed&message=${encodeURIComponent(error.message)}`, request.url));
  }
} 