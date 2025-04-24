import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { CookieOptions } from '@supabase/ssr';

// This middleware handles two things:
// 1. Redirects unauthenticated users from protected routes to the login page
// 2. Redirects authenticated users from auth pages to the dashboard

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });
  
  // Create a Supabase client configured to use cookies
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          response.cookies.set({
            name,
            value,
            ...options,
          });
        },
        remove(name: string, options: CookieOptions) {
          response.cookies.set({
            name,
            value: '',
            ...options,
          });
        },
      },
    }
  );
  
  // Refresh session if expired - required for Server Components
  await supabase.auth.getSession();
  
  // Get the current user's session
  const { data: { session } } = await supabase.auth.getSession();
  const isAuthenticated = !!session;
  
  // Get the current path
  const url = request.nextUrl.clone();
  const { pathname } = url;

  // Define protected routes that require authentication
  const protectedRoutes = ['/dashboard', '/profile'];
  const isProtectedRoute = protectedRoutes.some(route => pathname.startsWith(route));
  
  // Define authentication routes
  const authRoutes = ['/auth/login', '/auth/signup', '/auth/reset-password'];
  const isAuthRoute = authRoutes.includes(pathname);
  
  // Logic for redirecting based on auth state and route
  if (isProtectedRoute && !isAuthenticated) {
    // Redirect unauthenticated users to login page
    url.pathname = '/auth/login';
    url.searchParams.set('redirectTo', pathname);
    return NextResponse.redirect(url);
  }
  
  if (isAuthRoute && isAuthenticated) {
    // Redirect authenticated users to dashboard
    url.pathname = '/dashboard';
    return NextResponse.redirect(url);
  }
  
  return response;
}

// Define routes that should be checked by this middleware
export const config = {
  matcher: [
    '/dashboard/:path*',
    '/profile/:path*',
    '/auth/:path*',
  ],
}; 