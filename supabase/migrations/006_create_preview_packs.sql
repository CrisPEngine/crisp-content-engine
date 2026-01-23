-- Create preview_packs table for logged-in users
create table if not exists public.preview_packs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  persona text not null,
  topics jsonb not null,
  tone text not null,
  goal text not null,
  channel text not null default 'LinkedIn',
  pack_title text,
  outputs jsonb not null,
  status text not null default 'generated' check (status in ('generating', 'generated', 'failed', 'converted'))
);

-- Create indexes
create index if not exists idx_preview_packs_user_id on public.preview_packs(user_id);
create index if not exists idx_preview_packs_created_at_desc on public.preview_packs(created_at desc);

-- Enable RLS
alter table public.preview_packs enable row level security;

-- RLS Policy: Users can read their own preview packs
create policy "Users can read their own preview packs"
  on public.preview_packs
  for select
  using (auth.uid() = user_id);

-- RLS Policy: Users can insert their own preview packs
create policy "Users can insert their own preview packs"
  on public.preview_packs
  for insert
  with check (auth.uid() = user_id);

-- RLS Policy: Users can update their own preview packs
create policy "Users can update their own preview packs"
  on public.preview_packs
  for update
  using (auth.uid() = user_id);

-- RLS Policy: Users can delete their own preview packs
create policy "Users can delete their own preview packs"
  on public.preview_packs
  for delete
  using (auth.uid() = user_id);
