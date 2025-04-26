import { createSupabaseClient } from '../supabase';
import { LoginFormValues, SignupFormValues, ResetPasswordFormValues, UpdatePasswordFormValues } from '../validations/auth';

/**
 * AuthService - Provides methods to interact with Supabase Auth API
 */
export const AuthService = {
  /**
   * Sign in with email and password
   */
  async signInWithEmail({ email, password }: LoginFormValues) {
    const supabase = createSupabaseClient();
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
    const supabase = createSupabaseClient();
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
    const supabase = createSupabaseClient();
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
    const supabase = createSupabaseClient();
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
    const supabase = createSupabaseClient();
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