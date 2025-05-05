-- Migration to create the initial profiles table

-- Create the profiles table linked to auth.users
CREATE TABLE public.profiles (
  id UUID NOT NULL PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT UNIQUE,
  full_name TEXT,
  avatar_url TEXT,
  -- Note: website TEXT column is added in migration 006
  email TEXT, -- Often useful to store email here too, though auth.users has it
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  CONSTRAINT username_length CHECK (char_length(username) >= 3)
);

-- Add indexes
CREATE INDEX idx_profiles_username ON public.profiles(username);

-- Add comments
COMMENT ON TABLE public.profiles IS 'Stores public user profile information linked to authentication.';
COMMENT ON COLUMN public.profiles.id IS 'References the internal Supabase auth user ID.';

-- Secure the table with Row Level Security
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Policies for profiles table
CREATE POLICY "Public profiles are viewable by everyone." 
  ON public.profiles FOR SELECT 
  USING (true);

CREATE POLICY "Users can insert their own profile." 
  ON public.profiles FOR INSERT 
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update own profile." 
  ON public.profiles FOR UPDATE 
  USING (auth.uid() = id) 
  WITH CHECK (auth.uid() = id);

-- Optional: Trigger function to automatically create a profile when a new user signs up in auth.users
-- This matches the function mentioned in devlog.txt
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  -- Insert into public.profiles, only setting the id. Other fields can be populated later.
  -- Use COALESCE for potential null values from new user record if needed, e.g., new.email
  INSERT INTO public.profiles (id, email) 
  VALUES (new.id, new.email);
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create the trigger
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Function to automatically update updated_at timestamp (might already exist from other migrations)
-- CREATE OR REPLACE FUNCTION trigger_set_timestamp() ... (if not already created)

-- Trigger to set timestamp on profile update
CREATE TRIGGER set_profiles_timestamp
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION trigger_set_timestamp(); 