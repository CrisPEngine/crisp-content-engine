# RLS Performance Fixes

This document explains the Supabase performance warnings and how to fix them.

## Issues Identified

### 1. Auth RLS Initialization Plan (High Priority)
**Problem**: RLS policies are re-evaluating `auth.uid()` for each row, causing performance degradation at scale.

**Solution**: Wrap `auth.uid()` calls in `(select auth.uid())` to cache the result once per query instead of per row.

**Affected Tables**:
- `usage_posts` - 4 policies
- `entitlements` - 2 policies

### 2. Multiple Permissive Policies (Medium Priority)
**Problem**: Multiple permissive RLS policies for the same role/action cause each policy to be evaluated, reducing performance.

**Solution**: Consolidate duplicate policies into single, optimized policies.

**Affected Tables**:
- `usage_posts` - Multiple policies for SELECT, INSERT, UPDATE, DELETE
- `entitlements` - Multiple policies for SELECT

## How to Apply Fixes

### Option 1: Run SQL Migration (Recommended)

1. Open your Supabase Dashboard
2. Go to **SQL Editor**
3. Copy and paste the contents of `supabase/migrations/001_fix_rls_performance.sql`
4. Click **Run** to execute the migration
5. Verify the policies were updated correctly

### Option 2: Manual Policy Updates

If you prefer to update policies manually through the Supabase UI:

1. Go to **Database** → **Policies** in Supabase Dashboard
2. For each policy mentioned in the warnings:
   - Edit the policy
   - Replace `auth.uid()` with `(select auth.uid())`
   - Consolidate duplicate policies by combining their conditions with `OR`

## What Gets Fixed

### usage_posts Table
- ✅ Optimizes 4 policies to use cached `auth.uid()`
- ✅ Consolidates duplicate policies into 4 optimized policies:
  - `Users can view their own usage` (SELECT)
  - `Service role or user can insert usage` (INSERT)
  - `Service role or user can update usage` (UPDATE)
  - `Service role or user can delete usage` (DELETE)

### entitlements Table
- ✅ Optimizes 2 policies to use cached `auth.uid()`
- ✅ Consolidates duplicate policies into 4 optimized policies:
  - `Users can view entitlements` (SELECT)
  - `Service role can insert entitlements` (INSERT)
  - `Service role can update entitlements` (UPDATE)
  - `Service role can delete entitlements` (DELETE)

## Safety Notes

✅ **These changes are safe**:
- No data will be lost
- Existing functionality is preserved
- Only performance optimizations are applied
- Policies maintain the same security behavior

⚠️ **Important**:
- The service role (used by your API routes) will continue to work as before
- Authenticated users will still only see/modify their own data
- All security constraints remain intact

## Verification

After applying the fixes:

1. Check Supabase Dashboard → **Database** → **Policies**
2. Verify the new policies are active
3. Run your application and test:
   - User can view their own usage/entitlements ✅
   - Service role can insert/update/delete ✅
   - Users cannot access other users' data ✅
4. Check the Supabase linter again - warnings should be resolved

## Performance Impact

**Before**: 
- `auth.uid()` evaluated once per row (e.g., 1000 rows = 1000 evaluations)
- Multiple policies evaluated sequentially

**After**:
- `(select auth.uid())` evaluated once per query (e.g., 1000 rows = 1 evaluation)
- Single consolidated policy per action

**Expected Improvement**: 
- 10-100x faster queries on tables with many rows
- Reduced database load
- Better scalability

