-- Adjust embedding vector dimension for Gemini model (768)
ALTER TABLE embeddings
ALTER COLUMN embedding TYPE vector(768); 