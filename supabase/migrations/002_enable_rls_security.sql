-- Enable RLS and Create Security Policies
-- Run this in Supabase SQL Editor
-- This enables Row Level Security on tables that are currently exposed but unprotected

-- ============================================
-- 1. subscriptions table
-- ============================================

-- Enable RLS
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

-- Drop existing policy if it exists (idempotent)
DROP POLICY IF EXISTS "Users can view their own subscriptions" ON public.subscriptions;

-- Users can view their own subscriptions
CREATE POLICY "Users can view their own subscriptions"
ON public.subscriptions
FOR SELECT
USING (
  user_id = (select auth.uid())
);

-- Note: INSERT, UPDATE, DELETE are handled by service role
-- which bypasses RLS. If you need RLS for these operations, uncomment:
-- 
-- CREATE POLICY "Users cannot insert subscriptions"
-- ON public.subscriptions
-- FOR INSERT
-- WITH CHECK (false);
--
-- CREATE POLICY "Users cannot update subscriptions"
-- ON public.subscriptions
-- FOR UPDATE
-- USING (false)
-- WITH CHECK (false);
--
-- CREATE POLICY "Users cannot delete subscriptions"
-- ON public.subscriptions
-- FOR DELETE
-- USING (false);

-- ============================================
-- 2. social_connections table
-- ============================================

-- Enable RLS
ALTER TABLE public.social_connections ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (idempotent)
DROP POLICY IF EXISTS "Users can view their own social connections" ON public.social_connections;
DROP POLICY IF EXISTS "Users can insert their own social connections" ON public.social_connections;
DROP POLICY IF EXISTS "Users can update their own social connections" ON public.social_connections;
DROP POLICY IF EXISTS "Users can delete their own social connections" ON public.social_connections;

-- Users can view their own social connections
CREATE POLICY "Users can view their own social connections"
ON public.social_connections
FOR SELECT
USING (
  user_id = (select auth.uid())
);

-- Users can insert their own social connections
CREATE POLICY "Users can insert their own social connections"
ON public.social_connections
FOR INSERT
WITH CHECK (
  user_id = (select auth.uid())
);

-- Users can update their own social connections
CREATE POLICY "Users can update their own social connections"
ON public.social_connections
FOR UPDATE
USING (
  user_id = (select auth.uid())
)
WITH CHECK (
  user_id = (select auth.uid())
);

-- Users can delete their own social connections
CREATE POLICY "Users can delete their own social connections"
ON public.social_connections
FOR DELETE
USING (
  user_id = (select auth.uid())
);

-- ============================================
-- 3. plan_waitlist table
-- ============================================

-- Enable RLS
ALTER TABLE public.plan_waitlist ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (idempotent)
DROP POLICY IF EXISTS "Anyone can join waitlist" ON public.plan_waitlist;
DROP POLICY IF EXISTS "Users can view their own waitlist entries" ON public.plan_waitlist;

-- Anyone (including anonymous) can insert into waitlist
-- This allows the public waitlist form to work
CREATE POLICY "Anyone can join waitlist"
ON public.plan_waitlist
FOR INSERT
WITH CHECK (true);

-- Users can view their own waitlist entries
CREATE POLICY "Users can view their own waitlist entries"
ON public.plan_waitlist
FOR SELECT
USING (
  user_id = (select auth.uid())
  OR
  user_id IS NULL  -- Allow viewing entries without user_id (anonymous signups)
);

-- Note: UPDATE and DELETE are typically not needed for waitlist
-- Service role can manage waitlist entries if needed

-- ============================================
-- 4. brands table (if it exists and is used)
-- ============================================
-- Note: Based on codebase analysis, brands appear to be stored in Airtable, not Supabase
-- If this table exists but is unused, you may want to either:
-- 1. Drop the table if it's not needed
-- 2. Enable RLS if it is used

-- Uncomment below if brands table is actually used:
--
-- ALTER TABLE public.brands ENABLE ROW LEVEL SECURITY;
--
-- CREATE POLICY "Users can view their own brands"
-- ON public.brands
-- FOR SELECT
-- USING (
--   user_id = (select auth.uid())
-- );
--
-- CREATE POLICY "Users can insert their own brands"
-- ON public.brands
-- FOR INSERT
-- WITH CHECK (
--   user_id = (select auth.uid())
-- );
--
-- CREATE POLICY "Users can update their own brands"
-- ON public.brands
-- FOR UPDATE
-- USING (
--   user_id = (select auth.uid())
-- )
-- WITH CHECK (
--   user_id = (select auth.uid())
-- );
--
-- CREATE POLICY "Users can delete their own brands"
-- ON public.brands
-- FOR DELETE
-- USING (
--   user_id = (select auth.uid())
-- );

-- ============================================
-- 5. channels table (if it exists and is used)
-- ============================================
-- Note: channels table was not found in codebase usage
-- If this table exists but is unused, you may want to either:
-- 1. Drop the table if it's not needed
-- 2. Enable RLS if it is used

-- Uncomment below if channels table is actually used:
--
-- ALTER TABLE public.channels ENABLE ROW LEVEL SECURITY;
--
-- CREATE POLICY "Users can view their own channels"
-- ON public.channels
-- FOR SELECT
-- USING (
--   user_id = (select auth.uid())
-- );
--
-- CREATE POLICY "Users can insert their own channels"
-- ON public.channels
-- FOR INSERT
-- WITH CHECK (
--   user_id = (select auth.uid())
-- );
--
-- CREATE POLICY "Users can update their own channels"
-- ON public.channels
-- FOR UPDATE
-- USING (
--   user_id = (select auth.uid())
-- )
-- WITH CHECK (
--   user_id = (select auth.uid())
-- );
--
-- CREATE POLICY "Users can delete their own channels"
-- ON public.channels
-- FOR DELETE
-- USING (
--   user_id = (select auth.uid())
-- );

