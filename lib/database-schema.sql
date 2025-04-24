-- Create files table for storing file metadata
CREATE TABLE IF NOT EXISTS files (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  filename TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_type TEXT NOT NULL,
  file_size BIGINT NOT NULL,
  upload_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index on user_id for faster queries
CREATE INDEX IF NOT EXISTS idx_files_user_id ON files(user_id);

-- Create index on file_type for filtering by type
CREATE INDEX IF NOT EXISTS idx_files_file_type ON files(file_type);

-- Enable Row Level Security
ALTER TABLE files ENABLE ROW LEVEL SECURITY;

-- Create policies for files table
-- Allow users to select only their own files
CREATE POLICY "Users can view their own files"
  ON files FOR SELECT
  USING (auth.uid() = user_id);

-- Allow users to insert their own files
CREATE POLICY "Users can insert their own files"
  ON files FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Allow users to update their own files
CREATE POLICY "Users can update their own files"
  ON files FOR UPDATE
  USING (auth.uid() = user_id);

-- Allow users to delete their own files
CREATE POLICY "Users can delete their own files"
  ON files FOR DELETE
  USING (auth.uid() = user_id);

-- Storage Bucket RLS Policies
-- Note: Execute these manually in the Supabase SQL editor after creating the 'documents' bucket in the Supabase dashboard

-- Policy for the 'documents' bucket - read access
CREATE POLICY "Users can view their own documents"
  ON storage.objects FOR SELECT
  USING (auth.uid()::text = (storage.foldername(name))[1]);

-- Policy for the 'documents' bucket - insert access
CREATE POLICY "Users can upload their own documents"
  ON storage.objects FOR INSERT
  WITH CHECK (auth.uid()::text = (storage.foldername(name))[1]);

-- Policy for the 'documents' bucket - update access
CREATE POLICY "Users can update their own documents"
  ON storage.objects FOR UPDATE
  USING (auth.uid()::text = (storage.foldername(name))[1]);

-- Policy for the 'documents' bucket - delete access
CREATE POLICY "Users can delete their own documents"
  ON storage.objects FOR DELETE
  USING (auth.uid()::text = (storage.foldername(name))[1]); 