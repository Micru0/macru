-- Enable pgsodium extension if not already enabled
CREATE EXTENSION IF NOT EXISTS pgsodium WITH SCHEMA pgsodium;

-- Table to store encrypted access tokens for various connectors
CREATE TABLE IF NOT EXISTS public.connector_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  connector_type TEXT NOT NULL, -- e.g., 'notion', 'google_calendar'
  -- Encrypt tokens using pgsodium
  access_token BYTEA NOT NULL, -- Encrypted access token
  refresh_token BYTEA,         -- Encrypted refresh token (optional)
  scopes TEXT[],               -- Scopes granted (optional)
  expires_at TIMESTAMPTZ,       -- Token expiry time (optional)
  account_identifier TEXT,     -- Associated account identifier (e.g., workspace name, email)
  workspace_icon TEXT,         -- Store workspace icon URL or emoji (optional)
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  
  -- Ensure a user has only one token per connector type
  UNIQUE (user_id, connector_type)
);

-- Index for efficient lookup by user and connector type
CREATE INDEX IF NOT EXISTS idx_connector_tokens_user_connector ON public.connector_tokens(user_id, connector_type);

-- Function to automatically update 'updated_at' timestamp
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
   NEW.updated_at = timezone('utc', now());
   RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_connector_tokens_updated_at
  BEFORE UPDATE ON public.connector_tokens
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Enable Row Level Security (RLS)
ALTER TABLE public.connector_tokens ENABLE ROW LEVEL SECURITY;

-- Policy: Users can manage their own connector tokens
CREATE POLICY "Users can manage their own connector tokens" 
  ON public.connector_tokens
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Grant necessary permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON public.connector_tokens TO authenticated;

-- Comment on table and columns for clarity
COMMENT ON TABLE public.connector_tokens IS 'Stores encrypted access tokens and metadata for third-party service integrations.';
COMMENT ON COLUMN public.connector_tokens.connector_type IS 'Identifier for the connected service (e.g., notion, google_calendar).';
COMMENT ON COLUMN public.connector_tokens.access_token IS 'Encrypted access token using pgsodium.';
COMMENT ON COLUMN public.connector_tokens.refresh_token IS 'Encrypted refresh token using pgsodium (if applicable).';
COMMENT ON COLUMN public.connector_tokens.account_identifier IS 'User-friendly identifier for the connected account (e.g., workspace name, email).'; 