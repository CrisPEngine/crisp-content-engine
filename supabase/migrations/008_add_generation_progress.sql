-- Migration: Add generation job progress tracking
-- Created: 2026-01-21
-- Purpose: Track per-platform progress for multi-channel generation jobs

-- 1. Create generation_job_progress table
create table if not exists public.generation_job_progress (
  id uuid primary key default gen_random_uuid(),
  generation_job_id uuid not null,
  platform text not null check (platform in ('LinkedIn', 'X', 'Instagram', 'Facebook', 'Blog')),
  route_status text not null check (route_status in ('completed', 'failed')),
  created_count int not null default 0,
  record_ids jsonb not null default '[]'::jsonb,
  skipped_count int not null default 0,
  errors jsonb not null default '[]'::jsonb,
  reported_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  
  -- Ensure one progress row per job+platform
  constraint generation_job_progress_unique unique (generation_job_id, platform)
);

-- Index for queries by generation_job_id
create index if not exists idx_generation_job_progress_job_id 
  on public.generation_job_progress(generation_job_id);

-- Index for queries by platform
create index if not exists idx_generation_job_progress_platform 
  on public.generation_job_progress(platform);

-- RLS: Enable but only service role writes
alter table public.generation_job_progress enable row level security;

-- Service role can do everything (bypasses RLS by default)
-- If you want users to read their own progress, add a policy like:
-- create policy "Users can view their own generation progress"
--   on public.generation_job_progress for select
--   using (
--     generation_job_id in (
--       select generation_job_id from public.generation_jobs where user_id = auth.uid()
--     )
--   );

-- For now, keep it service-role only (no policies = no user access)

-- 2. Extend generation_jobs table with progress tracking fields
alter table public.generation_jobs 
  add column if not exists expected_platforms jsonb default '[]'::jsonb,
  add column if not exists completed_platforms jsonb default '[]'::jsonb,
  add column if not exists status text default 'pending' check (status in ('pending', 'in_progress', 'completed', 'failed', 'partial')),
  add column if not exists created_counts jsonb default '{}'::jsonb,
  add column if not exists record_ids jsonb default '{}'::jsonb,
  add column if not exists last_progress_at timestamptz;

-- Index for queries by status
create index if not exists idx_generation_jobs_status 
  on public.generation_jobs(status);

-- Index for queries by user_id + status
create index if not exists idx_generation_jobs_user_status 
  on public.generation_jobs(user_id, status);

-- 3. Update existing generation_jobs rows to set status = 'completed' if completed_at is set
update public.generation_jobs 
set status = 'completed' 
where completed_at is not null and status = 'pending';

-- 4. Add updated_at trigger for generation_job_progress
create or replace function public.update_generation_job_progress_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- Drop if exists so migration is idempotent when trigger already exists
drop trigger if exists update_generation_job_progress_updated_at on public.generation_job_progress;
create trigger update_generation_job_progress_updated_at
  before update on public.generation_job_progress
  for each row
  execute function public.update_generation_job_progress_updated_at();

-- Grant access to service role (authenticated users cannot write directly)
grant select on public.generation_job_progress to authenticated;
grant all on public.generation_job_progress to service_role;
