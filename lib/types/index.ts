export * from './database.types';

// Common application types
export interface AppConfig {
  name: string;
  description: string;
  url: string;
}

// Auth related types
export interface UserSession {
  user: {
    id: string;
    email: string;
    user_metadata: {
      full_name?: string;
      avatar_url?: string;
    };
  };
}

// Navigation types
export interface NavItem {
  title: string;
  href: string;
  icon?: React.ElementType;
  disabled?: boolean;
  external?: boolean;
}

// Theme types
export type Theme = 'dark' | 'light' | 'system'; 