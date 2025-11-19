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
-- Service role can insert, authenticated users can insert their own
CREATE POLICY "Service role or user can insert usage"
ON public.usage_posts
FOR INSERT
WITH CHECK (
  -- Service role (using service_role key bypasses RLS, but this is for safety)
  current_setting('request.jwt.claims', true)::json->>'role' = 'service_role'
  OR
  -- Authenticated users can only insert their own records
  user_id = (select auth.uid())
);

-- Create optimized UPDATE policy (consolidated)
-- Service role can update, authenticated users can update their own
CREATE POLICY "Service role or user can update usage"
ON public.usage_posts
FOR UPDATE
USING (
  current_setting('request.jwt.claims', true)::json->>'role' = 'service_role'
  OR
  user_id = (select auth.uid())
)
WITH CHECK (
  current_setting('request.jwt.claims', true)::json->>'role' = 'service_role'
  OR
  user_id = (select auth.uid())
);

-- Create optimized DELETE policy (consolidated)
-- Service role can delete, authenticated users can delete their own
CREATE POLICY "Service role or user can delete usage"
ON public.usage_posts
FOR DELETE
USING (
  current_setting('request.jwt.claims', true)::json->>'role' = 'service_role'
  OR
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
-- Users can view their own entitlements, service role can view all
CREATE POLICY "Users can view entitlements"
ON public.entitlements
FOR SELECT
USING (
  current_setting('request.jwt.claims', true)::json->>'role' = 'service_role'
  OR
  user_id = (select auth.uid())
);

-- Create optimized INSERT policy
-- Only service role can insert entitlements
CREATE POLICY "Service role can insert entitlements"
ON public.entitlements
FOR INSERT
WITH CHECK (
  current_setting('request.jwt.claims', true)::json->>'role' = 'service_role'
);

-- Create optimized UPDATE policy (consolidated)
-- Service role can update any, users cannot update (entitlements are managed by system)
CREATE POLICY "Service role can update entitlements"
ON public.entitlements
FOR UPDATE
USING (
  current_setting('request.jwt.claims', true)::json->>'role' = 'service_role'
)
WITH CHECK (
  current_setting('request.jwt.claims', true)::json->>'role' = 'service_role'
);

-- Create optimized DELETE policy
-- Only service role can delete entitlements
CREATE POLICY "Service role can delete entitlements"
ON public.entitlements
FOR DELETE
USING (
  current_setting('request.jwt.claims', true)::json->>'role' = 'service_role'
);

