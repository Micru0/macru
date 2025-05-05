-- Drop the existing function signature first (using the signature from the error message)
DROP FUNCTION IF EXISTS public.match_documents(vector, double precision, integer, uuid, text[], timestamp with time zone, timestamp with time zone, timestamp with time zone, timestamp with time zone, timestamp with time zone, timestamp with time zone, text, text, text, text[]);

-- Now, create or replace the function with the new return signature
CREATE OR REPLACE FUNCTION match_documents(
  query_embedding vector(768),
  match_threshold float DEFAULT 0.7,
  match_count int DEFAULT 10,
  filter_user_id uuid DEFAULT NULL,
  filter_source_types text[] DEFAULT NULL,
  filter_event_start_time_before timestamptz DEFAULT NULL,
  filter_event_start_time_after timestamptz DEFAULT NULL,
  filter_event_end_time_before timestamptz DEFAULT NULL,
  filter_event_end_time_after timestamptz DEFAULT NULL,
  filter_due_date_before timestamptz DEFAULT NULL,
  filter_due_date_after timestamptz DEFAULT NULL,
  filter_content_status text DEFAULT NULL,
  filter_priority text DEFAULT NULL,
  filter_location text DEFAULT NULL,
  filter_participants text[] DEFAULT NULL
)
-- ADD the structured columns to the RETURNS TABLE definition
RETURNS TABLE (
  id uuid,               -- Chunk ID
  content text,          -- Chunk content
  chunk_index int,       -- Chunk index
  document_id uuid,      -- Document ID
  metadata jsonb,        -- Chunk metadata
  created_at timestamptz,   -- Chunk creation time
  similarity float,      -- Similarity score
  document_title text,   -- Document title
  document_type text,    -- Document source type
  event_start_time TIMESTAMPTZ, -- ADDED
  event_end_time TIMESTAMPTZ,   -- ADDED
  due_date TIMESTAMPTZ,         -- ADDED
  content_status TEXT,          -- ADDED
  priority TEXT,                -- ADDED
  location TEXT,                -- ADDED
  participants TEXT[]           -- ADDED
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    c.id,
    c.content,
    c.chunk_index,
    c.document_id,
    c.metadata,
    c.created_at,
    (e.embedding <=> query_embedding) * -1 + 1 AS similarity,
    d.title AS document_title,
    d.source_type AS document_type,
    -- SELECT THE ADDED STRUCTURED COLUMNS
    d.event_start_time,
    d.event_end_time,
    d.due_date,
    d.content_status,
    d.priority,
    d.location,
    d.participants
  FROM
    embeddings e
    JOIN chunks c ON e.chunk_id = c.id
    JOIN documents d ON c.document_id = d.id
  WHERE
    ((e.embedding <=> query_embedding) * -1 + 1) > match_threshold
    AND (filter_user_id IS NULL OR d.user_id = filter_user_id)
    AND (filter_source_types IS NULL OR d.source_type = ANY(filter_source_types))
    AND (filter_event_start_time_before IS NULL OR d.event_start_time <= filter_event_start_time_before)
    AND (filter_event_start_time_after IS NULL OR d.event_start_time >= filter_event_start_time_after)
    AND (filter_event_end_time_before IS NULL OR d.event_end_time <= filter_event_end_time_before)
    AND (filter_event_end_time_after IS NULL OR d.event_end_time >= filter_event_end_time_after)
    AND (filter_due_date_before IS NULL OR d.due_date <= filter_due_date_before)
    AND (filter_due_date_after IS NULL OR d.due_date >= filter_due_date_after)
    AND (filter_content_status IS NULL OR d.content_status = filter_content_status)
    AND (filter_priority IS NULL OR d.priority = filter_priority)
    AND (filter_location IS NULL OR d.location = filter_location)
    AND (filter_participants IS NULL OR d.participants @> filter_participants)
  ORDER BY
    similarity DESC
  LIMIT
    match_count;
END;
$$;

-- Update the comment on the function with the full parameter list
COMMENT ON FUNCTION match_documents(
  vector(768), float, integer, uuid, text[], timestamptz, timestamptz,
  timestamptz, timestamptz, timestamptz, timestamptz, text, text, text, text[]
) IS 'Search for similar document chunks using vector similarity AND structured metadata filters, returning chunk data AND structured metadata from the parent document. Uses SECURITY DEFINER.'; 