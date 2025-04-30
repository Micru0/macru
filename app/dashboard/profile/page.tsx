import { Suspense } from 'react';
import { cookies } from 'next/headers';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { Database } from '@/lib/types/database.types';
import { getUserProfile, Profile } from '@/lib/services/user-service';
import ProfileForm from '@/components/forms/ProfileForm';
import { MemoryViewer } from '@/components/ui/memory-viewer';

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

  const profile: Profile = await getUserProfile(supabase);
  
  return (
    <div className="container mx-auto py-8 px-4 md:px-6 lg:px-8 space-y-8">
      <div>
        <h1 className="text-2xl font-bold mb-6">Your Profile</h1>
        <ProfileForm initialData={profile} />
      </div>
      <div>
        <MemoryViewer />
      </div>
    </div>
  );
}

export default function ProfilePage() {
  return (
    <Suspense fallback={<div className="py-8 container mx-auto px-4 md:px-6 lg:px-8">Loading profile...</div>}>
      <ProfileContent />
    </Suspense>
  );
} 