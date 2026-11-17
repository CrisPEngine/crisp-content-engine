-- Durable article-production jobs for an approved content opportunity.
-- A job never publishes the live site.

CREATE TABLE IF NOT EXISTS public.content_production_jobs (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  brand_id         TEXT        NOT NULL,
  campaign_id      UUID        REFERENCES public.content_campaigns(id) ON DELETE SET NULL,
  opportunity_id   UUID        NOT NULL REFERENCES public.content_opportunities(id) ON DELETE CASCADE,
  article_id       TEXT,
  stage            TEXT        NOT NULL CHECK (stage IN ('research', 'brief', 'draft', 'editorial', 'corrections', 'seo', 'hero', 'quality', 'approval')),
  status           TEXT        NOT NULL CHECK (status IN ('queued', 'running', 'needs_attention', 'ready_for_approval', 'failed', 'paused')),
  attempt          INTEGER     NOT NULL DEFAULT 0,
  note             TEXT        NOT NULL DEFAULT '',
  last_error       TEXT,
  cost_usd         NUMERIC     NOT NULL DEFAULT 0,
  stage_log        JSONB       NOT NULL DEFAULT '[]'::jsonb,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, opportunity_id)
);

CREATE INDEX IF NOT EXISTS content_production_jobs_owner_idx
  ON public.content_production_jobs (user_id, brand_id, status);

ALTER TABLE public.content_production_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "content_production_jobs_owner_all" ON public.content_production_jobs;
CREATE POLICY "content_production_jobs_owner_all"
  ON public.content_production_jobs FOR ALL
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));
