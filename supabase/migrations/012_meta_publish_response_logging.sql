-- Add optional columns for Meta publish failure logging (production readiness).
-- All nullable; no change to success path or existing columns.

alter table public.publish_jobs
  add column if not exists response_status integer,
  add column if not exists graph_error_code text;

comment on column public.publish_jobs.response_status is 'HTTP status from Graph API on failure (e.g. 400, 403)';
comment on column public.publish_jobs.graph_error_code is 'Meta Graph API error code/subcode (e.g. 190, 200) for token/scope/permission diagnosis';
