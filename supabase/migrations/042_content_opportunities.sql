-- Content opportunities are evidence records for whether an article should be produced.
-- They do not alter articles, strategies, or publishing queues.

CREATE TABLE IF NOT EXISTS public.content_campaigns (
  id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                 UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  brand_id                TEXT        NOT NULL,
  name                    TEXT        NOT NULL,
  objective               TEXT        NOT NULL DEFAULT '',
  audience                TEXT        NOT NULL DEFAULT '',
  themes                  JSONB       NOT NULL DEFAULT '[]'::jsonb,
  weekly_capacity         INTEGER     NOT NULL DEFAULT 0 CHECK (weekly_capacity >= 0),
  selection_policy        TEXT        NOT NULL DEFAULT 'evidence_required',
  quality_policy          JSONB       NOT NULL DEFAULT '{}'::jsonb,
  approval_mode           TEXT        NOT NULL DEFAULT 'assisted' CHECK (approval_mode IN ('assisted', 'auto_draft', 'auto_publish')),
  auto_publish_enabled    BOOLEAN     NOT NULL DEFAULT FALSE,
  destination_id          TEXT,
  status                  TEXT        NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'paused')),
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS content_campaigns_owner_idx
  ON public.content_campaigns (user_id, brand_id, status);

CREATE TABLE IF NOT EXISTS public.content_opportunities (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  brand_id              TEXT        NOT NULL,
  campaign_id           UUID        REFERENCES public.content_campaigns(id) ON DELETE SET NULL,
  title                 TEXT        NOT NULL,
  audience_problem      TEXT        NOT NULL DEFAULT '',
  search_intent         TEXT,
  demand_class          TEXT        NOT NULL CHECK (demand_class IN ('observed', 'inferred', 'strategic', 'unvalidated')),
  evidence_confidence   TEXT        NOT NULL CHECK (evidence_confidence IN ('high', 'medium', 'low', 'none')),
  score                 NUMERIC     NOT NULL,
  score_detail          JSONB       NOT NULL DEFAULT '{}'::jsonb,
  overlap               JSONB       NOT NULL DEFAULT '{}'::jsonb,
  recommended_action    TEXT        NOT NULL CHECK (recommended_action IN ('create', 'update', 'reject', 'research')),
  status                TEXT        NOT NULL DEFAULT 'discovered' CHECK (status IN ('discovered', 'needs_research', 'approved', 'rejected', 'deferred', 'in_production')),
  discovery_source      TEXT        NOT NULL,
  natural_key           TEXT        NOT NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, brand_id, natural_key)
);

CREATE INDEX IF NOT EXISTS content_opportunities_queue_idx
  ON public.content_opportunities (user_id, brand_id, status, score DESC);

CREATE TABLE IF NOT EXISTS public.content_opportunity_evidence (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  opportunity_id   UUID        NOT NULL REFERENCES public.content_opportunities(id) ON DELETE CASCADE,
  source_kind      TEXT        NOT NULL,
  url              TEXT,
  excerpt          TEXT,
  observed_at      TIMESTAMPTZ,
  metrics          JSONB,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS content_opportunity_evidence_idx
  ON public.content_opportunity_evidence (opportunity_id);

ALTER TABLE public.content_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_opportunities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_opportunity_evidence ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "content_campaigns_owner_all" ON public.content_campaigns;
CREATE POLICY "content_campaigns_owner_all"
  ON public.content_campaigns FOR ALL
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "content_opportunities_owner_all" ON public.content_opportunities;
CREATE POLICY "content_opportunities_owner_all"
  ON public.content_opportunities FOR ALL
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "content_opportunity_evidence_owner_all" ON public.content_opportunity_evidence;
CREATE POLICY "content_opportunity_evidence_owner_all"
  ON public.content_opportunity_evidence FOR ALL
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));
