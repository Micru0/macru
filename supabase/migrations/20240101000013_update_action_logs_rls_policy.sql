-- Drop the existing policy first (using the name from your migration file)
DROP POLICY IF EXISTS "Users can insert their own logs" ON public.action_logs;

-- Create a new policy allowing insert by user OR service_role
CREATE POLICY "Allow insert by user or service_role"
ON public.action_logs
FOR INSERT
WITH CHECK (
  (auth.uid() = user_id) OR (current_setting('request.jwt.claims', true)::jsonb ->> 'role' = 'service_role')
);

-- Ensure the SELECT policy is still in place (re-add if necessary)
DROP POLICY IF EXISTS "Users can view their own logs" ON public.action_logs;
CREATE POLICY "Users can view their own logs"
ON public.action_logs
FOR SELECT USING (auth.uid() = user_id);