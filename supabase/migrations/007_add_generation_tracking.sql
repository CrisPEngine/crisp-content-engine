-- Add generation job tracking for idempotency and usage reconciliation
-- This table ensures we don't double-count quota when Make retries

create table if not exists public.generation_jobs (
  id uuid primary key default gen_random_uuid(),
  generation_job_id text unique not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  brand_profile_id text not null,
  channels jsonb not null, -- e.g. [{"platform":"X","count":10,"keys":["uuid:X:1",...]}]
  requested_count integer not null,
  created_count integer default 0,
  usage_incremented boolean default false,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

-- Indexes for performance
create index if not exists idx_generation_jobs_job_id on public.generation_jobs(generation_job_id);
create index if not exists idx_generation_jobs_user_id on public.generation_jobs(user_id);
create index if not exists idx_generation_jobs_brand on public.generation_jobs(brand_profile_id);

-- Enable RLS
alter table public.generation_jobs enable row level security;

-- Users can view their own generation jobs
create policy "Users can view their own generation jobs"
  on public.generation_jobs
  for select
  using (auth.uid() = user_id);

-- Note: Service role bypasses RLS when using service key (no policy needed)
