import { Suspense } from 'react';
import { cookies } from 'next/headers';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { Database } from '@/lib/types/database.types';
import { getUserProfile } from '@/lib/services/user-service';
import ProfileForm from '@/components/forms/ProfileForm';

async function ProfileContent() {
  const cookieStore = await cookies();
  
  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
      },
    }
  );

  const profile = await getUserProfile(supabase);
  
  return (
    <div className="container py-6">
      <h1 className="text-2xl font-bold mb-6">Your Profile</h1>
      <ProfileForm initialData={profile} />
    </div>
  );
}

export default function ProfilePage() {
  return (
    <Suspense fallback={<div className="py-6 container">Loading profile...</div>}>
      <ProfileContent />
    </Suspense>
  );
} 