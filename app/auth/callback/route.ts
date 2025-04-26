import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

/**
 * This route handles all Supabase Auth callback redirects
 * It's used for email verification, password reset, etc.
 */
export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  
  if (code) {
    try {
      const supabase = createRouteHandlerClient({ cookies });
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      
      if (error) {
        console.error('Auth Callback Route: Error exchanging code for session:', error);
      }
    } catch (err) {
      console.error('Auth Callback Route: Exception during code exchange:', err);
    }
  }

  // Redirect to the appropriate page after authentication
  return NextResponse.redirect(new URL('/dashboard', request.url)); 
} 