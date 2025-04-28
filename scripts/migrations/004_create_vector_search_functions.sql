-- Vector search functions for CAG system

-- Create a PostgreSQL function for vector similarity search
CREATE OR REPLACE FUNCTION match_documents(
  query_embedding vector(768),
  match_threshold float DEFAULT 0.7,
  match_count int DEFAULT 10
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
SECURITY DEFINER
AS $$
BEGIN
  -- Return chunks with their similarity scores and document info
  RETURN QUERY
  SELECT
    c.id,
    c.content,
    c.chunk_index,
    c.document_id,
    c.metadata,
    c.created_at,
    -- Calculate cosine similarity between query embedding and chunk embedding
    -- Higher score means more similar (1.0 is exact match)
    (e.embedding <=> query_embedding) * -1 + 1 AS similarity,
    d.title AS document_title,
    d.file_type AS document_type
  FROM
    embeddings e
    JOIN chunks c ON e.chunk_id = c.id
    JOIN documents d ON c.document_id = d.id
  WHERE
    -- Only include results that meet the threshold
    (e.embedding <=> query_embedding) * -1 + 1 > match_threshold
    -- RLS will further filter for the current user's documents
  ORDER BY
    -- Sort by similarity (most similar first)
    similarity DESC
  LIMIT
    match_count;
END;
$$;

-- Create an index optimization hint for the vector search
COMMENT ON FUNCTION match_documents IS 'Search for similar document chunks using vector similarity'; 