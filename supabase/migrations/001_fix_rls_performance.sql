-- Fix RLS Performance Issues
-- Run this in Supabase SQL Editor
-- This fixes auth function re-evaluation and consolidates duplicate policies

-- ============================================
-- 1. Fix usage_posts table RLS policies
-- ============================================

-- Drop existing policies that need optimization
DROP POLICY IF EXISTS "Users can view their own usage" ON public.usage_posts;
DROP POLICY IF EXISTS "Users can read own usage" ON public.usage_posts;
DROP POLICY IF EXISTS "Service role can insert/update usage" ON public.usage_posts;
DROP POLICY IF EXISTS "Service role can write usage" ON public.usage_posts;

-- Create optimized SELECT policy (consolidated)
-- Uses (select auth.uid()) to cache the result instead of re-evaluating for each row
CREATE POLICY "Users can view their own usage"
ON public.usage_posts
FOR SELECT
USING (
  user_id = (select auth.uid())
);

-- Create optimized INSERT policy (consolidated)
-- Authenticated users can insert their own records
-- Note: Service role (using service_role key) bypasses RLS entirely, so no need to check for it
CREATE POLICY "Users can insert their own usage"
ON public.usage_posts
FOR INSERT
WITH CHECK (
  user_id = (select auth.uid())
);

-- Create optimized UPDATE policy (consolidated)
-- Authenticated users can update their own records
CREATE POLICY "Users can update their own usage"
ON public.usage_posts
FOR UPDATE
USING (
  user_id = (select auth.uid())
)
WITH CHECK (
  user_id = (select auth.uid())
);

-- Create optimized DELETE policy (consolidated)
-- Authenticated users can delete their own records
CREATE POLICY "Users can delete their own usage"
ON public.usage_posts
FOR DELETE
USING (
  user_id = (select auth.uid())
);

-- ============================================
-- 2. Fix entitlements table RLS policies
-- ============================================

-- Drop existing policies that need optimization
DROP POLICY IF EXISTS "Users can view their own entitlements" ON public.entitlements;
DROP POLICY IF EXISTS "Service role can update entitlements" ON public.entitlements;
DROP POLICY IF EXISTS "Entitlements access" ON public.entitlements;

-- Create optimized SELECT policy (consolidated)
-- Users can view their own entitlements
-- Note: Service role (using service_role key) bypasses RLS entirely
CREATE POLICY "Users can view their own entitlements"
ON public.entitlements
FOR SELECT
USING (
  user_id = (select auth.uid())
);

-- Note: INSERT, UPDATE, DELETE for entitlements are handled by service role
-- which bypasses RLS. If you need RLS for these operations, uncomment below:
-- 
-- CREATE POLICY "Users cannot insert entitlements"
-- ON public.entitlements
-- FOR INSERT
-- WITH CHECK (false);
--
-- CREATE POLICY "Users cannot update entitlements"
-- ON public.entitlements
-- FOR UPDATE
-- USING (false)
-- WITH CHECK (false);
--
-- CREATE POLICY "Users cannot delete entitlements"
-- ON public.entitlements
-- FOR DELETE
-- USING (false);

