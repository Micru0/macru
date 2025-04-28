import { NextResponse } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr'; // Restore direct import
import { cookies } from 'next/headers'; // Restore direct import
// import { createSupabaseServerClient } from '@/lib/supabase/server'; // Remove helper import
import { actionRequestSchema, ActionRequest } from '@/lib/types/action';
import { ActionDispatcher } from '@/lib/services/action-dispatcher';
import { cookies as getCookiesFromHeaders } from 'next/headers'; // Alias import for clarity
import { ActionLogger } from '@/lib/services/action-logger'; // Import ActionLogger
import { checkRateLimit } from '@/lib/utils/rate-limiter'; // Import Rate Limiter

// Instantiate the dispatcher (consider making it a singleton if appropriate)
const dispatcher = new ActionDispatcher();

export async function POST(request: Request) {
  console.log('[API Action] Received POST request.');
  
  // Await cookies() to get the actual cookie store
  const cookieStore = await cookies(); 

  // Define cookie handlers for Supabase client
  const cookieOptions = {
    cookies: {
      get(name: string) {
        // Now cookieStore is the resolved object, not a promise
        return cookieStore.get(name)?.value;
      },
      set(name: string, value: string, options: CookieOptions) {
        // Ensure set is called on the resolved store
        cookieStore.set({ name, value, ...options }); 
      },
      remove(name: string, options: CookieOptions) {
        // Ensure delete is called on the resolved store
        cookieStore.delete({ name, ...options }); 
      },
    },
  };

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    cookieOptions
  );
  
  // 1. Check Authentication
  console.log('[API Action] Attempting supabase.auth.getUser()...');
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    console.error('[API Action] Authentication error:', authError);
    // Optionally, rate limit based on IP for unauthenticated requests if desired
    // const ip = request.headers.get('x-forwarded-for') ?? 'unknown-ip';
    // const { isAllowed } = checkRateLimit(`ip:${ip}`);
    // if (!isAllowed) { ... return 429 ...}
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  console.log(`[API Action] User authenticated: ${user.id}`);

  // 1.5 Check Rate Limit for Authenticated User
  const { isAllowed, limit, remaining, resetTime } = checkRateLimit(user.id);
  
  // Prepare Rate Limit Headers (to be added to the final response)
  const rateLimitHeaders = {
    'X-RateLimit-Limit': limit.toString(),
    'X-RateLimit-Remaining': remaining.toString(),
    'X-RateLimit-Reset': Math.ceil(resetTime.getTime() / 1000).toString(),
  };

  if (!isAllowed) {
    console.warn(`[API Action] Rate limit exceeded for user ${user.id}`);
    // Log the rate limit event
    await ActionLogger.logAction({
        userId: user.id,
        actionType: 'rate-limit-exceeded',
        params: { path: '/api/action' },
        success: false,
        error: 'Rate limit exceeded',
        request: { headers: Object.fromEntries(request.headers.entries()), ip: request.headers.get('x-forwarded-for') ?? undefined }
    }, supabase);
    // Return 429 Too Many Requests, attaching the headers already set on 'rateLimitHeaders'
    return new NextResponse(JSON.stringify({ error: 'Too Many Requests' }), { 
        status: 429, 
        headers: rateLimitHeaders 
    });
  }
  console.log(`[API Action] Rate limit check passed for user ${user.id}. Remaining: ${remaining}`);

  // 2. Parse and Validate Request Body
  let actionRequest: ActionRequest;
  try {
    const json = await request.json();
    actionRequest = actionRequestSchema.parse(json);
    console.log('[API Action] Request body parsed and validated:', actionRequest);
  } catch (error) {
    console.error('[API Action] Invalid request body:', error);
    // Return 400 response with rate limit headers
    return NextResponse.json({ error: 'Invalid request body', details: error }, { status: 400, headers: rateLimitHeaders });
  }

  // 3. Dispatch Action
  console.log(`[API Action] Dispatching action of type: ${actionRequest.type}`);
  let actionResult: { success: boolean; data?: any; error?: string } | null = null;
  let dispatchError: any = null;
  try {
    actionResult = await dispatcher.dispatch(actionRequest, user.id);
  } catch (error) {
    dispatchError = error;
    console.error(`[API Action] Critical error handling action '${actionRequest.type}':`, error);
  }

  // 4. Log Action Attempt
  await ActionLogger.logAction({
      userId: user.id,
      actionType: actionRequest.type,
      params: actionRequest.parameters,
      success: actionResult?.success ?? false,
      message: actionResult?.success ? 'Action completed' : undefined,
      error: actionResult?.error || (dispatchError instanceof Error ? dispatchError.message : dispatchError?.toString()),
      request: { headers: Object.fromEntries(request.headers.entries()), ip: request.headers.get('x-forwarded-for') ?? undefined }
  }, supabase);

  // 5. Return Final Response with Rate Limit Headers
  let finalResponse: NextResponse;
  if (dispatchError) {
    // Return error from caught exception during dispatch
    finalResponse = NextResponse.json({ success: false, error: 'Critical server error during action processing.', details: dispatchError.message }, { status: 500, headers: rateLimitHeaders });
  } else if (actionResult?.success) {
      console.log(`[API Action] Action '${actionRequest.type}' executed successfully.`);
      finalResponse = NextResponse.json(actionResult, { status: 200, headers: rateLimitHeaders });
  } else {
      console.error(`[API Action] Action '${actionRequest.type}' execution failed: ${actionResult?.error}`);
      const status = actionResult?.error?.includes('Invalid parameters') ? 400 : 500;
      finalResponse = NextResponse.json(actionResult, { status, headers: rateLimitHeaders });
  }

  // NOTE: Applying cookies set via cookieStore.set/delete back to the 
  // NextResponse might still be necessary depending on how 
  // @supabase/ssr handles cookie updates internally when using these handlers.
  // Further testing might be needed if auth state changes don't persist.

  return finalResponse; 
} 