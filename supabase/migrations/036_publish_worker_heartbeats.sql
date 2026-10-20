-- Heartbeats for external publish cron workers (meta-due, threads-due, etc.)

create table if not exists public.publish_worker_heartbeats (
  worker text primary key,
  last_run_at timestamptz not null,
  last_ok boolean not null default true,
  last_error text,
  last_processed integer not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.publish_worker_heartbeats enable row level security;

grant all on public.publish_worker_heartbeats to service_role;

comment on table public.publish_worker_heartbeats is
  'Last successful invocation time for publish cron workers; used for health checks.';
