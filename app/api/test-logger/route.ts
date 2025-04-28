import { NextResponse } from 'next/server';
import { ActionLogger } from '@/lib/services/action-logger'; // Use alias
import { createServerClient, type CookieOptions } from '@supabase/ssr'; // Import CookieOptions type
import { cookies } from 'next/headers';
import { SupabaseClient } from '@supabase/supabase-js'; 
import type { Database } from '@/lib/types/database.types'; // Use alias

export async function GET(request: Request) {
  // Explicitly await cookies() call
  const cookieStore = await cookies();
  let supabase: SupabaseClient<Database>;
  
  try {
    // Create server client using package helper and cookie store methods
     supabase = createServerClient(
       process.env.NEXT_PUBLIC_SUPABASE_URL!,
       process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
       {
         cookies: {
           // Pass the get method directly from the cookie store
           get: (name: string) => cookieStore.get(name)?.value,
           // Add set and remove if needed for auth state changes within the route
           set: (name: string, value: string, options: CookieOptions) => {
             cookieStore.set({ name, value, ...options });
           },
           remove: (name: string, options: CookieOptions) => {
             cookieStore.delete({ name, ...options });
           },
         },
       }
     );
  } catch (error) {
     console.error("Error creating Supabase server client:", error);
     // Return generic error to client
     return NextResponse.json({ success: false, error: "Internal Server Error (Client Creation)" }, { status: 500 });
  }


  // Get user ID
  let userId: string;
  try {
      // Attempt to get the authenticated user
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      
      // Handle potential errors or no user found
      if (userError || !user) {
          console.warn("Test Logger: No authenticated user found or error fetching user:", userError?.message);
          // Return 401 Unauthorized if no valid user session
          return NextResponse.json({ success: false, error: "Unauthorized: No valid user session found." }, { status: 401 });
      } else {
        // Assign the user ID if successful
        userId = user.id;
      }
  } catch (error: any) {
      // Catch unexpected errors during the getUser process
      console.error("Test Logger: Unexpected error getting user:", error);
      // Return generic server error
      return NextResponse.json({ success: false, error: "Internal Server Error (User Fetch)" }, { status: 500 });
  }


  // Prepare log data using the obtained userId
  const logData = {
    userId: userId,
    actionType: 'test-log-entry',
    params: { testParam: 'value1', another: 123 },
    success: true,
    message: 'Test log successful',
    // Safely extract headers and potential IP address
    request: { 
      headers: Object.fromEntries(request.headers.entries()), // Convert Headers object to plain object
      ip: request.headers.get('x-forwarded-for') ?? request.headers.get('cf-connecting-ip') ?? undefined // Common proxy headers
    } 
  };

  try {
    // Attempt to log the action, passing the authenticated Supabase client
    await ActionLogger.logAction(logData, supabase);
    console.log(`Test log attempt for user: ${userId} recorded successfully.`);
    // Return success response to the client
    return NextResponse.json({ success: true, message: 'Log entry attempted successfully.' });
  } catch (error: any) {
    // Catch errors during the logging process itself
    console.error(`Test Logger: Error logging action for user ${userId}:`, error);
    // Return generic server error
    return NextResponse.json({ success: false, error: error.message || "Internal Server Error (Logging Action)" }, { status: 500 });
  }
} 