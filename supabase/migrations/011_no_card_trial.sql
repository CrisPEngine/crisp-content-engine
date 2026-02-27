-- Migration: Add no-credit-card trial support
-- Date: 2026-02-03
-- Purpose: Enable 7-day trials that activate after email verification

-- ============================================
-- 1. Add trial tracking to subscriptions
-- ============================================

-- Add trial lifecycle columns to subscriptions table
alter table public.subscriptions
add column if not exists trial_start_at timestamptz null,
add column if not exists trial_end_at timestamptz null;

-- Add index for efficient trial expiry queries
create index if not exists idx_subscriptions_trial_end_at
on public.subscriptions(trial_end_at)
where trial_end_at is not null;

-- Add comments for documentation
comment on column public.subscriptions.trial_start_at is 'When the no-card trial started (set after email verification)';
comment on column public.subscriptions.trial_end_at is 'When the no-card trial expires (7 days after trial_start_at)';

-- ============================================
-- 2. Create trial_usage table
-- ============================================

-- Track per-platform generation usage for trial users
-- These are lifetime quotas (not monthly) to enforce trial limits
create table if not exists public.trial_usage (
  user_id uuid primary key references auth.users(id) on delete cascade,
  linkedin_generated int not null default 0,
  x_generated int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Add check constraints (drop if exists so migration is idempotent)
alter table public.trial_usage drop constraint if exists trial_usage_linkedin_positive;
alter table public.trial_usage add constraint trial_usage_linkedin_positive check (linkedin_generated >= 0);
alter table public.trial_usage drop constraint if exists trial_usage_x_positive;
alter table public.trial_usage add constraint trial_usage_x_positive check (x_generated >= 0);

-- Enable RLS
alter table public.trial_usage enable row level security;

-- RLS policies: users can view their own trial usage (drop if exists for idempotency)
drop policy if exists "Users can view their own trial usage" on public.trial_usage;
create policy "Users can view their own trial usage"
on public.trial_usage
for select
using (user_id = auth.uid());

-- Service role can insert/update/delete (normal flow uses service role)
-- No explicit policies needed since service role bypasses RLS

-- Add trigger to update updated_at on trial_usage
create or replace function public.update_trial_usage_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trigger_trial_usage_updated_at on public.trial_usage;

create trigger trigger_trial_usage_updated_at
  before update on public.trial_usage
  for each row
  execute function public.update_trial_usage_updated_at();

-- ============================================
-- 3. Backfill: Ensure existing users are not accidentally put on trial
-- ============================================

-- Any user with an existing subscription should NOT get trial_start_at/trial_end_at
-- (they're already on a paid/admin-granted plan)
-- No backfill needed since these columns default to null

-- Grant service role access
grant all on public.trial_usage to service_role;
