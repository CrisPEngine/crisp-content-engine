# RLS Security Fixes

This document explains the Supabase security errors and how to fix them.

## Issues Identified

### RLS Disabled in Public (CRITICAL SECURITY ERROR)
**Problem**: Tables in the `public` schema are exposed to PostgREST but don't have Row Level Security (RLS) enabled. This means anyone with the anon key could potentially access all data in these tables.

**Solution**: Enable RLS and create appropriate policies that restrict access based on user ownership.

**Affected Tables**:
- `subscriptions` - User subscription data
- `social_connections` - LinkedIn/OAuth connections
- `plan_waitlist` - Waitlist signups
- `brands` - Brand profiles (may be unused, stored in Airtable)
- `channels` - Channel data (not found in codebase, may be unused)

## How to Apply Fixes

### Option 1: Run SQL Migration (Recommended)

1. Open your Supabase Dashboard
2. Go to **SQL Editor**
3. Copy and paste the contents of `supabase/migrations/002_enable_rls_security.sql`
4. Click **Run** to execute the migration
5. Verify RLS is enabled in **Database** → **Tables** → [Table Name] → **Policies**

### Option 2: Manual Setup

1. Go to **Database** → **Tables** in Supabase Dashboard
2. For each table mentioned:
   - Click on the table
   - Go to **Policies** tab
   - Click **Enable RLS**
   - Create policies as described below

## What Gets Fixed

### subscriptions Table
- ✅ RLS enabled
- ✅ Users can only view their own subscriptions
- ✅ Service role (used by webhooks/admin) bypasses RLS and can still write

### social_connections Table
- ✅ RLS enabled
- ✅ Users can view, insert, update, and delete only their own connections
- ✅ Service role can still manage connections (bypasses RLS)

### plan_waitlist Table
- ✅ RLS enabled
- ✅ Anyone (including anonymous) can insert (for public waitlist form)
- ✅ Users can view their own waitlist entries
- ✅ Service role can manage all entries

### brands Table
- ⚠️ **Note**: This table may not be used (brands are stored in Airtable)
- If unused, consider dropping the table
- If used, uncomment the policies in the migration file

### channels Table
- ⚠️ **Note**: This table was not found in codebase usage
- If unused, consider dropping the table
- If used, uncomment the policies in the migration file

## Safety Notes

✅ **These changes are safe**:
- No data will be lost
- Service role operations continue to work (service role bypasses RLS)
- Existing functionality is preserved
- Users can still access their own data
- Public waitlist form continues to work

⚠️ **Important**:
- **Service role key** (used by your API routes) bypasses RLS entirely - this is expected and necessary
- **Authenticated users** can only access their own data
- **Anonymous users** can only insert into waitlist (no read access)
- All security constraints are enforced at the database level

## Verification

After applying the fixes:

1. Check Supabase Dashboard → **Database** → **Tables**
2. Verify RLS is enabled (should show "RLS enabled" badge)
3. Check **Policies** tab - should show the new policies
4. Test your application:
   - ✅ Users can view their own subscriptions
   - ✅ Users can manage their own social connections
   - ✅ Public waitlist form works
   - ✅ Service role operations (webhooks, admin) still work
   - ✅ Users cannot access other users' data
5. Check the Supabase linter again - security errors should be resolved

## Security Impact

**Before**: 
- Tables were publicly accessible with anon key
- No row-level restrictions
- Potential data exposure risk

**After**:
- RLS enabled on all public tables
- Users can only access their own data
- Service role operations protected (bypasses RLS when needed)
- Database-level security enforcement

## Performance Impact

**Minimal**: RLS policies use optimized `(select auth.uid())` pattern to cache user ID, ensuring good performance even with many rows.

