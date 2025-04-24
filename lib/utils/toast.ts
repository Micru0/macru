import { toast } from 'sonner';

/**
 * Show a success toast notification
 */
export const showSuccess = (message: string) => {
  toast.success(message);
};

/**
 * Show an error toast notification
 */
export const showError = (message: string) => {
  toast.error(message);
};

/**
 * Show an info toast notification
 */
export const showInfo = (message: string) => {
  toast.info(message);
};

/**
 * Show a warning toast notification
 */
export const showWarning = (message: string) => {
  toast.warning(message);
};

/**
 * Shows an appropriate toast message based on Supabase error
 */
export const handleSupabaseError = (error: Error) => {
  let message = 'An unexpected error occurred';
  
  // Handle known Supabase error messages
  if (error.message.includes('Email not confirmed')) {
    message = 'Please check your email to confirm your account';
  } else if (error.message.includes('Invalid login credentials')) {
    message = 'Invalid email or password';
  } else if (error.message.includes('Email already registered')) {
    message = 'This email is already registered';
  } else if (error.message) {
    message = error.message;
  }
  
  showError(message);
  return message;
}; 