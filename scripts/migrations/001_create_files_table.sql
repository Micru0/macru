-- Create files table
CREATE TABLE IF NOT EXISTS public.files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  filename TEXT NOT NULL,
  file_path TEXT NOT NULL UNIQUE,
  file_type TEXT NOT NULL,
  file_size BIGINT NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  upload_date TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  description TEXT,
  tags TEXT[],
  metadata JSONB DEFAULT '{}'::JSONB
);

-- Add indexes for better performance
CREATE INDEX IF NOT EXISTS idx_files_user_id ON public.files(user_id);
CREATE INDEX IF NOT EXISTS idx_files_upload_date ON public.files(upload_date);

-- Create RLS policies for files table
ALTER TABLE public.files ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only view their own files
CREATE POLICY "Users can view their own files" 
  ON public.files
  FOR SELECT 
  USING (auth.uid() = user_id);

-- Policy: Users can insert their own files
CREATE POLICY "Users can insert their own files" 
  ON public.files
  FOR INSERT 
  WITH CHECK (auth.uid() = user_id);

-- Policy: Users can update their own files
CREATE POLICY "Users can update their own files" 
  ON public.files
  FOR UPDATE 
  USING (auth.uid() = user_id);

-- Policy: Users can delete their own files
CREATE POLICY "Users can delete their own files" 
  ON public.files
  FOR DELETE 
  USING (auth.uid() = user_id);

-- Storage bucket configuration (needs to be run in Supabase dashboard or via API)
-- Note: This SQL comment serves as documentation for setup via dashboard
/*
1. Create a new storage bucket named 'documents' in Supabase dashboard
   - Set visibility to 'private'
   - Enable file size limit and set to 50MB

2. Add the following RLS policies to the bucket:

-- Allow users to select their own files
CREATE POLICY "Users can view their own files"
  ON storage.objects
  FOR SELECT
  USING (auth.uid()::text = (storage.foldername(name))[1]);

-- Allow users to upload their own files
CREATE POLICY "Users can upload their own files"
  ON storage.objects
  FOR INSERT
  WITH CHECK (auth.uid()::text = (storage.foldername(name))[1]);

-- Allow users to update their own files
CREATE POLICY "Users can update their own files"
  ON storage.objects
  FOR UPDATE
  USING (auth.uid()::text = (storage.foldername(name))[1]);

-- Allow users to delete their own files
CREATE POLICY "Users can delete their own files"
  ON storage.objects
  FOR DELETE
  USING (auth.uid()::text = (storage.foldername(name))[1]);
*/ 