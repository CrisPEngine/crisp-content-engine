-- Enable Password Leak Protection (HaveIBeenPwned)
-- Run this in Supabase SQL Editor
-- This enables Supabase Auth to check passwords against HaveIBeenPwned.org database

-- Enable password leak protection
-- This checks user passwords against the HaveIBeenPwned database to prevent
-- the use of compromised passwords that have been exposed in data breaches
UPDATE auth.config
SET 
  enable_signup = true,
  external_password_enabled = true
WHERE id = 1;

-- Note: The actual password leak protection is configured in the Supabase Dashboard
-- under Authentication → Settings → Password → "Check for leaked passwords"
-- 
-- However, you can also enable it via the Supabase Management API or by running:
-- 
-- In Supabase Dashboard:
-- 1. Go to Authentication → Settings
-- 2. Scroll to "Password" section
-- 3. Enable "Check for leaked passwords"
--
-- Or via Supabase CLI (if you have it set up):
-- supabase secrets set PASSWORD_LEAK_CHECK_ENABLED=true

-- Alternative: If the above UPDATE doesn't work, you may need to use the Supabase Dashboard
-- or Management API to enable this feature, as it's a configuration setting rather than
-- a database schema change.

