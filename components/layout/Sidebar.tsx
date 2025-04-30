'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu, X, Home, User, Settings, ChevronRight, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import UserDropdown from './UserDropdown';
import { useAuth } from '@/lib/context/auth-context';
import { ThemeToggle } from '@/components/ui/theme-toggle';

interface NavItem {
  href: string;
  label: string;
  icon: React.ElementType;
}

export default function Sidebar() {
  const { session } = useAuth();
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  
  const navItems: NavItem[] = [
    { href: '/dashboard', label: 'Dashboard', icon: Home },
    { href: '/dashboard/profile', label: 'Profile', icon: User },
    { href: '/dashboard/settings', label: 'Settings', icon: Settings },
    { href: '/dashboard/files', label: 'Files', icon: FileText }
  ];
  
  const toggleSidebar = () => setIsOpen(!isOpen);
  
  return (
    <>
      {/* Mobile toggle button */}
      <Button 
        variant="ghost"
        size="icon"
        className="md:hidden fixed top-4 left-4 z-50 rounded-md"
        onClick={toggleSidebar}
      >
        {isOpen ? <X size={24} /> : <Menu size={24} />}
      </Button>
      
      {/* Sidebar */}
      <div className={`
        fixed inset-y-0 left-0 z-40 w-64 bg-background border-r transform transition-transform duration-200 ease-in-out
        ${isOpen ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0
      `}>
        <div className="flex flex-col h-full p-4">
          <div className="flex justify-between items-center mb-8">
            <h2 className="text-xl font-bold">MACRU</h2>
            <div className="flex items-center space-x-2">
              <ThemeToggle />
              <Button 
                variant="ghost" 
                size="icon"
                className="md:hidden" 
                onClick={toggleSidebar}
              >
                <X size={20} />
              </Button>
            </div>
          </div>
          
          {session ? (
            <>
              <nav className="flex-1">
                <ul className="space-y-2">
                  {navItems.map((item) => {
                    const Icon = item.icon;
                    const isActive = pathname === item.href;
                    return (
                      <li key={item.href}>
                        <Link 
                          href={item.href}
                          className={`flex items-center p-2 rounded-md hover:bg-muted group ${
                            isActive ? 'bg-muted font-medium' : ''
                          }`}
                          onClick={() => setIsOpen(false)}
                        >
                          <Icon size={18} className="mr-2" />
                          {item.label}
                          {isActive && <ChevronRight size={16} className="ml-auto" />}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </nav>
              
              <div className="mt-auto pt-4 border-t">
                <UserDropdown />
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center space-y-4">
              <p className="text-muted-foreground">Please sign in</p>
              <Button asChild>
                <Link href="/auth/login">Sign In</Link>
              </Button>
            </div>
          )}
        </div>
      </div>
      
      {/* Overlay for mobile */}
      {isOpen && (
        <div 
          className="md:hidden fixed inset-0 bg-black/50 z-30"
          onClick={toggleSidebar}
        />
      )}
    </>
  );
} 