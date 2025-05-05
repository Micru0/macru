-- Update match_documents function to include optional filters for user_id and source_types

-- Explicitly drop the old function signature to avoid ambiguity
DROP FUNCTION IF EXISTS public.match_documents(vector(768), float, int);

-- Now create or replace with the new signature
CREATE OR REPLACE FUNCTION match_documents(
  query_embedding vector(768),
  match_threshold float DEFAULT 0.7,
  match_count int DEFAULT 10,
  filter_user_id uuid DEFAULT NULL, -- New optional parameter
  filter_source_types text[] DEFAULT NULL -- New optional parameter (e.g., ARRAY['notion', 'upload'])
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
SECURITY DEFINER -- Function executes with privileges of the user who defined it (usually postgres/superuser)
AS $$
DECLARE
  -- Removed DECLARE block as it wasn't used
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
    d.source_type AS document_type -- Use source_type from documents table
  FROM
    embeddings e
    JOIN chunks c ON e.chunk_id = c.id
    JOIN documents d ON c.document_id = d.id
  WHERE
    -- Filter by similarity threshold
    ((e.embedding <=> query_embedding) * -1 + 1) > match_threshold
    -- Apply user ID filter if provided (RLS is effectively bypassed by SECURITY DEFINER)
    AND (filter_user_id IS NULL OR d.user_id = filter_user_id)
    -- Apply source type filter if provided
    AND (filter_source_types IS NULL OR d.source_type = ANY(filter_source_types))
  ORDER BY
    similarity DESC
  LIMIT
    match_count;
END;
$$;

-- Configuration settings are typically handled by the function definition or ALTER FUNCTION
-- The SECURITY DEFINER clause allows bypassing RLS if the definer has permissions.
-- Explicitly setting ROLE might not be necessary if SECURITY DEFINER is sufficient.
-- However, keeping the RESET commands ensures a clean state, though they might be redundant now.

-- Reset role configuration for the function AFTER creating it (might be redundant with SECURITY DEFINER)
ALTER FUNCTION public.match_documents(vector(768), float, integer, uuid, text[]) RESET ROLE;
ALTER FUNCTION public.match_documents(vector(768), float, integer, uuid, text[]) RESET search_path;

COMMENT ON FUNCTION match_documents(vector(768), float, integer, uuid, text[]) IS 'Search for similar document chunks using vector similarity, with optional user and source type filters. Uses SECURITY DEFINER to access necessary data.'; 