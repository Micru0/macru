-- Add action_confirmation_level column to profiles table IF IT DOES NOT EXIST
-- Default to 'all', requiring confirmation for all actions initially.
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS action_confirmation_level TEXT NOT NULL DEFAULT 'all' 
  CHECK (action_confirmation_level IN ('none', 'medium', 'high', 'all'));

-- Create action_logs table IF IT DOES NOT EXIST to record action execution attempts
CREATE TABLE IF NOT EXISTS public.action_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  action_type TEXT NOT NULL,          -- Type of action attempted (e.g., 'create-document', 'delete-account')
  params_snapshot JSONB NOT NULL,     -- Parameters provided for the action
  success BOOLEAN NOT NULL,           -- Whether the action completed successfully
  message TEXT,                       -- Optional success message or details
  error TEXT,                         -- Optional error message if the action failed
  ip_address TEXT,                    -- IP address of the client initiating the action
  user_agent TEXT,                    -- User agent string of the client
  CONSTRAINT fk_user
    FOREIGN KEY(user_id) 
    REFERENCES auth.users(id)
    ON DELETE CASCADE
);

-- Add index IF IT DOES NOT EXIST on user_id and timestamp for faster querying
CREATE INDEX IF NOT EXISTS idx_action_logs_user_timestamp ON public.action_logs(user_id, timestamp DESC);

-- Enable Row Level Security (RLS) for action_logs table
-- Note: This command itself doesn't error if RLS is already enabled.
ALTER TABLE public.action_logs ENABLE ROW LEVEL SECURITY;

-- Drop existing policies first to ensure idempotency
DROP POLICY IF EXISTS "Users can view their own logs" ON public.action_logs;
DROP POLICY IF EXISTS "Users can insert their own logs" ON public.action_logs;
-- DROP POLICY IF EXISTS "Allow service role full access" ON public.action_logs; -- If you uncomment the creation later

-- Policy: Users can view their own action logs
CREATE POLICY "Users can view their own logs" ON public.action_logs
  FOR SELECT USING (auth.uid() = user_id);

-- Policy: Allow authenticated users to insert their own log entries
CREATE POLICY "Users can insert their own logs" ON public.action_logs
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Policy: Allow service_role to bypass RLS (needed for logging from server-side functions)
-- Note: Direct inserts using user session should work without this if RLS is set up correctly
-- for the user, but service role might be needed depending on execution context.
-- CREATE POLICY "Allow service role full access" ON public.action_logs
--   FOR ALL USING (auth.role() = 'service_role');

-- Add comments for clarity
COMMENT ON COLUMN public.profiles.action_confirmation_level IS 'User-defined level required for action confirmation (none, medium, high, all).';
COMMENT ON TABLE public.action_logs IS 'Audit trail for actions executed or attempted within the system.';
COMMENT ON COLUMN public.action_logs.params_snapshot IS 'JSON snapshot of the parameters used for the action attempt.'; 