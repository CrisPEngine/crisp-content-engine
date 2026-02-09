-- Meta Publishing Phase 1: Database Schema
-- Tables for Meta (Facebook Pages + Instagram Business) direct publishing
-- Feature: META_PUBLISHING_ENABLED

-- ============================================
-- 1. meta_connections table
-- ============================================
-- Stores encrypted Meta user access tokens (long-lived, 60 days)
-- One connection per user

create table if not exists public.meta_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  facebook_user_id text not null,
  access_token_encrypted text not null,
  token_expires_at timestamptz,
  scopes_granted jsonb default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  unique (user_id)
);

-- RLS: Users can only access their own connections
alter table public.meta_connections enable row level security;

drop policy if exists "Users can view their own meta connections" on public.meta_connections;
drop policy if exists "Users can insert their own meta connections" on public.meta_connections;
drop policy if exists "Users can update their own meta connections" on public.meta_connections;
drop policy if exists "Users can delete their own meta connections" on public.meta_connections;

create policy "Users can view their own meta connections"
on public.meta_connections
for select
using (user_id = auth.uid());

create policy "Users can insert their own meta connections"
on public.meta_connections
for insert
with check (user_id = auth.uid());

create policy "Users can update their own meta connections"
on public.meta_connections
for update
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy "Users can delete their own meta connections"
on public.meta_connections
for delete
using (user_id = auth.uid());

-- Index for user lookups
create index if not exists idx_meta_connections_user_id 
  on public.meta_connections(user_id);

-- ============================================
-- 2. meta_pages table
-- ============================================
-- Stores Facebook Pages user can publish to
-- Each page has its own Page Access Token

create table if not exists public.meta_pages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  page_id text not null,
  page_name text not null,
  page_access_token_encrypted text, -- Nullable for resilience during discovery
  is_selected boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  unique (user_id, page_id)
);

-- RLS: Users can only access their own pages
alter table public.meta_pages enable row level security;

drop policy if exists "Users can view their own meta pages" on public.meta_pages;
drop policy if exists "Users can insert their own meta pages" on public.meta_pages;
drop policy if exists "Users can update their own meta pages" on public.meta_pages;
drop policy if exists "Users can delete their own meta pages" on public.meta_pages;

create policy "Users can view their own meta pages"
on public.meta_pages
for select
using (user_id = auth.uid());

create policy "Users can insert their own meta pages"
on public.meta_pages
for insert
with check (user_id = auth.uid());

create policy "Users can update their own meta pages"
on public.meta_pages
for update
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy "Users can delete their own meta pages"
on public.meta_pages
for delete
using (user_id = auth.uid());

-- Indexes
create index if not exists idx_meta_pages_user_id 
  on public.meta_pages(user_id);
  
create index if not exists idx_meta_pages_user_selected 
  on public.meta_pages(user_id, is_selected);

-- ISSUE #4 FIX: Ensure only one page can be selected per user
-- Partial unique index: only one is_selected=true per user_id
create unique index if not exists idx_meta_pages_one_selected_per_user
  on public.meta_pages(user_id)
  where is_selected = true;

-- ============================================
-- 3. meta_instagram_accounts table
-- ============================================
-- Stores Instagram Business/Creator accounts linked to Pages

create table if not exists public.meta_instagram_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  ig_user_id text not null,
  ig_username text not null,
  connected_page_id text not null, -- Text reference to meta_pages.page_id (not FK for simplicity)
  is_selected boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  unique (user_id, ig_user_id)
);

-- RLS: Users can only access their own Instagram accounts
alter table public.meta_instagram_accounts enable row level security;

drop policy if exists "Users can view their own meta instagram accounts" on public.meta_instagram_accounts;
drop policy if exists "Users can insert their own meta instagram accounts" on public.meta_instagram_accounts;
drop policy if exists "Users can update their own meta instagram accounts" on public.meta_instagram_accounts;
drop policy if exists "Users can delete their own meta instagram accounts" on public.meta_instagram_accounts;

create policy "Users can view their own meta instagram accounts"
on public.meta_instagram_accounts
for select
using (user_id = auth.uid());

create policy "Users can insert their own meta instagram accounts"
on public.meta_instagram_accounts
for insert
with check (user_id = auth.uid());

create policy "Users can update their own meta instagram accounts"
on public.meta_instagram_accounts
for update
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy "Users can delete their own meta instagram accounts"
on public.meta_instagram_accounts
for delete
using (user_id = auth.uid());

-- Indexes
create index if not exists idx_meta_instagram_accounts_user_id 
  on public.meta_instagram_accounts(user_id);
  
create index if not exists idx_meta_instagram_accounts_user_selected 
  on public.meta_instagram_accounts(user_id, is_selected);

-- ISSUE #4 FIX: Ensure only one Instagram account can be selected per user
-- Partial unique index: only one is_selected=true per user_id
create unique index if not exists idx_meta_instagram_accounts_one_selected_per_user
  on public.meta_instagram_accounts(user_id)
  where is_selected = true;

-- ISSUE #3 NOTE: connected_page_id is text (not FK) for simplicity and flexibility
-- The disconnect and OAuth callback logic ensures cleanup of orphaned IG accounts
-- If strict referential integrity is needed later, can add FK to meta_pages(page_id)

-- ============================================
-- 4. publish_jobs table
-- ============================================
-- Queue for all Meta publishing jobs
-- payload_json is the source of truth (never re-read Airtable during publish)

