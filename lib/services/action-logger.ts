import { createBrowserClient } from '@supabase/ssr';
import { SupabaseClient } from '@supabase/supabase-js';
import { Database } from '../types/database.types';

// Define the structure for logging parameters
interface LogActionParams {
  userId: string;
  actionType: string;
  params: Record<string, any>; // Parameters used for the action
  success: boolean;
  message?: string; // Optional success message
  error?: Error | string | null; // Optional error object or message
  // Optional request object (adjust type based on environment - e.g., NextRequest)
  request?: { headers: Record<string, string | string[] | undefined>; ip?: string } | null;
}

/**
 * Provides static methods for logging action execution attempts to the database.
 */
export class ActionLogger {
  /**
   * Logs an action attempt to the action_logs table.
   *
   * @param {string} userId - The ID of the user performing the action.
   * @param {string} actionType - The type identifier of the action (e.g., 'googleCalendar.createEvent').
   * @param {'attempted' | 'success' | 'failed'} status - The outcome status of the action attempt.
   * @param {Record<string, any>} details - Additional details or parameters related to the action or outcome (e.g., { error: 'message' } or { eventId: '123' } or action parameters).
   * @param {SupabaseClient<Database>} [supabaseClient] - Optional Supabase client instance.
   */
  static async log(
    userId: string,
    actionType: string,
    status: 'attempted' | 'success' | 'failed',
    details: Record<string, any> = {},
    supabaseClient?: SupabaseClient<Database>
  ): Promise<void> {
    // Use provided client or create a new browser client by default.
    // Caller MUST pass a server client for server-side usage.
    const supabase = supabaseClient || createBrowserClient<
      Database
    >(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    // Prepare log record
    const logRecord = {
        user_id: userId,
        action_type: actionType,
        success: status === 'success',
        message: status === 'success' ? (details.message || 'Action successful') : null,
        error: status === 'failed' ? (typeof details.error === 'string' ? details.error : JSON.stringify(details.error)) : null,
        params_snapshot: status === 'attempted' ? details : (details.params || null), // Log params on attempt, or if provided in details
        // Add other fields like ip_address, user_agent if available from request context
    };

    try {
      const { error: logError } = await supabase.from('action_logs').insert(logRecord);

      if (logError) {
        console.error(`[ActionLogger] Failed to log action (${actionType}, Status: ${status}):`, logError);
        // Fallback log to console if DB fails
        console.error('[ActionLogger Fallback] Log Details:', JSON.stringify(logRecord));
      }
    } catch (err) {
      console.error(`[ActionLogger] Unexpected error during logging (${actionType}, Status: ${status}):`, err);
       console.error('[ActionLogger Fallback] Log Details:', JSON.stringify(logRecord));
    }
  }
} 