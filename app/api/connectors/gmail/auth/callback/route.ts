import { google, Auth } from 'googleapis';
import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

const GMAIL_CLIENT_ID = process.env.GMAIL_CLIENT_ID;
const GMAIL_CLIENT_SECRET = process.env.GMAIL_CLIENT_SECRET;
const GMAIL_REDIRECT_URI = process.env.GMAIL_REDIRECT_URI;
const APP_URL = process.env.APP_URL || 'http://localhost:3000';

// Re-defining saveGmailToken locally for route context
async function saveTokenInRouteContext(userId: string, tokens: Auth.Credentials) {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) { return cookieStore.get(name)?.value },
        set(name: string, value: string, options: any) { cookieStore.set(name, value, options) },
        remove(name: string, options: any) { cookieStore.set(name, '', options) },
      },
    }
  );

  const { access_token, refresh_token, expiry_date, scope, id_token } = tokens;

  if (!access_token) {
    throw new Error('Missing access token in callback');
  }

  const scopesArray = scope ? scope.split(' ') : [];
  const expiryDateIso = expiry_date ? new Date(expiry_date).toISOString() : null;

  // TODO: Encrypt tokens
  const { error } = await supabase.from('connector_tokens').upsert({
    user_id: userId,
    connector_type: 'gmail',
    access_token: access_token,
    refresh_token: refresh_token ?? null,
    scopes: scopesArray,
    expiry_date: expiryDateIso,
    updated_at: new Date().toISOString(),
    raw_response: id_token ? { id_token } : null // Store ID token if present
  }, {
    onConflict: 'user_id, connector_type'
  });

  if (error) {
    console.error('Error saving Gmail token from callback:', error);
    throw error;
  }
  console.log(`Gmail token saved successfully for user ${userId}`);
}


export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state'); // User ID passed from start route

  if (!code) {
    console.error('Missing authorization code in Gmail callback');
    return NextResponse.redirect(`${APP_URL}/dashboard/settings?error=gmail_auth_failed`);
  }

  if (!state) {
    console.error('Missing state (user ID) in Gmail callback');
    return NextResponse.redirect(`${APP_URL}/dashboard/settings?error=gmail_auth_invalid_state`);
  }

  // Verify state matches a logged-in user (basic check)
  // A more robust check would involve verifying against a temporary nonce stored earlier
  const cookieStore = await cookies();
  const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { get(name: string) { return cookieStore.get(name)?.value } } }
  );
  const { data: { user }, error: userError } = await supabase.auth.getUser();

  if (userError || !user || user.id !== state) {
      console.error('State mismatch or auth error in Gmail callback', { state, userId: user?.id, userError });
      return NextResponse.redirect(`${APP_URL}/dashboard/settings?error=gmail_auth_state_mismatch`);
  }

  const userId = user.id;

  try {
    if (!GMAIL_CLIENT_ID || !GMAIL_CLIENT_SECRET || !GMAIL_REDIRECT_URI) {
      throw new Error('Gmail API credentials missing on server');
    }

    const oauth2Client = new google.auth.OAuth2(
      GMAIL_CLIENT_ID,
      GMAIL_CLIENT_SECRET,
      GMAIL_REDIRECT_URI
    );

    console.log(`Exchanging Gmail code for user ${userId}...`);
    const { tokens } = await oauth2Client.getToken(code);
    console.log(`Received Gmail tokens for user ${userId}. Saving...`);

    // Save tokens using the locally defined helper
    await saveTokenInRouteContext(userId, tokens);

    // Optional: Trigger initial sync immediately (can be long running)
    // Consider triggering this async or via a webhook/queue later
    // fetch(`${APP_URL}/api/sync/gmail`, { method: 'POST', headers: { 'Cookie': request.headers.get('cookie') || '' } });

    console.log(`Gmail connection successful for user ${userId}. Redirecting.`);
    return NextResponse.redirect(`${APP_URL}/dashboard/settings?success=gmail_connected`);

  } catch (error: any) {
    console.error('Error during Gmail OAuth callback:', error.message || error);
    return NextResponse.redirect(`${APP_URL}/dashboard/settings?error=gmail_token_exchange_failed`);
  }
} 