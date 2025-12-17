-- Fix Security Issues for strategy_notifications table
-- 1. Enable RLS on strategy_notifications table
-- 2. Fix function search_path security issue
-- 3. Create appropriate RLS policies

-- ============================================
-- 1. Enable RLS on strategy_notifications
-- ============================================

ALTER TABLE public.strategy_notifications ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (idempotent)
DROP POLICY IF EXISTS "Users can view their own strategy notifications" ON public.strategy_notifications;
DROP POLICY IF EXISTS "Service role can manage strategy notifications" ON public.strategy_notifications;

-- Users can view their own strategy notifications
CREATE POLICY "Users can view their own strategy notifications"
ON public.strategy_notifications
FOR SELECT
USING (
  user_id = (select auth.uid())
);

-- Service role can manage strategy notifications (for email automation)
-- This allows the backend to insert/update records when sending reminder emails
-- Regular users cannot insert/update/delete (handled by service role only)
-- Note: If you want users to be able to update their own records, uncomment the policies below

-- CREATE POLICY "Users can update their own strategy notifications"
-- ON public.strategy_notifications
-- FOR UPDATE
-- USING (
--   user_id = (select auth.uid())
-- )
-- WITH CHECK (
--   user_id = (select auth.uid())
-- );

-- ============================================
-- 2. Fix function search_path security issue
-- ============================================

-- Drop and recreate the function with secure search_path
DROP FUNCTION IF EXISTS public.update_strategy_notifications_updated_at() CASCADE;

CREATE OR REPLACE FUNCTION public.update_strategy_notifications_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

-- Recreate the trigger
CREATE TRIGGER strategy_notifications_updated_at
    BEFORE UPDATE ON public.strategy_notifications
    FOR EACH ROW
    EXECUTE FUNCTION public.update_strategy_notifications_updated_at();

-- Add comment
COMMENT ON FUNCTION public.update_strategy_notifications_updated_at() IS 
'Updates updated_at timestamp on strategy_notifications table. Uses secure search_path to prevent search_path injection attacks.';
