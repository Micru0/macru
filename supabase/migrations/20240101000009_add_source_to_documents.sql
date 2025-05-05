-- Add source_id and source_type columns to the documents table
ALTER TABLE documents
ADD COLUMN IF NOT EXISTS source_id TEXT,
ADD COLUMN IF NOT EXISTS source_type TEXT;

-- Add an index for faster lookups based on source
CREATE INDEX IF NOT EXISTS documents_source_idx ON documents(user_id, source_type, source_id);

-- Optional: Update RLS policies if needed to specifically consider source_id/source_type
-- For now, existing policies based on user_id should suffice. 