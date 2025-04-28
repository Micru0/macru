import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';

// Define interfaces for extending NextRequest
// interface NextRequestWithSupabase extends NextRequest {
//   supabase?: ReturnType<typeof createServerClient>;
//   supabaseResponse?: NextResponse;
// }

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
          // Update request cookies for client access in subsequent operations
          request.cookies.set({ 
            name,
            value,
            ...options,
          });
          
          // Mutate response cookies directly (don't recreate response)
          response.cookies.set({ 
            name,
            value,
            ...options,
          });
        },
        remove(name: string, options: CookieOptions) {
          // Update request cookies
          request.cookies.delete(name); 
          
          // Mutate response cookies directly (don't recreate response)
          response.cookies.delete({ name, ...options }); 
        },
      },
    }
  );
  
  // Get the session *just before* checking auth state for redirection
  const { data: { session }, error: sessionError } = await supabase.auth.getSession();
  
  if (sessionError) {
    console.error("Middleware: Error fetching session:", sessionError);
    // Allow request to continue, but session state is uncertain
    // Potentially redirect to an error page or login if session is critical
  }

  const isAuthenticated = !!session;
  
  // Get the current path
  const url = request.nextUrl.clone();
  const { pathname } = url;

  // Define protected routes that require authentication
  const protectedRoutes = ['/dashboard', '/profile', '/settings', '/files']; // Added other potential protected routes
  const isProtectedRoute = protectedRoutes.some(route => pathname.startsWith(route));
  
  // Define authentication routes that should redirect logged-in users
  const authRoutes = ['/auth/login', '/auth/signup', '/auth/reset-password'];
  const isAuthRoute = authRoutes.includes(pathname);
  
  // Define special auth routes that should be accessible regardless of auth state
  const specialAuthRoutes = ['/auth/callback', '/auth/check-email', '/auth/verify-email'];
  const isSpecialAuthRoute = specialAuthRoutes.some(route => pathname.startsWith(route));
  
  // Skip redirection logic entirely for special auth routes
  if (isSpecialAuthRoute) {
    return response;
  }
  
  // Logic for redirecting based on auth state and route
  if (isProtectedRoute && !isAuthenticated) {
    url.pathname = '/auth/login';
    // Preserve the original destination for redirect after login
    if (pathname !== '/') { // Avoid redirecting to / if it was the original path
        url.searchParams.set('redirectTo', pathname + url.search); 
    }
    return NextResponse.redirect(url);
  }
  
  if (isAuthRoute && isAuthenticated) {
    url.pathname = '/dashboard';
    url.search = ''; // Clear search params like redirectTo
    return NextResponse.redirect(url);
  }
  
  return response;
}

// Define routes that should be checked by this middleware
export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * API routes *SHOULD* be included if they need auth/session refresh
     */
    // Removed 'api' exclusion from the negative lookahead
    '/((?!_next/static|_next/image|favicon.ico).*)', 
  ],
};