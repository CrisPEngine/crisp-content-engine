-- Migration: Add meta_pool_used column and blog_outlines_used for channel quota tracking
-- Date: 2026-02-03
-- Purpose: Track Meta pool usage (shared FB+IG quota) separately, and blog outlines for Starter tier.
--          LinkedIn and Meta quotas are now decremented at APPROVAL time, not generation time.
--          X and Blog quotas are still decremented at generation time.

-- ============================================
-- 1. Add new quota columns to usage_posts
-- ============================================

alter table public.usage_posts
add column if not exists meta_pool_used int not null default 0,
add column if not exists blog_outlines_used int not null default 0;

-- Check constraints (drop if exists so migration is idempotent; PG has no "add constraint if not exists")
alter table public.usage_posts drop constraint if exists usage_meta_pool_used_positive;
alter table public.usage_posts add constraint usage_meta_pool_used_positive check (meta_pool_used >= 0);
alter table public.usage_posts drop constraint if exists usage_blog_outlines_used_positive;
alter table public.usage_posts add constraint usage_blog_outlines_used_positive check (blog_outlines_used >= 0);

-- ============================================
-- 2. No backfill for meta_pool_used
-- ============================================
-- meta_pool_used starts at 0 for all existing rows.
-- The old instagram_posts / facebook_posts columns tracked generation-time counts
-- (not approval-time publish jobs), and may include drafts that were never approved.
-- Backfilling them into meta_pool_used would incorrectly inflate the quota counter
-- and could block Growth/Pro users from approving posts in the current month.
-- Starting clean from the migration date is the safe default.

-- ============================================
-- 3. Create index for efficient channel quota lookups
-- ============================================

create index if not exists idx_usage_posts_meta_pool
on public.usage_posts(user_id, year_month, meta_pool_used);

-- ============================================
-- 4. Add seats column to entitlements (informational only, not enforced yet)
-- ============================================
-- Seat enforcement requires workspace/invite infrastructure which is not yet built.
-- The column is added for future use but no enforcement code reads it today.
-- Pro shows "Additional seat included (coming soon)" in the UI.

alter table public.entitlements
add column if not exists max_seats int not null default 1;

-- ============================================
-- 5. Add per-channel monthly limit columns to entitlements
--    These are informational (enforcement uses CAPS config), but useful for admin tooling
-- ============================================

alter table public.entitlements
add column if not exists linkedin_monthly int,
add column if not exists x_monthly int,
add column if not exists blog_monthly int,
add column if not exists meta_pool_monthly int;

comment on column public.usage_posts.meta_pool_used is 'Shared Meta pool (Facebook + Instagram) quota used this month. Decremented at approval time for Growth/Pro.';
comment on column public.usage_posts.blog_outlines_used is 'Blog outline quota used this month (Starter tier only).';
comment on column public.entitlements.max_seats is 'Maximum number of active seats (members) allowed. 1 for most plans, 2 for Pro, custom for Scale.';
comment on column public.entitlements.linkedin_monthly is 'Monthly LinkedIn post quota (informational; enforcement uses plan config)';
comment on column public.entitlements.x_monthly is 'Monthly X post quota (informational; enforcement uses plan config)';
comment on column public.entitlements.blog_monthly is 'Monthly blog article quota (informational; enforcement uses plan config)';
comment on column public.entitlements.meta_pool_monthly is 'Monthly shared Meta pool quota (informational; enforcement uses plan config)';
