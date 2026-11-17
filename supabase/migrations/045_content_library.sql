-- Content library lifecycle and opportunity archive.
-- Archiving does not unpublish. Evidence rows are not deleted.

ALTER TABLE public.content_opportunities
  DROP CONSTRAINT IF EXISTS content_opportunities_status_check;

ALTER TABLE public.content_opportunities
  ADD CONSTRAINT content_opportunities_status_check
  CHECK (status IN ('discovered', 'needs_research', 'approved', 'rejected', 'deferred', 'in_production', 'archived'));

ALTER TABLE public.content_production_jobs
  DROP CONSTRAINT IF EXISTS content_production_jobs_status_check;

ALTER TABLE public.content_production_jobs
  ADD CONSTRAINT content_production_jobs_status_check
  CHECK (status IN ('queued', 'running', 'needs_attention', 'ready_for_approval', 'failed', 'paused', 'completed'));

ALTER TABLE public.articles
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS articles_archived_idx
  ON public.articles (owner_user_id, brand_id, archived_at);

CREATE TABLE IF NOT EXISTS public.content_audit_events (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  brand_id      TEXT,
  target_type   TEXT        NOT NULL,
  target_id     TEXT        NOT NULL,
  action        TEXT        NOT NULL,
  detail        JSONB       NOT NULL DEFAULT '{}'::jsonb,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS content_audit_events_target_idx
  ON public.content_audit_events (user_id, target_type, target_id, created_at DESC);

ALTER TABLE public.content_audit_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "content_audit_events_owner_read" ON public.content_audit_events;
CREATE POLICY "content_audit_events_owner_read"
  ON public.content_audit_events FOR SELECT
  USING (user_id = (select auth.uid()));
