-- Migration to rename the structured metadata status column for clarity

-- Rename the 'status' column added for structured metadata to 'content_status'
-- Use IF EXISTS checks for column existence before renaming
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'documents' AND column_name = 'status') AND
     NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'documents' AND column_name = 'content_status') THEN
    ALTER TABLE public.documents RENAME COLUMN status TO content_status;
  END IF;
END $$;

-- Update the index name as well
-- Use IF EXISTS checks for index existence
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'documents' AND indexname = 'idx_documents_status') AND
     NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'documents' AND indexname = 'idx_documents_content_status') THEN
      ALTER INDEX idx_documents_status RENAME TO idx_documents_content_status;
  END IF;
END $$;

-- Update the comment on the renamed column
COMMENT ON COLUMN public.documents.content_status IS 'Status indicator related to the content (e.g., task status, document status), distinct from ingestion status.'; 