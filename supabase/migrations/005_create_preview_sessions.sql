create table if not exists public.preview_sessions (
  preview_session_id text primary key,
  status text not null check (status in ('created', 'generating', 'generated', 'failed', 'converted')),
  persona text,
  topics jsonb,
  tone text,
  goal text,
  outputs_json text,
  error text,
  utm_source text,
  utm_campaign text,
  created_at timestamptz not null default now(),
  user_id uuid references auth.users(id) on delete set null
);

alter table public.preview_sessions enable row level security;
