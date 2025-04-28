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
   * @param {LogActionParams} logParams - The parameters for the log entry.
   * @param {SupabaseClient<Database>} [supabaseClient] - Optional Supabase client instance. If not provided, a new browser client is created.
   *                                                    For server-side logging, ensure a server client instance is passed.
   */
  static async logAction(
    {
      userId,
      actionType,
      params,
      success,
      message,
      error,
      request,
    }: LogActionParams,
    supabaseClient?: SupabaseClient<Database>
  ): Promise<void> {
    // Use provided client or create a new browser client by default.
    // NOTE: For server-side usage where request context/cookies are needed,
    // the caller MUST pass a pre-configured server client instance.
    const supabase = supabaseClient || createBrowserClient<
      Database
    >(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    // Extract IP and User Agent safely
    const ip_address = request?.headers['x-forwarded-for']?.toString() || request?.ip || undefined;
    const user_agent = request?.headers['user-agent']?.toString() || undefined;

    // Format error message
    const error_message = error instanceof Error ? error.message : typeof error === 'string' ? error : undefined;

    try {
      const { error: logError } = await supabase.from('action_logs').insert({
        user_id: userId,
        action_type: actionType,
        params_snapshot: params, // Store parameters as JSONB
        success,
        message: message || null,
        error: error_message || null,
        ip_address: ip_address || null,
        user_agent: user_agent || null,
      });

      if (logError) {
        console.error('Failed to log action to database:', logError);
        console.error('Fallback log:', { userId, actionType, success, error: error_message });
      }
    } catch (err) {
      console.error('Unexpected error during action logging:', err);
      console.error('Fallback log (unexpected error):', { userId, actionType, success, error: error_message });
    }
  }
} 