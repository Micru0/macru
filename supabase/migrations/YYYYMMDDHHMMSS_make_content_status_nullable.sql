-- Migration to ensure content_status column is nullable

DO $$
DECLARE
    col_is_nullable TEXT;
BEGIN
    -- Check if the column exists and get its nullability status
    SELECT is_nullable
    INTO col_is_nullable
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'documents'
      AND column_name = 'content_status';

    -- If the column exists and is NOT nullable, make it nullable
    IF FOUND AND col_is_nullable = 'NO' THEN
        RAISE NOTICE 'Column content_status exists and is NOT NULL. Altering to allow NULLs.';
        ALTER TABLE public.documents ALTER COLUMN content_status DROP NOT NULL;
    ELSIF FOUND AND col_is_nullable = 'YES' THEN
         RAISE NOTICE 'Column content_status already allows NULLs. No change needed.';
    ELSE
         RAISE NOTICE 'Column content_status does not exist. Cannot alter nullability.';
    END IF;
END $$;

-- Add/Update comment for clarity, confirming it allows NULLs
COMMENT ON COLUMN public.documents.content_status IS 'Status indicator related to the content (e.g., task status, document status), distinct from ingestion status. Allows NULL values.'; 