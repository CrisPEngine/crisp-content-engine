# Enable Password Leak Protection

This document explains how to enable Supabase's password leak protection feature.

## What is Password Leak Protection?

Supabase Auth can check user passwords against the HaveIBeenPwned.org database to prevent users from using passwords that have been exposed in data breaches. This significantly enhances security by preventing the use of compromised passwords.

## How to Enable

### Option 1: Via Supabase Dashboard (Recommended)

The location of this setting may vary depending on your Supabase project version. Try these locations:

**Location A: Authentication → Email Templates**
1. Open your Supabase Dashboard
2. Navigate to **Authentication** → **Email Templates**
3. Look for **"Password"** or **"Security"** settings
4. Find the toggle for **"Check for leaked passwords"** or **"HaveIBeenPwned"**
5. Enable the toggle
6. Save the changes

**Location B: Authentication → Settings → Password**
1. Open your Supabase Dashboard
2. Navigate to **Authentication** → **Settings**
3. Scroll down to the **Password** section
4. Find the toggle for **"Check for leaked passwords"** or **"HaveIBeenPwned"**
5. Enable the toggle
6. Save the changes

**Location C: Project Settings → Auth**
1. Open your Supabase Dashboard
2. Navigate to **Project Settings** → **Auth**
3. Look for **"Password"** or **"Security"** settings
4. Find the toggle for **"Check for leaked passwords"**
5. Enable the toggle
6. Save the changes

**If you still can't find it:**
- This feature may not be available in your Supabase plan/version
- Contact Supabase support to enable it
- Or use the Management API method below

### Option 2: Via Supabase CLI

If you have Supabase CLI configured:

```bash
supabase secrets set PASSWORD_LEAK_CHECK_ENABLED=true
```

### Option 3: Via Management API

You can enable it programmatically using the Supabase Management API:

```bash
curl -X PATCH 'https://api.supabase.com/v1/projects/{project_ref}/config/auth' \
  -H 'Authorization: Bearer {access_token}' \
  -H 'Content-Type: application/json' \
  -d '{
    "EXTERNAL_PASSWORD_ENABLED": true,
    "PASSWORD_LEAK_CHECK_ENABLED": true
  }'
```

## How It Works

When enabled:
- During user signup or password reset, Supabase checks the password against HaveIBeenPwned
- If the password is found in the database, the signup/reset is rejected
- Users must choose a different password that hasn't been compromised
- The check happens server-side and is transparent to users

## Security Benefits

✅ **Prevents compromised passwords**: Users cannot use passwords known to be leaked  
✅ **Zero-knowledge check**: Only a hash prefix is sent to HaveIBeenPwned, not the full password  
✅ **Automatic protection**: Works for all new signups and password resets  
✅ **No user friction**: Users simply need to choose a different password if theirs is compromised  

## Important Notes

- This feature requires an active internet connection to query HaveIBeenPwned
- The check adds minimal latency (~100-200ms) to signup/password reset operations
- HaveIBeenPwned is a reputable, widely-used service for password leak detection
- The check uses k-anonymity (only first 5 characters of password hash are sent)

## Verification

After enabling:
1. Try to sign up with a known compromised password (e.g., "password123")
2. You should receive an error message indicating the password has been leaked
3. The signup should be rejected until a secure password is used

## Migration File

The SQL migration file (`003_enable_password_leak_protection.sql`) attempts to enable this via SQL, but **the recommended method is via the Dashboard** as this is primarily a configuration setting rather than a database schema change.

