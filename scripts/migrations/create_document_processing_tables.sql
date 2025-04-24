-- Enable pgvector extension for vector similarity search
CREATE EXTENSION IF NOT EXISTS vector;

-- Create Documents table
CREATE TABLE IF NOT EXISTS documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_type TEXT,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending', -- pending, processing, processed, error
  error_message TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create Chunks table
CREATE TABLE IF NOT EXISTS chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  chunk_index INTEGER NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create Embeddings table
CREATE TABLE IF NOT EXISTS embeddings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chunk_id UUID NOT NULL REFERENCES chunks(id) ON DELETE CASCADE,
  embedding VECTOR(1536), -- Adjust vector dimension based on the embedding model (1536 for OpenAI, 768 for Gemini)
  model TEXT NOT NULL, -- Store which model generated the embedding
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS documents_user_id_idx ON documents(user_id);
CREATE INDEX IF NOT EXISTS documents_status_idx ON documents(status);
CREATE INDEX IF NOT EXISTS chunks_document_id_idx ON chunks(document_id);
CREATE INDEX IF NOT EXISTS embeddings_chunk_id_idx ON embeddings(chunk_id);

-- Create a vector index on embeddings
CREATE INDEX IF NOT EXISTS embeddings_vector_idx ON embeddings USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100); -- Number of lists can be adjusted based on dataset size

-- Row Level Security (RLS) policies
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE embeddings ENABLE ROW LEVEL SECURITY;

-- Documents RLS policies
CREATE POLICY "Users can view their own documents"
  ON documents FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own documents"
  ON documents FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own documents"
  ON documents FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own documents"
  ON documents FOR DELETE
  USING (auth.uid() = user_id);

-- Chunks RLS policies (through document ownership)
CREATE POLICY "Users can view chunks of their own documents"
  ON chunks FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM documents
    WHERE documents.id = chunks.document_id AND documents.user_id = auth.uid()
  ));

CREATE POLICY "Users can insert chunks for their own documents"
  ON chunks FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM documents
    WHERE documents.id = chunks.document_id AND documents.user_id = auth.uid()
  ));

CREATE POLICY "Users can update chunks of their own documents"
  ON chunks FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM documents
    WHERE documents.id = chunks.document_id AND documents.user_id = auth.uid()
  ));

CREATE POLICY "Users can delete chunks of their own documents"
  ON chunks FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM documents
    WHERE documents.id = chunks.document_id AND documents.user_id = auth.uid()
  ));

-- Embeddings RLS policies (through chunk and document ownership)
CREATE POLICY "Users can view embeddings of their own documents"
  ON embeddings FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM chunks
    JOIN documents ON chunks.document_id = documents.id
    WHERE chunks.id = embeddings.chunk_id AND documents.user_id = auth.uid()
  ));

CREATE POLICY "Users can insert embeddings for their own documents"
  ON embeddings FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM chunks
    JOIN documents ON chunks.document_id = documents.id
    WHERE chunks.id = embeddings.chunk_id AND documents.user_id = auth.uid()
  ));

CREATE POLICY "Users can update embeddings of their own documents"
  ON embeddings FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM chunks
    JOIN documents ON chunks.document_id = documents.id
    WHERE chunks.id = embeddings.chunk_id AND documents.user_id = auth.uid()
  ));

CREATE POLICY "Users can delete embeddings of their own documents"
  ON embeddings FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM chunks
    JOIN documents ON chunks.document_id = documents.id
    WHERE chunks.id = embeddings.chunk_id AND documents.user_id = auth.uid()
  ));

-- Function to automatically update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update the updated_at timestamp
CREATE TRIGGER update_documents_updated_at
BEFORE UPDATE ON documents
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column(); 