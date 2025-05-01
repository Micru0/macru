-- Update match_documents function to support hybrid search with structured metadata filters

-- Explicitly drop the old function signature to ensure we are replacing the correct one
DROP FUNCTION IF EXISTS public.match_documents(vector(768), float, int, uuid, text[]);

-- Create or replace function with new structured metadata filter parameters
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
  filter_participants text[] DEFAULT NULL -- Assuming TEXT array based on previous migration
)
RETURNS TABLE (
  id uuid,
  content text,
  chunk_index int,
  document_id uuid,
  metadata jsonb,
  created_at timestamptz,
  similarity float,
  document_title text,
  document_type text
)
LANGUAGE plpgsql
SECURITY DEFINER -- Use definer privileges to bypass RLS for filtering
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
    d.source_type AS document_type
  FROM
    embeddings e
    JOIN chunks c ON e.chunk_id = c.id
    JOIN documents d ON c.document_id = d.id
  WHERE
    -- 1. Vector similarity filter (applied first if possible by query planner)
    ((e.embedding <=> query_embedding) * -1 + 1) > match_threshold

    -- 2. Basic Ownership/Source Filters
    AND (filter_user_id IS NULL OR d.user_id = filter_user_id)
    AND (filter_source_types IS NULL OR d.source_type = ANY(filter_source_types))

    -- 3. Structured Metadata Filters (only applied if parameter is not NULL)
    AND (filter_event_start_time_before IS NULL OR d.event_start_time <= filter_event_start_time_before)
    AND (filter_event_start_time_after IS NULL OR d.event_start_time >= filter_event_start_time_after)
    AND (filter_event_end_time_before IS NULL OR d.event_end_time <= filter_event_end_time_before)
    AND (filter_event_end_time_after IS NULL OR d.event_end_time >= filter_event_end_time_after)
    AND (filter_due_date_before IS NULL OR d.due_date <= filter_due_date_before)
    AND (filter_due_date_after IS NULL OR d.due_date >= filter_due_date_after)
    AND (filter_content_status IS NULL OR d.content_status = filter_content_status)
    AND (filter_priority IS NULL OR d.priority = filter_priority)
    AND (filter_location IS NULL OR d.location = filter_location)
    AND (filter_participants IS NULL OR d.participants @> filter_participants) -- Use array contains operator @>

  ORDER BY
    similarity DESC
  LIMIT
    match_count;
END;
$$;

-- Reset any specific role/search_path configurations if needed (though SECURITY DEFINER usually handles this)
-- Using the full parameter list in the ALTER statement
ALTER FUNCTION public.match_documents(
  vector(768), float, integer, uuid, text[], timestamptz, timestamptz,
  timestamptz, timestamptz, timestamptz, timestamptz, text, text, text, text[]
) RESET ROLE;

ALTER FUNCTION public.match_documents(
  vector(768), float, integer, uuid, text[], timestamptz, timestamptz,
  timestamptz, timestamptz, timestamptz, timestamptz, text, text, text, text[]
) RESET search_path;

-- Update comment to reflect new capabilities
COMMENT ON FUNCTION match_documents(
  vector(768), float, integer, uuid, text[], timestamptz, timestamptz,
  timestamptz, timestamptz, timestamptz, timestamptz, text, text, text, text[]
) IS 'Search for similar document chunks using vector similarity, with optional user, source type, and structured metadata filters (dates, status, priority, location, participants). Uses SECURITY DEFINER.'; 