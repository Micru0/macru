import { supabase } from '../supabase';
import { LoginFormValues, SignupFormValues, ResetPasswordFormValues, UpdatePasswordFormValues } from '../validations/auth';

/**
 * AuthService - Provides methods to interact with Supabase Auth API
 */
export const AuthService = {
  /**
   * Sign in with email and password
   */
  async signInWithEmail({ email, password }: LoginFormValues) {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      throw error;
    }

    return data;
  },

  /**
   * Sign up with email and password
   */
  async signUpWithEmail({ email, password }: SignupFormValues) {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (error) {
      throw error;
    }

    return data;
  },

  /**
   * Sign out the current user
   */
  async signOut() {
    const { error } = await supabase.auth.signOut();
    
    if (error) {
      throw error;
    }

    return true;
  },

  /**
   * Reset password for a user
   */
  async resetPassword({ email }: ResetPasswordFormValues) {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/reset-password`,
    });

    if (error) {
      throw error;
    }

    return true;
  },

  /**
   * Update password for a user
   */
  async updatePassword({ password }: UpdatePasswordFormValues) {
    const { error } = await supabase.auth.updateUser({
      password,
    });

    if (error) {
      throw error;
    }

    return true;
  },

  /**
   * Get the current session
   */
  async getSession() {
    const { data, error } = await supabase.auth.getSession();
    
    if (error) {
      throw error;
    }

    return data.session;
  },

  /**
   * Get the current user
   */
  async getUser() {
    const { data, error } = await supabase.auth.getUser();
    
    if (error) {
      throw error;
    }

    return data.user;
  }
}; 