import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { Database } from '@/lib/types/database.types';

export async function getUserProfile() {
  const supabase = createClientComponentClient<Database>();
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) throw new Error('User not authenticated');
  
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();
    
  if (error) throw error;
  return data;
}

export async function updateUserProfile(profileData: Partial<Profile>) {
  const supabase = createClientComponentClient<Database>();
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) throw new Error('User not authenticated');
  
  const { error } = await supabase
    .from('profiles')
    .update(profileData)
    .eq('id', user.id);
    
  if (error) throw error;
  return true;
}

// Define the Profile interface for TypeScript type safety
export interface Profile {
  id: string;
  username: string | null;
  full_name: string | null;
  avatar_url: string | null;
  website: string | null;
  email: string | null;
  updated_at?: string | null;
  created_at?: string | null;
} 