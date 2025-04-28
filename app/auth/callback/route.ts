import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { Database } from '@/lib/types/database.types'; // Assuming Database type is needed

/**
 * This route handles all Supabase Auth callback redirects (PKCE flow)
 * It's used for email verification, password reset, etc.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  // Get the origin for the redirect URL
  const origin = searchParams.get('origin') ?? '/dashboard'; // Default redirect

  if (code) {
    // Use createServerClient with the { cookies } shorthand
    const supabase = createServerClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: { // Use the cookies function directly
          get(name: string) {
             // Read directly from the imported cookies store
             const cookieStore = cookies();
             return cookieStore.get(name)?.value;
          },
          set(name: string, value: string, options: CookieOptions) {
             // Set cookie using the imported cookies store
             const cookieStore = cookies();
             cookieStore.set({ name, value, ...options });
          },
          remove(name: string, options: CookieOptions) {
             // Delete cookie using the imported cookies store
             const cookieStore = cookies();
             cookieStore.delete({ name, ...options });
          },
        },
      }
    );
    
    try {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      
      if (error) {
        console.error('Auth Callback Route: Error exchanging code for session:', error);
        // Redirect to an error page or login with an error message
        const redirectUrl = new URL('/auth/login', request.url);
        redirectUrl.searchParams.set('error', 'auth_code_exchange_failed');
        redirectUrl.searchParams.set('error_description', error.message);
        return NextResponse.redirect(redirectUrl);
      }
      // If successful, redirect to origin
      return NextResponse.redirect(new URL(origin, request.url));
    } catch (err) {
      console.error('Auth Callback Route: Exception during code exchange:', err);
      // Handle exceptions, redirect to login with error
      const redirectUrl = new URL('/auth/login', request.url);
      redirectUrl.searchParams.set('error', 'auth_callback_exception');
      if (err instanceof Error) {
         redirectUrl.searchParams.set('error_description', err.message);
      }
      return NextResponse.redirect(redirectUrl);
    }
  }

  // If no code, redirect to login or a default page (e.g., dashboard if maybe already logged in)
  console.warn('Auth Callback Route: No code found, redirecting.');
  const redirectUrl = new URL('/auth/login', request.url);
  redirectUrl.searchParams.set('error', 'auth_callback_missing_code');
  return NextResponse.redirect(redirectUrl);
} 