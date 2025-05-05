import { SupabaseClient } from '@supabase/supabase-js';
import { createBrowserClient } from '@supabase/ssr';
import { Database } from '@/lib/types/database.types';

export async function getUserProfile(supabase: SupabaseClient<Database>) {
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) throw new Error('User not authenticated [getUserProfile]');
  
  console.log(`getUserProfile: Found user ID: ${user.id}`);
  const { data, error, status } = await supabase
    .from('profiles')
    .select('id, username, full_name, avatar_url, website, email, created_at, updated_at, action_confirmation_level, timezone')
    .eq('id', user.id)
    .single();
    
  if (error && status !== 406) {
    console.error("getUserProfile: Error fetching profile:", error);
    throw error;
  }
  
  if (!data) {
    console.warn(`getUserProfile: No profile found for user ID: ${user.id}`);
    throw new Error('Profile not found for authenticated user.');
  }
  
  console.log("getUserProfile: Profile data fetched successfully:", data);
  return data;
}

export async function updateUserProfile(profileData: Partial<Omit<Profile, 'id' | 'email' | 'created_at' | 'updated_at'>>) {
  console.log("updateUserProfile called with:", profileData);
  const supabase = createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
  console.log("Supabase client created in updateUserProfile (using createBrowserClient). Attempting getUser...");

  const { data: { user }, error: userError } = await supabase.auth.getUser();

  if (userError || !user) {
    console.error("Error fetching user for profile update:", userError);
    throw new Error('User not authenticated or session expired.');
  }

  console.log("Authenticated user ID:", user.id);

  // Prepare the update object, ensuring no disallowed fields are included
  const updateData: { [key: string]: any } = {
    username: profileData.username,
    full_name: profileData.full_name,
    website: profileData.website,
    avatar_url: profileData.avatar_url,
    timezone: profileData.timezone, // Include timezone in update data
    updated_at: new Date().toISOString(), // Always update timestamp
  };

  // Remove undefined fields to avoid overwriting with null
  Object.keys(updateData).forEach(key => updateData[key] === undefined && delete updateData[key]);
  // Specifically handle empty strings for optional fields if needed (e.g., website, avatar_url)
  if (updateData.website === '') updateData.website = null;
  if (updateData.avatar_url === '') updateData.avatar_url = null;
  if (updateData.timezone === '') updateData.timezone = null; // Allow clearing timezone

  console.log("Attempting Supabase update with data:", updateData);

  const { error } = await supabase
    .from('profiles')
    .update(updateData)
    .eq('id', user.id);

  if (error) {
    console.error('Supabase profile update error:', error);
    throw new Error(`Database error updating profile: ${error.message}`);
  }
  
  console.log("Profile updated successfully in database.");
}

// Define the Profile interface for TypeScript type safety
export interface Profile {
  id: string;
  username: string | null;
  full_name: string | null;
  avatar_url: string | null;
  website: string | null;
  email?: string | null;
  updated_at?: string | null;
  created_at?: string | null;
  action_confirmation_level?: string;
  timezone?: string | null;
} 