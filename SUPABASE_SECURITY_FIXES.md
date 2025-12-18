# Supabase Security Fixes

This document provides step-by-step instructions to fix the three Supabase security warnings.

## Issue 1: RLS Not Enabled on `strategy_notifications` Table

### Status
✅ Migration file exists: `supabase/migrations/004_fix_strategy_notifications_security.sql`

### How to Apply

**Option A: Using Supabase CLI (Recommended)**
```bash
# Make sure you're in the project root
cd /Users/chrispascoe/Projects/crisp-content-engine

# Apply the migration
supabase db push

# Or if you need to link your project first:
# supabase link --project-ref your-project-ref
# supabase db push
```

**Option B: Using Supabase Dashboard SQL Editor**
1. Go to your Supabase Dashboard: https://supabase.com/dashboard
2. Select your project
3. Navigate to **SQL Editor** in the left sidebar
4. Click **New Query**
5. Copy and paste the contents of `supabase/migrations/004_fix_strategy_notifications_security.sql`
6. Click **Run** (or press Cmd/Ctrl + Enter)
7. Verify the migration ran successfully

**Option C: Using psql (if you have direct database access)**
```bash
psql -h your-db-host.supabase.co -U postgres -d postgres -f supabase/migrations/004_fix_strategy_notifications_security.sql
```

### What This Migration Does
- Enables Row Level Security (RLS) on `public.strategy_notifications`
- Creates a SELECT policy allowing users to view their own notifications
- Fixes the `update_strategy_notifications_updated_at()` function to use a secure `search_path`
- Recreates the trigger that uses this function

### Verification
After running the migration, check in Supabase Dashboard:
1. Go to **Database** → **Tables** → `strategy_notifications`
2. Click on **Policies** tab
3. You should see "Users can view their own strategy notifications" policy
4. The security warning should disappear within a few minutes

---

## Issue 2: Function Search Path Mutable

### Status
✅ This is fixed in the same migration file: `supabase/migrations/004_fix_strategy_notifications_security.sql`

The migration drops and recreates the function with:
```sql
SET search_path = public, pg_temp
```

This prevents search_path injection attacks.

### How to Apply
Same as Issue 1 - run the migration `004_fix_strategy_notifications_security.sql`

### Verification
After running the migration:
1. Go to **Database** → **Functions** in Supabase Dashboard
2. Find `update_strategy_notifications_updated_at`
3. The security warning should disappear

---

## Issue 3: Leaked Password Protection Disabled

### Status
⚠️ This cannot be fixed via SQL migration - it must be enabled via Supabase Dashboard or Management API

### How to Enable

**Option A: Using Supabase Dashboard (Easiest)**
1. Go to your Supabase Dashboard: https://supabase.com/dashboard
2. Select your project
3. Navigate to **Authentication** → **Policies** (or **Settings** → **Auth**)
4. Look for **"Leaked Password Protection"** or **"Password Security"** section
5. Toggle **"Enable leaked password protection"** to **ON**
6. Save changes

**Option B: Using Supabase Management API**
```bash
# Get your access token from: https://supabase.com/dashboard/account/tokens
# Replace YOUR_ACCESS_TOKEN and YOUR_PROJECT_REF

curl -X PATCH \
  'https://api.supabase.com/v1/projects/YOUR_PROJECT_REF/config/auth' \
  -H 'Authorization: Bearer YOUR_ACCESS_TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{
    "EXTERNAL_PASSWORD_PROTECTION_ENABLED": true
  }'
```

**Option C: Using Supabase CLI (if supported)**
```bash
# Check if this command exists in your Supabase CLI version
supabase projects update --project-ref YOUR_PROJECT_REF --enable-password-leak-protection
```

### What This Does
Enables Supabase to check user passwords against the HaveIBeenPwned database to prevent users from using compromised passwords.

### Verification
1. Go to **Authentication** → **Settings** in Supabase Dashboard
2. Look for **"Leaked Password Protection"** - it should show as **Enabled**
3. The security warning should disappear within a few minutes

---

## Quick Fix Summary

1. **RLS & Function Search Path**: Run migration `004_fix_strategy_notifications_security.sql` via Supabase Dashboard SQL Editor or CLI
2. **Leaked Password Protection**: Enable via Supabase Dashboard → Authentication → Settings

All fixes should take effect immediately, and security warnings should clear within 5-10 minutes.

---

## Troubleshooting

### Migration Already Applied?
If you get an error saying the migration was already applied:
- Check if RLS is already enabled: Go to **Database** → **Tables** → `strategy_notifications` → **Policies**
- If policies exist, the migration may have already been run
- You can manually verify by checking if the function has `SET search_path` in its definition

### Still Seeing Warnings?
- Security warnings can take 5-10 minutes to refresh in the Supabase Dashboard
- Try refreshing the page or waiting a few minutes
- Verify the changes were actually applied by checking the database directly
