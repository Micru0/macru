'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAuth } from '@/lib/context/auth-context';
import { LogOut, User, Settings } from 'lucide-react';

export default function UserDropdown() {
  const { session, signOut } = useAuth();
  const router = useRouter();
  const [userData, setUserData] = useState({
    fullName: '',
    email: '',
    avatar: '',
  });

  useEffect(() => {
    if (session?.user) {
      setUserData({
        fullName: session.user.user_metadata?.full_name || 'User',
        email: session.user.email || '',
        avatar: session.user.user_metadata?.avatar_url || '',
      });
    }
  }, [session]);

  const handleSignOut = async () => {
    await signOut();
    router.push('/auth/login');
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex items-center w-full p-2 rounded-md hover:bg-muted focus:outline-none">
        <Avatar className="h-8 w-8 mr-2">
          <AvatarImage src={userData.avatar} alt={userData.fullName} />
          <AvatarFallback>{userData.fullName.charAt(0)}</AvatarFallback>
        </Avatar>
        <div className="flex-1 text-left mr-2">
          <p className="text-sm font-medium truncate">{userData.fullName}</p>
          <p className="text-xs text-muted-foreground truncate">{userData.email}</p>
        </div>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>My Account</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => router.push('/dashboard/profile')}>
          <User className="mr-2 h-4 w-4" />
          <span>Profile</span>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => router.push('/dashboard/settings')}>
          <Settings className="mr-2 h-4 w-4" />
          <span>Settings</span>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleSignOut}>
          <LogOut className="mr-2 h-4 w-4" />
          <span>Log out</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
} 