create table if not exists public.publish_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  brand_profile_id text not null, -- Airtable BrandProfiles record ID
  content_item_key text not null, -- Idempotency key from content generation
  platform text not null check (platform in ('facebook', 'instagram')),
  target_id text not null, -- page_id or ig_user_id
  status text not null default 'queued' check (status in ('queued', 'publishing', 'published', 'retrying', 'failed')),
  scheduled_time timestamptz not null,
  payload_json jsonb not null, -- Full content payload (text, hashtags, image URL, etc.)
  remote_post_id text, -- Facebook post ID or Instagram media ID after publish
  error_message text,
  attempts integer not null default 0,
  next_attempt_at timestamptz,
  airtable_record_id text, -- ContentQueue record ID for status updates
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

-- RLS: Users can view their own jobs; service role can manage all jobs
alter table public.publish_jobs enable row level security;

drop policy if exists "Users can view their own publish jobs" on public.publish_jobs;

create policy "Users can view their own publish jobs"
on public.publish_jobs
for select
using (user_id = auth.uid());

-- Service role bypasses RLS automatically, but we can add explicit policy for clarity
-- INSERT/UPDATE/DELETE are handled by service role in worker

-- Indexes for worker queries
-- Primary due-jobs index: covers the worker's main query
-- Worker fetches: status IN ('queued','retrying') AND scheduled_time <= now
--                 AND (next_attempt_at IS NULL OR next_attempt_at <= now)
create index if not exists idx_publish_jobs_due 
  on public.publish_jobs(status, scheduled_time, next_attempt_at)
  where status in ('queued', 'retrying');

create index if not exists idx_publish_jobs_user_status 
  on public.publish_jobs(user_id, status);

create index if not exists idx_publish_jobs_content_key 
  on public.publish_jobs(content_item_key);

create index if not exists idx_publish_jobs_airtable_record 
  on public.publish_jobs(airtable_record_id)
  where airtable_record_id is not null;

-- ISSUE #5 FIX: Enforce idempotency to prevent duplicate job creation
-- Unique constraint: one job per (platform, target_id, content_item_key)
-- This prevents double-posting if approval is clicked twice or retry is buggy
create unique index if not exists idx_publish_jobs_idempotency
  on public.publish_jobs(platform, target_id, content_item_key);

-- ============================================
-- 5. updated_at triggers
-- ============================================

-- Function for meta_connections
create or replace function public.update_meta_connections_updated_at()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ISSUE #10 FIX: Drop trigger if exists before creating (idempotency)
drop trigger if exists update_meta_connections_updated_at on public.meta_connections;
create trigger update_meta_connections_updated_at
  before update on public.meta_connections
  for each row
  execute function public.update_meta_connections_updated_at();

-- Function for meta_pages
create or replace function public.update_meta_pages_updated_at()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists update_meta_pages_updated_at on public.meta_pages;
create trigger update_meta_pages_updated_at
  before update on public.meta_pages
  for each row
  execute function public.update_meta_pages_updated_at();

-- Function for meta_instagram_accounts
create or replace function public.update_meta_instagram_accounts_updated_at()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists update_meta_instagram_accounts_updated_at on public.meta_instagram_accounts;
create trigger update_meta_instagram_accounts_updated_at
  before update on public.meta_instagram_accounts
  for each row
  execute function public.update_meta_instagram_accounts_updated_at();

-- Function for publish_jobs
create or replace function public.update_publish_jobs_updated_at()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists update_publish_jobs_updated_at on public.publish_jobs;
create trigger update_publish_jobs_updated_at
  before update on public.publish_jobs
  for each row
  execute function public.update_publish_jobs_updated_at();

-- ============================================
-- 6. Grant permissions
-- ============================================

-- Grant authenticated users read access
grant select on public.meta_connections to authenticated;
grant select on public.meta_pages to authenticated;
grant select on public.meta_instagram_accounts to authenticated;
grant select on public.publish_jobs to authenticated;

-- Service role has full access (for worker and OAuth)
grant all on public.meta_connections to service_role;
grant all on public.meta_pages to service_role;
grant all on public.meta_instagram_accounts to service_role;
grant all on public.publish_jobs to service_role;

-- ============================================
-- Comments for documentation
-- ============================================

comment on table public.meta_connections is 
'Meta (Facebook) user OAuth connections with encrypted long-lived tokens (60 days). One connection per user.';

comment on table public.meta_pages is 
'Facebook Pages user can publish to. Stores encrypted Page Access Tokens (nullable for resilience during discovery). Phase 1: one selected page per user (enforced by unique index).';

comment on table public.meta_instagram_accounts is 
'Instagram Business/Creator accounts linked to Facebook Pages. connected_page_id is text reference (not FK) for simplicity. Phase 1: one selected account per user (enforced by unique index).';

comment on table public.publish_jobs is 
'Publishing queue for Meta posts. payload_json is source of truth (never re-read Airtable during publish). Worker processes jobs in scheduled_time order with spacing guard. Idempotency enforced by unique index on (platform, target_id, content_item_key).';

-- ============================================
-- ISSUE TRACKING (Fixed in this migration)
-- ============================================
-- ISSUE #1: RLS policies now use auth.uid() instead of (select auth.uid())
-- ISSUE #2: page_access_token_encrypted is now nullable for resilience
-- ISSUE #3: connected_page_id remains text (documented; cleanup handled in code)
-- ISSUE #4: Partial unique indexes enforce one selected page/IG per user
-- ISSUE #5: Unique index on publish_jobs enforces idempotency
-- ISSUE #6: Platform casing is lowercase in DB, normalized in code (verified)
-- ISSUE #7: Scheduling strategy documented (always via cron, immediate calls only)
-- ISSUE #8: Data deletion endpoint verified (separate file review)
-- ISSUE #9: Worker uses service role (getSupabaseService()) - verified
-- ISSUE #10: All triggers now use "drop trigger if exists" for idempotency
