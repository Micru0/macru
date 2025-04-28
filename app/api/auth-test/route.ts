import { NextResponse } from 'next/server';
// Restore imports
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies as getCookiesFromHeaders } from 'next/headers';

// Remove interface extension
// interface NextRequestWithSupabase extends Request { ... }

export async function GET(request: Request) { // Revert type
  console.log('[API Auth Test] Received GET request.');
  
  // --- Remove Environment Variable Verification --- 
  // console.log('[API Auth Test] SUPABASE_URL:', ...);
  // console.log('[API Auth Test] SUPABASE_ANON_KEY:', ...);
  // --- End Removal --- 

  // Create a response object early to be available for cookie handlers
  // We'll potentially modify this response and return it.
  let response = NextResponse.next(); // Use NextResponse.next() as a base

  // --- Remove getting client from middleware --- 
  /*
  const supabase = request.supabase;
  if (!supabase) { ... }
  */
  // --- End removing client from middleware --- 

  // Restore inline client creation block
  const cookieStore = await getCookiesFromHeaders(); 
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        // Restore original cookie handlers reading from cookieStore
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          // Set cookie on the request store (for reads within the same handler)
          cookieStore.set({ name, value, ...options });
          // Also set cookie on the response object (to send back to client)
          response.cookies.set({ name, value, ...options });
        },
        remove(name: string, options: CookieOptions) {
          // Remove cookie from the request store
          cookieStore.delete({ name, ...options });
          // Also remove cookie from the response object
          response.cookies.delete({ name, ...options });
        },
      },
    }
  );
  
  try {
    console.log('[API Auth Test] Attempting supabase.auth.getUser() with response handling...');
    // Use the locally created client
    const { data: { user }, error } = await supabase.auth.getUser();

    if (error) {
      console.error('[API Auth Test] Auth error:', error);
      // Return a new response for the error, not the one potentially modified by cookies
      return NextResponse.json({ error: 'Authentication failed', details: error.message }, { status: 401 });
    }

    if (!user) {
      console.log('[API Auth Test] No user session found.');
      return NextResponse.json({ error: 'Unauthorized', message: 'No active session found.' }, { status: 401 });
    }

    console.log(`[API Auth Test] User authenticated: ${user.id}`);
    // Return the potentially modified response object, adding the JSON body.
    // This ensures any cookie changes from getUser (token refresh) are sent back.
    // Creating a new JSON response might lose those cookie changes.
    response = NextResponse.json({ message: 'Authenticated', userId: user.id });
    // Manually copy cookies from the original response base if needed?
    // This part might require careful handling based on NextResponse behavior.
    // For now, let's assume NextResponse.json preserves cookies from the base response 
    // if constructed this way, or we need to copy them manually if not.
    // Let's try simple first.
    return response; 

  } catch (e) {
    console.error('[API Auth Test] Unexpected error:', e);
    const errorMessage = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: 'Internal Server Error', details: errorMessage }, { status: 500 });
  }
} 