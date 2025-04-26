import { createBrowserClient } from '@supabase/ssr';

// Get Supabase URL and Anon Key from environment variables
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Supabase URL and Anon Key must be provided in environment variables.');
}

// Function to create a Supabase client for use in client components
// This ensures consistent cookie handling with the SSR/middleware client
export function createSupabaseClient() {
  return createBrowserClient(
    supabaseUrl!,
    supabaseAnonKey!
  );
}

// Note: We no longer export a singleton client instance.
// Components/services will call createSupabaseClient() as needed.

// Helper function to get authenticated user
export const getCurrentUser = async () => {
  const { data: { user } } = await createSupabaseClient().auth.getUser();
  return user;
};

// Helper function to check if user is authenticated
export const isAuthenticated = async (): Promise<boolean> => {
  const user = await getCurrentUser();
  return !!user;
};

// Database types
export type Profile = {
  id: string;
  created_at: string;
  email: string;
  username: string;
  full_name?: string;
  avatar_url?: string;
  updated_at?: string;
}; 