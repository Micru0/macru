-- Migration script for creating memory system tables

-- Ensure necessary extensions are enabled (like uuid-ossp if not already)
-- CREATE EXTENSION IF NOT EXISTS "uuid-ossp"; 

-- Define ENUM types for memory properties (matching TypeScript enums)
CREATE TYPE memory_type AS ENUM (
  'fact',
  'conversation_summary',
  'user_goal',
  'entity_info',
  'other'
);

CREATE TYPE memory_priority AS ENUM (
  'low',
  'medium',
  'high'
);

-- Create the main table for storing memory items
CREATE TABLE memory_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content TEXT NOT NULL, -- Consider if this should be encrypted
  type memory_type NOT NULL DEFAULT 'other',
  priority memory_priority NOT NULL DEFAULT 'medium',
  source_interaction_id TEXT, -- Could reference a conversation ID or similar
  relevance_score REAL DEFAULT 0.5, -- Normalized relevance score (0-1)
  last_accessed_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  metadata JSONB DEFAULT '{}', 
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  -- Ensure content is not empty
  CONSTRAINT content_not_empty CHECK (char_length(content) > 0)
);

-- Add indexes for efficient querying
CREATE INDEX idx_memory_items_user_id ON memory_items(user_id);
CREATE INDEX idx_memory_items_type ON memory_items(type);
CREATE INDEX idx_memory_items_priority ON memory_items(priority);
CREATE INDEX idx_memory_items_last_accessed_at ON memory_items(last_accessed_at DESC);

-- Optional: GIN index for metadata searching if needed
-- CREATE INDEX idx_memory_items_metadata ON memory_items USING GIN (metadata);

-- Automatically update updated_at timestamp on modification
CREATE OR REPLACE FUNCTION trigger_set_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_memory_items_timestamp
BEFORE UPDATE ON memory_items
FOR EACH ROW
EXECUTE FUNCTION trigger_set_timestamp();

-- Row Level Security (RLS) Policies
ALTER TABLE memory_items ENABLE ROW LEVEL SECURITY;

-- Users can view their own memory items
CREATE POLICY "Users can view own memory items" 
ON memory_items FOR SELECT 
USING (auth.uid() = user_id);

-- Users can insert their own memory items
CREATE POLICY "Users can insert own memory items" 
ON memory_items FOR INSERT 
WITH CHECK (auth.uid() = user_id);

-- Users can update their own memory items
CREATE POLICY "Users can update own memory items" 
ON memory_items FOR UPDATE 
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Users can delete their own memory items
CREATE POLICY "Users can delete own memory items" 
ON memory_items FOR DELETE 
USING (auth.uid() = user_id);

-- Add comments for clarity
COMMENT ON TABLE memory_items IS 'Stores individual pieces of personalized memory for users.';
COMMENT ON COLUMN memory_items.content IS 'The text content of the memory item. Consider encrypting sensitive info.';
COMMENT ON COLUMN memory_items.type IS 'Categorization of the memory content.';
COMMENT ON COLUMN memory_items.priority IS 'Importance level assigned to the memory.';
COMMENT ON COLUMN memory_items.relevance_score IS 'Computed relevance score, potentially updated during retrieval.';
COMMENT ON COLUMN memory_items.last_accessed_at IS 'Timestamp of the last time this memory was considered relevant or used.'; 