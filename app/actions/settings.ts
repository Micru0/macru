'use server';

import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
// Use @supabase/ssr
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { z } from 'zod';
import { Database } from '@/lib/types/database.types';
import { updateUserConfirmationLevel } from '@/lib/services/user-service-server';

// Define schema matching the input expected from the form/client
const confirmationLevelSchema = z.object({
  level: z.enum(['none', 'medium', 'high', 'all']),
});

/**
 * Server Action to update the user's action confirmation level.
 */
export async function updateConfirmationLevelAction(formData: FormData) {
  const cookieStore = await cookies();

  // Initialize client using the official @supabase/ssr pattern for Server Actions
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        // Pass cookie store methods directly
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value, ...options });
          } catch (error) {
            // The `set` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing
            // user sessions.
             console.warn(`[Server Action Warn] Failed to set cookie ${name}:`, error);
          }
        },
        remove(name: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value: '', ...options });
          } catch (error) {
            // The `delete` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing
            // user sessions.
            console.warn(`[Server Action Warn] Failed to remove cookie ${name}:`, error);
          }
        },
      },
    }
  );

  try {
    // 1. Get User Session
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      console.error('Server Action Auth Error:', authError);
      return { success: false, error: authError?.message || 'Authentication required.' };
    }

    // 2. Validate Input
    const level = formData.get('level');
    const validation = confirmationLevelSchema.safeParse({ level });

    if (!validation.success) {
      console.error('Server Action Validation Error:', validation.error.flatten());
      return { success: false, error: 'Invalid confirmation level value.', issues: validation.error.flatten() };
    }

    const validatedLevel = validation.data.level;

    // 3. Call Server-Side Service
    console.log(`Server Action: Updating confirmation level for user ${user.id} to ${validatedLevel}`);
    const updateSuccess = await updateUserConfirmationLevel(supabase, user.id, validatedLevel);

    if (!updateSuccess) {
      return { success: false, error: 'Database update failed.' };
    }

    // 4. Revalidate path
    revalidatePath('/dashboard/settings');
    console.log(`Server Action: Successfully updated confirmation level for user ${user.id}`);
    return { success: true, message: 'Confirmation level updated.' };

  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : 'An unexpected error occurred';
    console.error('Server Action Error:', e);
    return { success: false, error: errorMessage };
  }
} 