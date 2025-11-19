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
-- 4. brands table
-- ============================================
-- Enable RLS for brands table (required by Supabase security advisor)
-- Note: This table may not have a user_id column. Adjust policies based on actual schema.

-- First, check if table exists and enable RLS
DO $$
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'brands') THEN
    ALTER TABLE public.brands ENABLE ROW LEVEL SECURITY;
    
    -- Drop existing policies if they exist (idempotent)
    DROP POLICY IF EXISTS "Users can view their own brands" ON public.brands;
    DROP POLICY IF EXISTS "Users can insert their own brands" ON public.brands;
    DROP POLICY IF EXISTS "Users can update their own brands" ON public.brands;
    DROP POLICY IF EXISTS "Users can delete their own brands" ON public.brands;
    
    -- Check if user_id column exists, if so create user-based policies
    IF EXISTS (SELECT FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'brands' AND column_name = 'user_id') THEN
      -- Users can view their own brands
      CREATE POLICY "Users can view their own brands"
      ON public.brands
      FOR SELECT
      USING (
        user_id = (select auth.uid())
      );

      -- Users can insert their own brands
      CREATE POLICY "Users can insert their own brands"
      ON public.brands
      FOR INSERT
      WITH CHECK (
        user_id = (select auth.uid())
      );

      -- Users can update their own brands
      CREATE POLICY "Users can update their own brands"
      ON public.brands
      FOR UPDATE
      USING (
        user_id = (select auth.uid())
      )
      WITH CHECK (
        user_id = (select auth.uid())
      );

      -- Users can delete their own brands
      CREATE POLICY "Users can delete their own brands"
      ON public.brands
      FOR DELETE
      USING (
        user_id = (select auth.uid())
      );
    ELSE
      -- If no user_id column, restrict all access (only service role can access)
      -- This is a safe default - adjust based on your actual schema
      CREATE POLICY "Service role only - brands"
      ON public.brands
      FOR ALL
      USING (false)
      WITH CHECK (false);
    END IF;
  END IF;
END $$;

-- ============================================
-- 5. channels table
-- ============================================
-- Enable RLS for channels table (required by Supabase security advisor)
-- Note: This table may not have a user_id column. Adjust policies based on actual schema.

-- First, check if table exists and enable RLS
DO $$
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'channels') THEN
    ALTER TABLE public.channels ENABLE ROW LEVEL SECURITY;
    
    -- Drop existing policies if they exist (idempotent)
    DROP POLICY IF EXISTS "Users can view their own channels" ON public.channels;
    DROP POLICY IF EXISTS "Users can insert their own channels" ON public.channels;
    DROP POLICY IF EXISTS "Users can update their own channels" ON public.channels;
    DROP POLICY IF EXISTS "Users can delete their own channels" ON public.channels;
    DROP POLICY IF EXISTS "Service role only - channels" ON public.channels;
    
    -- Check if user_id column exists, if so create user-based policies
    IF EXISTS (SELECT FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'channels' AND column_name = 'user_id') THEN
      -- Users can view their own channels
      CREATE POLICY "Users can view their own channels"
      ON public.channels
      FOR SELECT
      USING (
        user_id = (select auth.uid())
      );

      -- Users can insert their own channels
      CREATE POLICY "Users can insert their own channels"
      ON public.channels
      FOR INSERT
      WITH CHECK (
        user_id = (select auth.uid())
      );

      -- Users can update their own channels
      CREATE POLICY "Users can update their own channels"
      ON public.channels
      FOR UPDATE
      USING (
        user_id = (select auth.uid())
      )
      WITH CHECK (
        user_id = (select auth.uid())
      );

      -- Users can delete their own channels
      CREATE POLICY "Users can delete their own channels"
      ON public.channels
      FOR DELETE
      USING (
        user_id = (select auth.uid())
      );
    ELSE
      -- If no user_id column, restrict all access (only service role can access)
      -- This is a safe default - adjust based on your actual schema
      CREATE POLICY "Service role only - channels"
      ON public.channels
      FOR ALL
      USING (false)
      WITH CHECK (false);
    END IF;
  END IF;
END $$;

