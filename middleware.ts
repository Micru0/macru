import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';

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
          // If the cookie is updated, update the cookies for the request and response
          request.cookies.set({ // Update request cookies
            name,
            value,
            ...options,
          });
          response = NextResponse.next({ // Recreate response with updated request header
            request: {
              headers: request.headers,
            },
          });
          response.cookies.set({ // Update response cookies
            name,
            value,
            ...options,
          });
        },
        remove(name: string, options: CookieOptions) {
          // If the cookie is removed, update the cookies for the request and response
          request.cookies.delete(name); // Update request cookies
          response = NextResponse.next({ // Recreate response with updated request header
            request: {
              headers: request.headers,
            },
          });
          response.cookies.set({ // Update response cookies
            name,
            value: '',
            ...options,
          });
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
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!api|_next/static|_next/image|favicon.ico).*)', 
  ],
}; 