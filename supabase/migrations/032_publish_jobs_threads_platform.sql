-- Allow Threads in publish_jobs.platform (agent + ContentQueue scheduling)

alter table public.publish_jobs drop constraint if exists publish_jobs_platform_check;

alter table public.publish_jobs
  add constraint publish_jobs_platform_check
  check (platform in ('facebook', 'instagram', 'threads'));

comment on column public.publish_jobs.platform is 'facebook, instagram, or threads';
