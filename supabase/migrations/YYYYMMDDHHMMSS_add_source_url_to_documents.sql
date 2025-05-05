-- Add source_url column to documents table to store the original URL
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'documents' AND column_name = 'source_url') THEN
    ALTER TABLE public.documents ADD COLUMN source_url TEXT NULL;
    COMMENT ON COLUMN public.documents.source_url IS 'Original URL of the source document (e.g., Notion page URL, external file link).';
    -- Optional: Add an index if we expect to query by URL often
    -- CREATE INDEX IF NOT EXISTS idx_documents_source_url ON public.documents(source_url) WHERE source_url IS NOT NULL;
  END IF;
END $$; 