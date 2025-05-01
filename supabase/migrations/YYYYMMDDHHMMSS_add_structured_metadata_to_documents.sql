-- Migration for Task 15.1: Enhance Schema for Structured Metadata

-- Add common structured metadata columns to the documents table
-- Make sure these columns exist before trying to add them
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'documents' AND column_name = 'event_start_time') THEN
    ALTER TABLE public.documents ADD COLUMN event_start_time TIMESTAMPTZ NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'documents' AND column_name = 'event_end_time') THEN
    ALTER TABLE public.documents ADD COLUMN event_end_time TIMESTAMPTZ NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'documents' AND column_name = 'due_date') THEN
    ALTER TABLE public.documents ADD COLUMN due_date TIMESTAMPTZ NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'documents' AND column_name = 'status') THEN
    ALTER TABLE public.documents ADD COLUMN status TEXT NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'documents' AND column_name = 'priority') THEN
    ALTER TABLE public.documents ADD COLUMN priority TEXT NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'documents' AND column_name = 'participants') THEN
    ALTER TABLE public.documents ADD COLUMN participants TEXT[] NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'documents' AND column_name = 'location') THEN
    ALTER TABLE public.documents ADD COLUMN location TEXT NULL;
  END IF;
END $$;

-- Add indexes for efficient filtering on new columns
-- Using IF NOT EXISTS for idempotency
CREATE INDEX IF NOT EXISTS idx_documents_event_start_time ON public.documents(event_start_time) WHERE event_start_time IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_documents_event_end_time ON public.documents(event_end_time) WHERE event_end_time IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_documents_due_date ON public.documents(due_date) WHERE due_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_documents_status ON public.documents(status) WHERE status IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_documents_priority ON public.documents(priority) WHERE priority IS NOT NULL;
-- Optional GIN index for participants if array searching becomes common and performance requires it
-- CREATE INDEX IF NOT EXISTS idx_documents_participants ON public.documents USING GIN (participants);

-- Add comments for clarity
COMMENT ON COLUMN public.documents.event_start_time IS 'Start time for events (e.g., from Calendar).';
COMMENT ON COLUMN public.documents.event_end_time IS 'End time for events (e.g., from Calendar).';
COMMENT ON COLUMN public.documents.due_date IS 'Due date for tasks or other items.';
COMMENT ON COLUMN public.documents.status IS 'Status indicator (e.g., task status, document status).';
COMMENT ON COLUMN public.documents.priority IS 'Priority level (e.g., task priority).';
COMMENT ON COLUMN public.documents.participants IS 'List of participants or assignees.';
COMMENT ON COLUMN public.documents.location IS 'Location associated with the item (e.g., meeting location).';
COMMENT ON COLUMN public.documents.metadata IS 'JSONB field for storing less common or source-specific structured metadata.';
COMMENT ON COLUMN public.chunks.metadata IS 'JSONB field for storing chunk-level metadata (e.g., page number, heading).'; 