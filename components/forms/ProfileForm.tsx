"use client";

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { 
  Form, 
  FormControl, 
  FormField, 
  FormItem, 
  FormLabel, 
  FormMessage 
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { updateUserProfile, Profile } from '@/lib/services/user-service';
import { useToast } from '@/components/ui/use-toast';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

const profileSchema = z.object({
  username: z.string().min(3, 'Username must be at least 3 characters').max(50, 'Username cannot exceed 50 characters'),
  full_name: z.string().min(1, 'Full name is required').max(100, 'Full name cannot exceed 100 characters'),
  website: z.string().url('Please enter a valid URL').optional().or(z.literal('')),
  avatar_url: z.string().url('Please enter a valid URL').optional().or(z.literal(''))
});

type ProfileFormValues = z.infer<typeof profileSchema>;

interface ProfileFormProps {
  initialData: Profile | null;
}

export default function ProfileForm({ initialData }: ProfileFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();
  
  const form = useForm<ProfileFormValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      username: initialData?.username || '',
      full_name: initialData?.full_name || '',
      website: initialData?.website || '',
      avatar_url: initialData?.avatar_url || ''
    }
  });
  
  async function onSubmit(data: ProfileFormValues) {
    setIsSubmitting(true);
    try {
      if (!initialData?.id) {
        console.warn("Initial user ID not found, proceeding as service should fetch it.");
      }
      await updateUserProfile(data);
      toast({
        title: 'Profile updated',
        description: 'Your profile has been successfully updated.',
        variant: 'default',
      });
    } catch (error) {
      console.error("Error updating profile:", error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to update profile. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  }
  
  if (!initialData) {
    return <div>Loading profile...</div>;
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 max-w-md">
        <div className="flex items-center space-x-4 mb-6">
          <Avatar className="w-16 h-16">
            <AvatarImage src={initialData.avatar_url || ''} alt={initialData.full_name || 'User'} />
            <AvatarFallback>{initialData.full_name?.[0]?.toUpperCase() || 'U'}</AvatarFallback>
          </Avatar>
          <div>
            <h3 className="text-lg font-medium">{initialData.full_name || 'User Profile'}</h3>
            <p className="text-sm text-muted-foreground">@{initialData.username || 'username'}</p>
          </div>
        </div>
        
        <FormField
          control={form.control}
          name="username"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Username</FormLabel>
              <FormControl>
                <Input placeholder="username" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        
        <FormField
          control={form.control}
          name="full_name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Full Name</FormLabel>
              <FormControl>
                <Input placeholder="John Doe" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        
        <FormField
          control={form.control}
          name="website"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Website</FormLabel>
              <FormControl>
                <Input placeholder="https://example.com" {...field} value={field.value || ''} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        
        <FormField
          control={form.control}
          name="avatar_url"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Avatar URL</FormLabel>
              <FormControl>
                <Input placeholder="https://example.com/avatar.jpg" {...field} value={field.value || ''} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Saving...' : 'Save Profile'}
        </Button>
      </form>
    </Form>
  );
} 