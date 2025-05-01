-- Migration to restore the original ingestion status column if missing

-- Add the original 'status' column back to the documents table if it doesn't exist
-- This column tracks the document processing/ingestion status.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'documents' AND column_name = 'status') THEN
    ALTER TABLE public.documents ADD COLUMN status TEXT NOT NULL DEFAULT 'pending';
    
    -- Add the index back if it doesn't exist
    CREATE INDEX IF NOT EXISTS documents_status_idx ON documents(status);
    
    -- Add comment for clarity
    COMMENT ON COLUMN public.documents.status IS 'Tracks the processing status of the document (pending, processing, processed, error).';

    -- Optionally update existing rows where status might be null (shouldn't happen if NOT NULL constraint added)
    -- UPDATE public.documents SET status = 'pending' WHERE status IS NULL;

  END IF;
END $$; 