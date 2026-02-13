-- Migration: Add per-channel usage counters for Starter tier enforcement
-- Date: 2026-02-03
-- Purpose: Track LinkedIn, X, and Blog usage separately to enforce per-channel limits

-- Add per-channel usage columns to usage_posts
alter table public.usage_posts
add column if not exists linkedin_posts int default 0,
add column if not exists x_posts int default 0,
add column if not exists blog_posts int default 0,
add column if not exists instagram_posts int default 0,
add column if not exists facebook_posts int default 0;

-- Add check constraints
alter table public.usage_posts
add constraint usage_linkedin_posts_positive check (linkedin_posts >= 0),
add constraint usage_x_posts_positive check (x_posts >= 0),
add constraint usage_blog_posts_positive check (blog_posts >= 0),
add constraint usage_instagram_posts_positive check (instagram_posts >= 0),
add constraint usage_facebook_posts_positive check (facebook_posts >= 0);

-- Create index for efficient per-channel lookups
create index if not exists idx_usage_posts_channels
on public.usage_posts(user_id, year_month, linkedin_posts, x_posts, blog_posts);

-- Backfill: if posts > 0 and all channels are 0, assume LinkedIn (legacy behavior)
-- This ensures existing usage data is preserved
update public.usage_posts
set linkedin_posts = posts
where posts > 0
and linkedin_posts = 0
and x_posts = 0
and blog_posts = 0
and instagram_posts = 0
and facebook_posts = 0;
