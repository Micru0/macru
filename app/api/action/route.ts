import { NextResponse } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr'; // Restore direct import
import { cookies } from 'next/headers'; // Restore direct import
// import { createSupabaseServerClient } from '@/lib/supabase/server'; // Remove helper import
import { actionRequestSchema, ActionRequest } from '@/lib/types/action';
import { ActionDispatcher } from '@/lib/services/action-dispatcher';
import { cookies as getCookiesFromHeaders } from 'next/headers'; // Alias import for clarity
import { ActionLogger } from '@/lib/services/action-logger'; // Import ActionLogger
import { checkRateLimit } from '@/lib/utils/rate-limiter'; // Import Rate Limiter
import { GoogleCalendarConnector } from '@/lib/connectors/google-calendar'; // Import the connector
import { Database } from '@/lib/types/database.types'; // Ensure Database types are imported if needed for Supabase client

// Instantiate the dispatcher (consider making it a singleton if appropriate)
const dispatcher = new ActionDispatcher();

// Define ActionResult type
interface ActionResult {
  success: boolean;
  message?: string;
  error?: string;
  data?: any; // Optional data field for results
  eventId?: string; // Specific for calendar events
}

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
    await ActionLogger.log(
        user.id,
        'rate-limit-exceeded',
        'attempted',
        { path: '/api/action' },
        supabase
    );
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

  // 4. Log Action Attempt
  await ActionLogger.log(
      user.id,
      actionRequest.type,
      'attempted',
      actionRequest.parameters,
      supabase
  );

  // 5. Execute Action
  let executionResult: ActionResult = { success: false, error: 'Executor not found' };
  let executionError: any = null; // Declare executionError here
  try {
    executionResult = await executeAction(actionRequest.type, actionRequest.parameters, user.id);

    // 6. Log Final Outcome (Success/Failure) based on executionResult
    await ActionLogger.log(
        user.id,
        actionRequest.type,
        executionResult.success ? 'success' : 'failed',
        { 
            params: actionRequest.parameters, 
            message: executionResult.message, 
            error: executionResult.error 
        },
        supabase
    );

  } catch (err: any) { // Catch error into 'err'
    console.error(`[API Action] Critical error handling action '${actionRequest.type}':`, err);
    executionError = err; // Assign caught error to executionError
    executionResult = { success: false, error: err.message || 'Unknown execution error' }; // Update result on catch
    
    // Log failure due to caught error
     await ActionLogger.log(
        user.id,
        actionRequest.type,
        'failed',
        { 
            params: actionRequest.parameters, 
            error: executionResult.error 
        },
        supabase
    );
  }
  
  // 5. Return Final Response with Rate Limit Headers
  let finalResponse: NextResponse;
  if (executionError) { // Check if an error was caught
    // Return error from caught exception during execution
    finalResponse = NextResponse.json({ success: false, error: 'Critical server error during action processing.', details: executionError.message }, { status: 500, headers: rateLimitHeaders });
  } else if (executionResult.success) {
      console.log(`[API Action] Action '${actionRequest.type}' executed successfully.`);
      finalResponse = NextResponse.json(executionResult, { status: 200, headers: rateLimitHeaders });
  } else {
      console.error(`[API Action] Action '${actionRequest.type}' execution failed: ${executionResult.error}`);
      const status = executionResult.error?.includes('Invalid parameters') ? 400 : 500;
      finalResponse = NextResponse.json(executionResult, { status, headers: rateLimitHeaders });
  }

  // NOTE: Applying cookies set via cookieStore.set/delete back to the 
  // NextResponse might still be necessary depending on how 
  // @supabase/ssr handles cookie updates internally when using these handlers.
  // Further testing might be needed if auth state changes don't persist.

  return finalResponse; 
} 

// TODO: Implement actual action execution logic here
async function executeAction(type: string, parameters: any, userId: string) {
    ActionLogger.log(userId, type, 'attempted', parameters);
    console.log(`[Action API] Attempting action: ${type} for user ${userId}`, parameters);

    // --- Action Routing --- 
    switch (type) {
        case 'googleCalendar.createEvent':
            try {
                const connector = new GoogleCalendarConnector(); // Instantiate connector
                const result = await connector.createEvent(userId, parameters as any); // Call the new method
                if (result.success) {
                    ActionLogger.log(userId, type, 'success', { eventId: result.eventId });
                    return { success: true, message: `Event created successfully (ID: ${result.eventId})` };
                } else {
                    ActionLogger.log(userId, type, 'failed', { error: result.error });
                    return { success: false, message: result.error || 'Failed to create calendar event.' };
                }
            } catch (error: any) {
                console.error(`[Action API] Error executing ${type}:`, error);
                ActionLogger.log(userId, type, 'failed', { error: error.message });
                return { success: false, message: `Error creating event: ${error.message}` };
            }
            
        case 'notion.createPage': // Example placeholder
            console.warn('[Action API] notion.createPage action not implemented yet.');
            ActionLogger.log(userId, type, 'failed', { error: 'Not implemented' });
            return { success: false, message: 'Notion page creation not implemented yet.' };

        default:
            console.warn(`[Action API] Unknown action type: ${type}`);
            ActionLogger.log(userId, type, 'failed', { error: 'Unknown action type' });
            return { success: false, message: `Unknown action type: ${type}` };
    }
} 