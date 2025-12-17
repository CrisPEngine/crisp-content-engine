-- Enable Password Leak Protection (HaveIBeenPwned)
-- Run this in Supabase SQL Editor
-- This enables Supabase Auth to check passwords against HaveIBeenPwned.org database

-- Enable Password Leak Protection (HaveIBeenPwned)
-- This checks user passwords against the HaveIBeenPwned database to prevent
-- the use of compromised passwords that have been exposed in data breaches
--
-- IMPORTANT: This feature must be enabled via Supabase Dashboard or Management API
-- The SQL below attempts to enable it, but Supabase may require dashboard configuration
--
-- Method 1: Via Supabase Dashboard (RECOMMENDED)
-- 1. Go to Authentication → Settings
-- 2. Scroll to "Password" section  
-- 3. Enable "Check for leaked passwords"
-- 4. Save changes
--
-- Method 2: Via Supabase Management API
-- Use the Supabase Management API to update auth settings:
-- PATCH /v1/projects/{project_ref}/config/auth
-- Body: { "EXTERNAL_PASSWORD_ENABLED": true, "PASSWORD_LEAK_CHECK_ENABLED": true }
--
-- Method 3: Via Supabase CLI (if configured)
-- supabase secrets set PASSWORD_LEAK_CHECK_ENABLED=true

-- Attempt to enable via auth.config (may not work depending on Supabase version)
-- If this doesn't work, use the dashboard method above
DO $$
BEGIN
  -- Try to update auth.config if the column exists
  IF EXISTS (
    SELECT FROM information_schema.columns 
    WHERE table_schema = 'auth' 
    AND table_name = 'config'
    AND column_name = 'enable_password_leak_check'
  ) THEN
    UPDATE auth.config
    SET enable_password_leak_check = true
    WHERE id = 1;
  END IF;
  
  -- Log that manual dashboard configuration may be required
  RAISE NOTICE 'Password leak protection configuration attempted. If not enabled, please enable via Supabase Dashboard: Authentication → Settings → Password → "Check for leaked passwords"';
END $$;

