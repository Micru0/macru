import { NextResponse, type NextRequest } from 'next/server';
import { google } from 'googleapis';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { Database } from '@/lib/types/database.types';
import { ConnectorType } from '@/lib/types/data-connector';

// Reuse helper, ensure env vars are checked
function getOAuth2Client() {
    if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET || !process.env.GOOGLE_REDIRECT_URI) {
        console.error("[Callback] Google OAuth env vars missing!");
        throw new Error('Google OAuth environment variables are not set.');
    }
    return new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        process.env.GOOGLE_REDIRECT_URI
    );
}

// Token saving function (assuming it's potentially moved/shared later, but keep local for now)
async function saveGoogleToken(userId: string, tokens: any, supabase: any) { // Pass supabase client
    console.log('[Callback:saveGoogleToken] Attempting to save Google token for user:', userId);
    let expiryDate: string | null = null;
    if (tokens.expiry_date) {
        expiryDate = new Date(tokens.expiry_date).toISOString();
    } else if (tokens.expires_in) { // Calculate from expires_in if expiry_date is missing
        expiryDate = new Date(Date.now() + (tokens.expires_in * 1000)).toISOString();
    }
    console.log('[Callback:saveGoogleToken] Calculated expiry:', expiryDate);
    console.log('[Callback:saveGoogleToken] Tokens received:', {
        access_token_present: !!tokens.access_token,
        refresh_token_present: !!tokens.refresh_token,
        scopes: tokens.scope,
        id_token_present: !!tokens.id_token,
        raw_response_keys: Object.keys(tokens)
    });


    const { data, error } = await supabase
        .from('connector_tokens')
        .upsert({
            user_id: userId,
            connector_type: ConnectorType.GOOGLE_CALENDAR,
            access_token: tokens.access_token,
            refresh_token: tokens.refresh_token,
            // Convert space-separated string to PostgreSQL array literal
            scopes: tokens.scope ? tokens.scope.split(' ') : null, 
            expiry_date: expiryDate,
            raw_response: tokens, 
        }, { onConflict: 'user_id, connector_type' })
        .select(); // Select to confirm

    if (error) {
        console.error('[Callback:saveGoogleToken] Error saving Google token:', error);
        throw new Error(`Failed to save Google token: ${error.message}`);
    }
    console.log('[Callback:saveGoogleToken] Google token saved successfully:', data ? 'Upsert successful' : 'Upsert failed or returned no data');
    return data;
}


export async function GET(request: NextRequest) {
    console.log('[Callback] Received GET request.');
    const url = new URL(request.url);
    const code = url.searchParams.get('code');
    const errorParam = url.searchParams.get('error');

    console.log('[Callback] Extracted params:', { code, errorParam });

    const redirectUrl = new URL('/dashboard/settings', process.env.APP_URL || 'http://localhost:3000'); // Base redirect

    if (errorParam) {
        console.error(`[Callback] Error received from Google: ${errorParam}`);
        redirectUrl.searchParams.set('google_calendar_error', `Google Auth Error: ${errorParam}`);
        return NextResponse.redirect(redirectUrl);
    }

    if (!code) {
        console.error('[Callback] Authorization code missing in request.');
        redirectUrl.searchParams.set('google_calendar_error', 'Authorization code missing.');
        return NextResponse.redirect(redirectUrl);
    }

    console.log('[Callback] Authorization code received:', code ? 'Present' : 'Missing');

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
         console.log('[Callback] Supabase client initialized.');
    } catch (clientError: any) {
        console.error('[Callback] Error initializing Supabase client:', clientError);
        redirectUrl.searchParams.set('google_calendar_error', 'Server setup error.');
        return NextResponse.redirect(redirectUrl);
    }

    try {
        // Verify user session
        const { data: { user }, error: authError } = await supabase.auth.getUser();

        if (authError || !user) {
            console.error('[Callback] Authentication error:', authError);
            redirectUrl.searchParams.set('google_calendar_error', 'User not authenticated during callback.');
            return NextResponse.redirect(redirectUrl);
        }
        console.log('[Callback] User authenticated:', user.id);

        // Exchange code for tokens
        const oauth2Client = getOAuth2Client();
        console.log('[Callback] Attempting to exchange code for tokens...');
        const { tokens } = await oauth2Client.getToken(code);
        console.log('[Callback] Token exchange successful. Tokens received:', tokens ? 'Yes' : 'No');
        if (!tokens) {
             throw new Error("Failed to exchange code for tokens - null response");
        }

        // Save tokens
        console.log('[Callback] Attempting to save tokens...');
        await saveGoogleToken(user.id, tokens, supabase); // Pass supabase client
        console.log('[Callback] Token saving process completed.');

        // Redirect on success
        redirectUrl.searchParams.set('google_calendar_success', 'Successfully connected Google Calendar!');
        return NextResponse.redirect(redirectUrl);

    } catch (error: any) {
        console.error('[Callback] Error during token exchange or saving:', error);
        // Try to revoke token if exchange succeeded but saving failed? Maybe too complex.
        redirectUrl.searchParams.set('google_calendar_error', `Failed to process token: ${error.message}`);
        return NextResponse.redirect(redirectUrl);
    }
} 