'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/context/auth-context';
import { ReactNode } from 'react'
import Link from 'next/link'
import { Home, User, Settings, BarChart2 } from 'lucide-react'
import Sidebar from '@/components/layout/Sidebar';

interface DashboardLayoutProps {
  children: ReactNode
}

export default function DashboardLayout({ children }: DashboardLayoutProps) {
  const { user, isLoading } = useAuth();
  const router = useRouter();

  // This is an extra layer of protection in addition to middleware
  useEffect(() => {
    if (!isLoading && !user) {
      router.push('/auth/login');
    }
  }, [user, isLoading, router]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-solid border-primary border-r-transparent"></div>
        <span className="ml-2">Loading...</span>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <Sidebar />
      <div className="md:pl-64 transition-all duration-200">
        <main className="min-h-screen">
          {children}
        </main>
      </div>
    </div>
  )
}

interface SidebarLinkProps {
  href: string
  icon: ReactNode
  label: string
}

function SidebarLink({ href, icon, label }: SidebarLinkProps) {
  return (
    <Link 
      href={href} 
      className="flex items-center p-2 rounded hover:bg-gray-800 transition-colors"
    >
      {icon}
      {label}
    </Link>
  )
} 