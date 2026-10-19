-- Native content generation job metadata (engine, errors, resolved models)

alter table public.generation_jobs
  add column if not exists engine text default 'legacy',
  add column if not exists error_message text,
  add column if not exists resolved_models jsonb default '[]'::jsonb;

comment on column public.generation_jobs.engine is 'legacy (Make) or native (CRISP pipeline)';

update public.generation_jobs set engine = 'legacy' where engine is null;
