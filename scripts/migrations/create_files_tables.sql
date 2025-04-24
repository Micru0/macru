-- Create Files Table
CREATE TABLE IF NOT EXISTS public.files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  filename TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_url TEXT NOT NULL,
  file_type TEXT,
  file_size BIGINT NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  description TEXT,
  tags TEXT[] DEFAULT '{}',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Add RLS Policies for Files Table
ALTER TABLE public.files ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view their own files
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

-- Create Storage Bucket for Files
-- Note: This doesn't work in SQL migrations, must be done via Supabase dashboard or API
/* 
INSERT INTO storage.buckets (id, name, public)
VALUES ('files', 'files', TRUE)
ON CONFLICT (id) DO NOTHING;
*/

-- Create Storage RLS Policies
-- Note: This doesn't work in SQL migrations, must be done via Supabase dashboard or API
/*
-- Policy: Allow users to view their own files and public files
CREATE POLICY "Allow users to view their own files"
  ON storage.objects
  FOR SELECT
  USING (
    bucket_id = 'files' AND
    (
      auth.uid()::text = (storage.foldername(name))[1] OR
      (storage.foldername(name))[1] = 'public'
    )
  );

-- Policy: Allow users to upload their own files
CREATE POLICY "Allow users to upload their own files"
  ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'files' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );

-- Policy: Allow users to update their own files
CREATE POLICY "Allow users to update their own files"
  ON storage.objects
  FOR UPDATE
  USING (
    bucket_id = 'files' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );

-- Policy: Allow users to delete their own files
CREATE POLICY "Allow users to delete their own files"
  ON storage.objects
  FOR DELETE
  USING (
    bucket_id = 'files' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );
*/

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS files_user_id_idx ON public.files (user_id);
CREATE INDEX IF NOT EXISTS files_file_type_idx ON public.files (file_type);
CREATE INDEX IF NOT EXISTS files_created_at_idx ON public.files (created_at);

-- Clean up function to remove orphaned storage objects when files are deleted
CREATE OR REPLACE FUNCTION delete_storage_object()
RETURNS TRIGGER AS $$
DECLARE
  storage_object RECORD;
BEGIN
  -- Only proceed if file_path is available
  IF OLD.file_path IS NOT NULL THEN
    -- Using PERFORM instead of SELECT since we don't need the return value
    PERFORM FROM storage.objects
    WHERE name = OLD.file_path AND bucket_id = 'files';
    
    -- If object was found, delete it
    IF FOUND THEN
      DELETE FROM storage.objects
      WHERE name = OLD.file_path AND bucket_id = 'files';
    END IF;
  END IF;
  
  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger to clean up storage objects when files are deleted
DROP TRIGGER IF EXISTS delete_file_storage_object ON public.files;
CREATE TRIGGER delete_file_storage_object
AFTER DELETE ON public.files
FOR EACH ROW
EXECUTE FUNCTION delete_storage_object();

-- Comment on Table and Columns
COMMENT ON TABLE public.files IS 'Stores file metadata for user-uploaded files';
COMMENT ON COLUMN public.files.id IS 'Unique identifier for the file record';
COMMENT ON COLUMN public.files.filename IS 'Original filename of the uploaded file';
COMMENT ON COLUMN public.files.file_path IS 'Storage path of the file in the bucket';
COMMENT ON COLUMN public.files.file_url IS 'Public or signed URL to access the file';
COMMENT ON COLUMN public.files.file_type IS 'MIME type of the file';
COMMENT ON COLUMN public.files.file_size IS 'Size of the file in bytes';
COMMENT ON COLUMN public.files.user_id IS 'User ID of file owner';
COMMENT ON COLUMN public.files.description IS 'Optional user-provided description';
COMMENT ON COLUMN public.files.tags IS 'Array of tags for categorizing files';
COMMENT ON COLUMN public.files.metadata IS 'Additional metadata in JSON format';
COMMENT ON COLUMN public.files.created_at IS 'Timestamp when the file was uploaded';
COMMENT ON COLUMN public.files.updated_at IS 'Timestamp when the file metadata was last updated'; 