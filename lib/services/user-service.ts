import { SupabaseClient } from '@supabase/supabase-js';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { Database } from '@/lib/types/database.types';

export async function getUserProfile(supabase: SupabaseClient<Database>) {
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) throw new Error('User not authenticated [getUserProfile]');
  
  console.log(`getUserProfile: Found user ID: ${user.id}`);
  const { data, error, status } = await supabase
    .from('profiles')
    .select('id, username, full_name, avatar_url, website, email, created_at, updated_at, action_confirmation_level')
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

export async function updateUserProfile(profileData: Partial<Profile>) {
  const supabase = createClientComponentClient<Database>();
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) throw new Error('User not authenticated [updateUserProfile]');
  
  const { email, ...updateData } = profileData;

  console.log(`updateUserProfile: Updating profile for user ID: ${user.id} with data:`, updateData);
  const { error } = await supabase
    .from('profiles')
    .update(updateData)
    .eq('id', user.id);
    
  if (error) { 
    console.error("updateUserProfile: Error updating profile:", error);
    throw error; 
  }
  console.log("updateUserProfile: Profile updated successfully.");
  return true;
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
} 