import { createBrowserClient } from '@supabase/ssr';
import { Database } from '@/lib/types/database.types';
import { LoginFormValues, SignupFormValues, ResetPasswordFormValues, UpdatePasswordFormValues } from '../validations/auth';

// Function to get client (avoids repeating env vars)
const getSupabaseClient = () => createBrowserClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

/**
 * AuthService - Provides methods to interact with Supabase Auth API
 */
export const AuthService = {
  /**
   * Sign in with email and password
   */
  async signInWithEmail({ email, password }: LoginFormValues) {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      console.error('AuthService: Error during signInWithEmail:', error);
      throw error;
    }

    return data;
  },

  /**
   * Sign up with email and password
   */
  async signUpWithEmail({ email, password }: SignupFormValues) {
    const supabase = getSupabaseClient();
    const origin = typeof window !== 'undefined' ? window.location.origin : '';

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${origin}/auth/callback`,
        data: {
          email_confirmed: false,
        }
      },
    });

    if (error) {
      console.error('AuthService: Error during signUpWithEmail:', error);
      throw error;
    }

    return data;
  },

  /**
   * Sign out the current user
   */
  async signOut() {
    const supabase = getSupabaseClient();
    const { error } = await supabase.auth.signOut();
    
    if (error) {
      console.error('AuthService: Error during signOut:', error);
      throw error;
    }
    return true;
  },

  /**
   * Reset password for a user
   */
  async resetPassword({ email }: ResetPasswordFormValues) {
    const supabase = getSupabaseClient();
    const origin = typeof window !== 'undefined' ? window.location.origin : '';

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${origin}/auth/reset-password`,
    });

    if (error) {
      console.error('AuthService: Error during resetPassword:', error);
      throw error;
    }
    return true;
  },

  /**
   * Update password for a user
   */
  async updatePassword({ password }: UpdatePasswordFormValues) {
    const supabase = getSupabaseClient();
    const { error } = await supabase.auth.updateUser({
      password,
    });

    if (error) {
      console.error('AuthService: Error during updatePassword:', error);
      throw error;
    }
    return true;
  },
}; 