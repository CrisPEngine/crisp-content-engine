-- Website article scheduling columns.
-- The article document remains the record. These columns let a cron find due
-- website articles without reading social publish jobs.
-- This migration is not applied by the change that adds it.

ALTER TABLE public.articles
  ADD COLUMN IF NOT EXISTS publish_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS destination_id TEXT,
  ADD COLUMN IF NOT EXISTS external_id TEXT;

CREATE INDEX IF NOT EXISTS articles_publish_due_idx
  ON public.articles (publish_at)
  WHERE publish_at IS NOT NULL AND status = 'approved';

CREATE INDEX IF NOT EXISTS articles_external_id_idx
  ON public.articles (owner_user_id, external_id);
