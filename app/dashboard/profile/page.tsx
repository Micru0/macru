import { Suspense } from 'react';
import { getUserProfile } from '@/lib/services/user-service';
import ProfileForm from '@/components/forms/ProfileForm';

async function ProfileContent() {
  const profile = await getUserProfile();
  
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