-- Add website column to profiles table
ALTER TABLE public.profiles
ADD COLUMN website TEXT NULL;

COMMENT ON COLUMN public.profiles.website IS 'User''s personal or professional website URL.'; 