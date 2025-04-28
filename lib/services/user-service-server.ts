import { SupabaseClient } from '@supabase/supabase-js';
import { Database } from '@/lib/types/database.types';

type ConfirmationLevel = Database['public']['Tables']['profiles']['Row']['action_confirmation_level'];

/**
 * Updates the action confirmation level for a specific user.
 * Intended to be called from server-side environments (API routes, Server Actions).
 * @param supabase The Supabase client instance (must be server-client).
 * @param userId The ID of the user to update.
 * @param level The new confirmation level.
 * @returns True if successful, false otherwise.
 */
export async function updateUserConfirmationLevel(
  supabase: SupabaseClient<Database>,
  userId: string,
  level: ConfirmationLevel
): Promise<boolean> {
  if (!userId || !level) {
    console.error('Missing userId or level for updateUserConfirmationLevel');
    return false;
  }

  console.log(`Updating confirmation level for user ${userId} to ${level} in DB`);

  const { error } = await supabase
    .from('profiles')
    .update({ action_confirmation_level: level })
    .eq('id', userId);

  if (error) {
    console.error(`Error updating confirmation level for user ${userId}:`, error);
    return false;
  }

  console.log(`DB update successful for confirmation level for user ${userId}`);
  return true;
}

// Add other server-side user service functions here if needed 