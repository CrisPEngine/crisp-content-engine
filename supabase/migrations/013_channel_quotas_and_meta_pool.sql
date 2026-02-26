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

-- Check constraints to ensure non-negative values
alter table public.usage_posts
add constraint if not exists usage_meta_pool_used_positive check (meta_pool_used >= 0),
add constraint if not exists usage_blog_outlines_used_positive check (blog_outlines_used >= 0);

-- ============================================
-- 2. Backfill meta_pool_used from existing instagram + facebook posts
-- ============================================

-- For any existing rows with instagram or facebook usage, set meta_pool_used = instagram_posts + facebook_posts
-- These were tracked at generation time in the old system; this backfill makes them consistent
update public.usage_posts
set meta_pool_used = coalesce(instagram_posts, 0) + coalesce(facebook_posts, 0)
where meta_pool_used = 0
  and (coalesce(instagram_posts, 0) + coalesce(facebook_posts, 0)) > 0;

-- ============================================
-- 3. Create index for efficient channel quota lookups
-- ============================================

create index if not exists idx_usage_posts_meta_pool
on public.usage_posts(user_id, year_month, meta_pool_used);

-- ============================================
-- 4. Add seats column to entitlements (for Pro multi-seat)
-- ============================================

alter table public.entitlements
add column if not exists max_seats int not null default 1;

-- Set Pro users to 2 seats based on their posts_per_month value
-- Pro has postsPerMonth = 312; Growth has 84; Creator has 26; Starter has 9
-- We use max_brands as the discriminator (Pro = 3+ brands, Growth = 1)
update public.entitlements
set max_seats = 2
where max_brands >= 3;

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
