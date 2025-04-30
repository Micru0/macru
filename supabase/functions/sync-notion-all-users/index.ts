/// <reference types="https://esm.sh/@supabase/functions-js/src/edge-runtime.d.ts" />

import { createClient, SupabaseClient } from 'jsr:@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

console.log(`Function "sync-notion-all-users" up and running!`);

// Define the structure for user credentials (adjust as needed)
interface UserNotionCredentials {
  user_id: string;
  access_token: string; // Assuming Notion token is stored
  // Add other relevant fields like refresh_token if applicable
}

// Environment variables
const supabaseUrl = Deno.env.get('SUPABASE_URL');
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const syncApiUrl = Deno.env.get('INTERNAL_SYNC_API_URL'); // e.g., http://localhost:3000/api/sync/notion or deployed URL
const internalApiKey = Deno.env.get('INTERNAL_API_SECRET'); // A secret shared between this function and the API route

if (!supabaseUrl || !serviceRoleKey || !syncApiUrl || !internalApiKey) {
  console.error('Missing required environment variables for sync function.');
  // In a real scenario, might want to prevent execution or return error
}

Deno.serve(async (req: Request) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  // --- Ensure this function is triggered appropriately (e.g., via cron schedule, not direct HTTP unless secured) ---
  // Basic security check (e.g., check for a specific header if triggered via HTTP)
  // const triggerSecret = req.headers.get('X-Internal-Trigger-Secret');
  // if (triggerSecret !== Deno.env.get('CRON_TRIGGER_SECRET')) {
  //   return new Response(JSON.stringify({ error: 'Unauthorized trigger' }), {
  //     headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  //     status: 401,
  //   });
  // }
  // --- End Basic Security Check ---

  console.log('Starting scheduled Notion sync for all users...');
  const startTime = Date.now();
  let usersSynced = 0;
  let usersFailed = 0;

  try {
    // Create Supabase client with service role key to bypass RLS
    const supabaseAdmin: SupabaseClient = createClient(supabaseUrl!, serviceRoleKey!, {
      auth: {
        persistSession: false,
      },
    });

    // 1. Fetch all users with Notion credentials
    // Adjust table/column names based on your actual schema
    // Assuming credentials is a JSON column like { "access_token": "..." }
    const { data: users, error: fetchError } = await supabaseAdmin
      .from('user_connections') // Assuming table name is 'user_connections'
      .select('user_id, credentials->>access_token') // Select user_id and extract access_token directly
      .eq('provider', 'notion') // Filter for Notion connections
      .neq('credentials->>access_token', null); // Ensure access_token exists

    if (fetchError) {
      throw new Error(`Failed to fetch users: ${fetchError.message}`);
    }

    if (!users || users.length === 0) {
      console.log('No users found with active Notion credentials. Sync finished.');
      return new Response(JSON.stringify({ message: 'No users to sync.' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      });
    }

    console.log(`Found ${users.length} users with Notion credentials to sync.`);

    // 2. Iterate and trigger sync for each user
    for (const userRecord of users) {
      const userId = userRecord.user_id;
      const accessToken = userRecord.access_token; // Access token directly from the select

      if (!userId || !accessToken) {
        console.warn(`Skipping user record due to missing userId or access token:`, userRecord);
        usersFailed++;
        continue;
      }

      console.log(`Triggering sync for user: ${userId}`);
      try {
        // Call the internal API endpoint to trigger the sync
        const response = await fetch(syncApiUrl!, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${internalApiKey!}`, // Use the shared secret
            'X-Sync-User-ID': userId, // Pass user ID for the API to identify the user
            'X-Sync-Provider': 'notion', // Indicate the provider
             // Pass Notion token if needed by the API route directly (alternative approach)
            // 'X-Notion-Token': accessToken 
          },
          // Body might not be needed if API uses headers, or pass minimal info
          // body: JSON.stringify({ userId: userId }) 
        });

        if (!response.ok) {
          const errorBody = await response.text();
          throw new Error(`Sync API call failed for user ${userId} with status ${response.status}: ${errorBody}`);
        }

        console.log(`Successfully triggered sync for user: ${userId}`);
        usersSynced++;
      } catch (syncError: any) { // Explicitly type syncError
        console.error(`Failed to trigger sync for user ${userId}:`, syncError);
        usersFailed++;
        // Continue to the next user even if one fails
      }
    }

    const endTime = Date.now();
    const duration = (endTime - startTime) / 1000; // Duration in seconds
    console.log(`Sync process finished in ${duration.toFixed(2)}s. Synced: ${usersSynced}, Failed: ${usersFailed}`);

    return new Response(JSON.stringify({ 
        message: `Sync process completed. Synced: ${usersSynced}, Failed: ${usersFailed}`,
        durationSeconds: duration.toFixed(2) 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error: any) { // Explicitly type error
    console.error('Unhandled error in sync-notion-all-users function:', error);
    return new Response(JSON.stringify({ error: error.message || 'Internal Server Error' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
}); 