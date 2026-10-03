-- ============================================================
-- 023: CCE Intelligence Foundation
-- Additive only. Does not alter Airtable, Make, or existing
-- generation_jobs / idea_engine / sidecar tables.
-- Apply manually when ready (same convention as 016/017/018).
-- ============================================================

CREATE OR REPLACE FUNCTION public.intelligence_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Maps Airtable records to native CCE entities without migrating data.
CREATE TABLE IF NOT EXISTS public.airtable_entity_map (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  airtable_table        TEXT        NOT NULL,
  airtable_record_id    TEXT        NOT NULL,
  native_entity_type    TEXT        NOT NULL,
  native_entity_id      UUID        NOT NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (airtable_table, airtable_record_id, native_entity_type)
);

CREATE INDEX IF NOT EXISTS airtable_entity_map_user_idx
  ON public.airtable_entity_map (user_id, native_entity_type);

-- ── Brand Brain ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.brand_brains (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  airtable_brand_id     TEXT        NOT NULL,
  identity              JSONB       NOT NULL DEFAULT '{}'::jsonb,
  voice                 JSONB       NOT NULL DEFAULT '{}'::jsonb,
  guardrails            JSONB       NOT NULL DEFAULT '{}'::jsonb,
  knowledge             JSONB       NOT NULL DEFAULT '{}'::jsonb,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, airtable_brand_id)
);

CREATE INDEX IF NOT EXISTS brand_brains_user_brand_idx
  ON public.brand_brains (user_id, airtable_brand_id);

CREATE TABLE IF NOT EXISTS public.brand_brain_examples (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  brand_brain_id        UUID        NOT NULL REFERENCES public.brand_brains(id) ON DELETE CASCADE,
  kind                  TEXT        NOT NULL,
  channel               TEXT,
  content_type          TEXT,
  body                  TEXT        NOT NULL,
  why_it_works          TEXT,
  metadata              JSONB       NOT NULL DEFAULT '{}'::jsonb,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT brand_brain_examples_kind_check CHECK (
    kind IN ('good', 'poor', 'representative', 'user_edited')
  )
);

CREATE INDEX IF NOT EXISTS brand_brain_examples_brain_idx
  ON public.brand_brain_examples (brand_brain_id, kind);

-- ── Strategy ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.brand_strategies (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  brand_brain_id        UUID        NOT NULL REFERENCES public.brand_brains(id) ON DELETE CASCADE,
  airtable_brand_id     TEXT        NOT NULL,
  status                TEXT        NOT NULL DEFAULT 'draft',
  objectives            JSONB       NOT NULL DEFAULT '[]'::jsonb,
  audiences             JSONB       NOT NULL DEFAULT '[]'::jsonb,
  audience_problems     JSONB       NOT NULL DEFAULT '[]'::jsonb,
  desired_outcomes      JSONB       NOT NULL DEFAULT '[]'::jsonb,
  positioning           TEXT,
  key_messages          JSONB       NOT NULL DEFAULT '[]'::jsonb,
  proof_points          JSONB       NOT NULL DEFAULT '[]'::jsonb,
  content_pillars       JSONB       NOT NULL DEFAULT '[]'::jsonb,
  funnel_stages         JSONB       NOT NULL DEFAULT '[]'::jsonb,
  cta_strategy          JSONB       NOT NULL DEFAULT '{}'::jsonb,
  content_mix           JSONB       NOT NULL DEFAULT '{}'::jsonb,
  editorial_themes      JSONB       NOT NULL DEFAULT '[]'::jsonb,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (brand_brain_id)
);

CREATE TABLE IF NOT EXISTS public.brand_campaigns (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  strategy_id           UUID        NOT NULL REFERENCES public.brand_strategies(id) ON DELETE CASCADE,
  title                 TEXT        NOT NULL,
  objective             TEXT,
  description           TEXT,
  start_date            DATE,
  end_date              DATE,
  status                TEXT        NOT NULL DEFAULT 'planned',
  metadata              JSONB       NOT NULL DEFAULT '{}'::jsonb,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS brand_campaigns_strategy_idx
  ON public.brand_campaigns (strategy_id, status);

CREATE TABLE IF NOT EXISTS public.brand_channel_strategies (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  strategy_id           UUID        NOT NULL REFERENCES public.brand_strategies(id) ON DELETE CASCADE,
  channel               TEXT        NOT NULL,
  role                  TEXT,
  cadence               TEXT,
  formats               JSONB       NOT NULL DEFAULT '[]'::jsonb,
  cta_notes             TEXT,
  constraints           JSONB       NOT NULL DEFAULT '[]'::jsonb,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (strategy_id, channel)
);

-- ── Content themes ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.content_themes (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  brand_brain_id        UUID        NOT NULL REFERENCES public.brand_brains(id) ON DELETE CASCADE,
  strategy_id           UUID        REFERENCES public.brand_strategies(id) ON DELETE SET NULL,
  title                 TEXT        NOT NULL,
  description           TEXT,
  objective             TEXT,
  target_audience       TEXT,
  related_pillars       JSONB       NOT NULL DEFAULT '[]'::jsonb,
  key_arguments         JSONB       NOT NULL DEFAULT '[]'::jsonb,
  subtopics             JSONB       NOT NULL DEFAULT '[]'::jsonb,
  questions_to_answer   JSONB       NOT NULL DEFAULT '[]'::jsonb,
  proof_points          JSONB       NOT NULL DEFAULT '[]'::jsonb,
  keywords              JSONB       NOT NULL DEFAULT '[]'::jsonb,
  channels              JSONB       NOT NULL DEFAULT '[]'::jsonb,
  desired_frequency     TEXT,
  start_date            DATE,
  end_date              DATE,
  status                TEXT        NOT NULL DEFAULT 'active',
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS content_themes_brand_idx
  ON public.content_themes (brand_brain_id, status);

CREATE TABLE IF NOT EXISTS public.content_theme_plans (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  theme_id              UUID        NOT NULL REFERENCES public.content_themes(id) ON DELETE CASCADE,
  core_idea             TEXT        NOT NULL,
  horizon_weeks         INT         NOT NULL DEFAULT 6,
  pieces                JSONB       NOT NULL DEFAULT '[]'::jsonb,
  rationale             TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Content memory ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.content_memory (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  brand_brain_id        UUID        NOT NULL REFERENCES public.brand_brains(id) ON DELETE CASCADE,
  airtable_content_id   TEXT,
  theme_id              UUID        REFERENCES public.content_themes(id) ON DELETE SET NULL,
  campaign_id           UUID        REFERENCES public.brand_campaigns(id) ON DELETE SET NULL,
  strategy_id           UUID        REFERENCES public.brand_strategies(id) ON DELETE SET NULL,
  brief_id              UUID,
  parent_memory_id      UUID        REFERENCES public.content_memory(id) ON DELETE SET NULL,
  experiment_id         UUID,
  channel               TEXT        NOT NULL,
  content_type          TEXT,
  content_pillar        TEXT,
  topic                 TEXT,
  angle                 TEXT,
  hook                  TEXT,
  argument              TEXT,
  cta                   TEXT,
  format                TEXT,
  body                  TEXT,
  publication_status    TEXT        NOT NULL DEFAULT 'draft',
  publication_date      TIMESTAMPTZ,
  destination           TEXT,
  source_idea           TEXT,
  metadata              JSONB       NOT NULL DEFAULT '{}'::jsonb,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS content_memory_brand_created_idx
  ON public.content_memory (brand_brain_id, created_at DESC);
CREATE INDEX IF NOT EXISTS content_memory_brand_topic_idx
  ON public.content_memory (brand_brain_id, topic);
CREATE INDEX IF NOT EXISTS content_memory_theme_idx
  ON public.content_memory (theme_id);
CREATE INDEX IF NOT EXISTS content_memory_airtable_idx
  ON public.content_memory (airtable_content_id)
  WHERE airtable_content_id IS NOT NULL;

-- ── Structured briefs + drafts ───────────────────────────────
CREATE TABLE IF NOT EXISTS public.native_content_briefs (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  brand_brain_id        UUID        NOT NULL REFERENCES public.brand_brains(id) ON DELETE CASCADE,
  strategy_id           UUID        REFERENCES public.brand_strategies(id) ON DELETE SET NULL,
  theme_id              UUID        REFERENCES public.content_themes(id) ON DELETE SET NULL,
  campaign_id           UUID        REFERENCES public.brand_campaigns(id) ON DELETE SET NULL,
  memory_id             UUID        REFERENCES public.content_memory(id) ON DELETE SET NULL,
  payload               JSONB       NOT NULL DEFAULT '{}'::jsonb,
  user_intent           TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS native_content_briefs_brand_idx
  ON public.native_content_briefs (brand_brain_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.content_drafts (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  brand_brain_id        UUID        NOT NULL REFERENCES public.brand_brains(id) ON DELETE CASCADE,
  brief_id              UUID        REFERENCES public.native_content_briefs(id) ON DELETE SET NULL,
  memory_id             UUID        REFERENCES public.content_memory(id) ON DELETE SET NULL,
  ai_version            TEXT        NOT NULL,
  user_version          TEXT,
  reviewed_version      TEXT,
  review_payload        JSONB       NOT NULL DEFAULT '{}'::jsonb,
  score_payload         JSONB       NOT NULL DEFAULT '{}'::jsonb,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS content_drafts_memory_idx
  ON public.content_drafts (memory_id);

-- ── User-edit learning ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.user_edit_learnings (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  brand_brain_id        UUID        NOT NULL REFERENCES public.brand_brains(id) ON DELETE CASCADE,
  signal_type           TEXT        NOT NULL,
  observation           TEXT        NOT NULL,
  evidence              JSONB       NOT NULL DEFAULT '[]'::jsonb,
  confidence            TEXT        NOT NULL DEFAULT 'candidate',
  status                TEXT        NOT NULL DEFAULT 'proposed',
  occurrence_count      INT         NOT NULL DEFAULT 1,
  last_seen_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT user_edit_learnings_confidence_check CHECK (
    confidence IN ('candidate', 'observed', 'strong', 'confirmed')
  ),
  CONSTRAINT user_edit_learnings_status_check CHECK (
    status IN ('proposed', 'accepted', 'edited', 'rejected', 'disabled')
  )
);

CREATE INDEX IF NOT EXISTS user_edit_learnings_brand_idx
  ON public.user_edit_learnings (brand_brain_id, status, confidence);

-- ── Performance ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.performance_snapshots (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  brand_brain_id        UUID        NOT NULL REFERENCES public.brand_brains(id) ON DELETE CASCADE,
  memory_id             UUID        REFERENCES public.content_memory(id) ON DELETE SET NULL,
  channel               TEXT        NOT NULL,
  collected_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  hours_since_publish   NUMERIC,
  impressions           NUMERIC,
  reach                 NUMERIC,
  clicks                NUMERIC,
  reactions             NUMERIC,
  comments              NUMERIC,
  shares                NUMERIC,
  saves                 NUMERIC,
  conversions           NUMERIC,
  follower_growth       NUMERIC,
  dwell_seconds         NUMERIC,
  engagement_rate       NUMERIC,
  click_through_rate    NUMERIC,
  normalised            JSONB       NOT NULL DEFAULT '{}'::jsonb,
  raw_payload           JSONB       NOT NULL DEFAULT '{}'::jsonb,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS performance_snapshots_memory_idx
  ON public.performance_snapshots (memory_id, collected_at DESC);
CREATE INDEX IF NOT EXISTS performance_snapshots_brand_channel_idx
  ON public.performance_snapshots (brand_brain_id, channel, collected_at DESC);

-- ── Experiments ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.content_experiments (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  brand_brain_id        UUID        NOT NULL REFERENCES public.brand_brains(id) ON DELETE CASCADE,
  title                 TEXT        NOT NULL,
  hypothesis            TEXT        NOT NULL,
  variable              TEXT        NOT NULL,
  primary_metric        TEXT        NOT NULL,
  secondary_metrics     JSONB       NOT NULL DEFAULT '[]'::jsonb,
  objective             TEXT        NOT NULL,
  status                TEXT        NOT NULL DEFAULT 'draft',
  minimum_sample        INT         NOT NULL DEFAULT 4,
  measurement_window_hours INT      NOT NULL DEFAULT 72,
  winner_variant_id     UUID,
  confidence            TEXT        NOT NULL DEFAULT 'insufficient',
  notes                 TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.experiment_variants (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  experiment_id         UUID        NOT NULL REFERENCES public.content_experiments(id) ON DELETE CASCADE,
  role                  TEXT        NOT NULL,
  label                 TEXT        NOT NULL,
  memory_id             UUID        REFERENCES public.content_memory(id) ON DELETE SET NULL,
  description           TEXT,
  controls              JSONB       NOT NULL DEFAULT '{}'::jsonb,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT experiment_variants_role_check CHECK (role IN ('control', 'variant'))
);

CREATE TABLE IF NOT EXISTS public.experiment_results (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  experiment_id         UUID        NOT NULL REFERENCES public.content_experiments(id) ON DELETE CASCADE,
  variant_id            UUID        NOT NULL REFERENCES public.experiment_variants(id) ON DELETE CASCADE,
  metric                TEXT        NOT NULL,
  absolute_value        NUMERIC,
  normalised_value      NUMERIC,
  sample_size           INT,
  collected_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Performance learnings ────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.content_learnings (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  brand_brain_id        UUID        NOT NULL REFERENCES public.brand_brains(id) ON DELETE CASCADE,
  scope                 TEXT        NOT NULL DEFAULT 'brand',
  channel               TEXT,
  observation           TEXT        NOT NULL,
  metric                TEXT,
  objective             TEXT,
  supporting_memory_ids JSONB       NOT NULL DEFAULT '[]'::jsonb,
  supporting_experiment_ids JSONB   NOT NULL DEFAULT '[]'::jsonb,
  confidence            TEXT        NOT NULL DEFAULT 'low',
  validity_status       TEXT        NOT NULL DEFAULT 'active',
  last_validated_at     TIMESTAMPTZ,
  expires_at            TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT content_learnings_validity_check CHECK (
    validity_status IN ('active', 'decaying', 'retest_candidate', 'invalidated', 'disabled')
  )
);

CREATE INDEX IF NOT EXISTS content_learnings_brand_idx
  ON public.content_learnings (brand_brain_id, validity_status, confidence);

-- ── Content scores ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.content_scores (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  draft_id              UUID        REFERENCES public.content_drafts(id) ON DELETE CASCADE,
  memory_id             UUID        REFERENCES public.content_memory(id) ON DELETE SET NULL,
  dimensions            JSONB       NOT NULL DEFAULT '{}'::jsonb,
  prediction_note       TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Native workflow jobs ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.workflow_jobs (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  brand_brain_id        UUID        REFERENCES public.brand_brains(id) ON DELETE SET NULL,
  job_type              TEXT        NOT NULL,
  status                TEXT        NOT NULL DEFAULT 'queued',
  payload               JSONB       NOT NULL DEFAULT '{}'::jsonb,
  reference_id          TEXT,
  retry_count           INT         NOT NULL DEFAULT 0,
  max_retries           INT         NOT NULL DEFAULT 3,
  last_error            TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at            TIMESTAMPTZ,
  completed_at          TIMESTAMPTZ,
  CONSTRAINT workflow_jobs_status_check CHECK (
    status IN ('queued', 'processing', 'completed', 'failed', 'retrying', 'cancelled')
  )
);

CREATE INDEX IF NOT EXISTS workflow_jobs_status_created_idx
  ON public.workflow_jobs (status, created_at);
CREATE INDEX IF NOT EXISTS workflow_jobs_user_idx
  ON public.workflow_jobs (user_id, created_at DESC);

-- ── AI usage logs ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ai_usage_logs (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  request_id            TEXT        NOT NULL,
  role                  TEXT        NOT NULL,
  provider              TEXT        NOT NULL,
  model                 TEXT        NOT NULL,
  fallback_used         BOOLEAN     NOT NULL DEFAULT false,
  prompt_tokens         INT,
  completion_tokens     INT,
  duration_ms           INT,
  ok                    BOOLEAN     NOT NULL,
  error_code            TEXT,
  feature               TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ai_usage_logs_created_idx
  ON public.ai_usage_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS ai_usage_logs_user_idx
  ON public.ai_usage_logs (user_id, created_at DESC);

-- ── updated_at triggers ──────────────────────────────────────
DROP TRIGGER IF EXISTS brand_brains_updated_at ON public.brand_brains;
CREATE TRIGGER brand_brains_updated_at
  BEFORE UPDATE ON public.brand_brains
  FOR EACH ROW EXECUTE FUNCTION public.intelligence_set_updated_at();

DROP TRIGGER IF EXISTS brand_strategies_updated_at ON public.brand_strategies;
CREATE TRIGGER brand_strategies_updated_at
  BEFORE UPDATE ON public.brand_strategies
  FOR EACH ROW EXECUTE FUNCTION public.intelligence_set_updated_at();

DROP TRIGGER IF EXISTS brand_campaigns_updated_at ON public.brand_campaigns;
CREATE TRIGGER brand_campaigns_updated_at
  BEFORE UPDATE ON public.brand_campaigns
  FOR EACH ROW EXECUTE FUNCTION public.intelligence_set_updated_at();

DROP TRIGGER IF EXISTS brand_channel_strategies_updated_at ON public.brand_channel_strategies;
CREATE TRIGGER brand_channel_strategies_updated_at
  BEFORE UPDATE ON public.brand_channel_strategies
  FOR EACH ROW EXECUTE FUNCTION public.intelligence_set_updated_at();

DROP TRIGGER IF EXISTS content_themes_updated_at ON public.content_themes;
CREATE TRIGGER content_themes_updated_at
  BEFORE UPDATE ON public.content_themes
  FOR EACH ROW EXECUTE FUNCTION public.intelligence_set_updated_at();

DROP TRIGGER IF EXISTS content_memory_updated_at ON public.content_memory;
CREATE TRIGGER content_memory_updated_at
  BEFORE UPDATE ON public.content_memory
  FOR EACH ROW EXECUTE FUNCTION public.intelligence_set_updated_at();

DROP TRIGGER IF EXISTS content_drafts_updated_at ON public.content_drafts;
CREATE TRIGGER content_drafts_updated_at
  BEFORE UPDATE ON public.content_drafts
  FOR EACH ROW EXECUTE FUNCTION public.intelligence_set_updated_at();

DROP TRIGGER IF EXISTS user_edit_learnings_updated_at ON public.user_edit_learnings;
CREATE TRIGGER user_edit_learnings_updated_at
  BEFORE UPDATE ON public.user_edit_learnings
  FOR EACH ROW EXECUTE FUNCTION public.intelligence_set_updated_at();

DROP TRIGGER IF EXISTS content_experiments_updated_at ON public.content_experiments;
CREATE TRIGGER content_experiments_updated_at
  BEFORE UPDATE ON public.content_experiments
  FOR EACH ROW EXECUTE FUNCTION public.intelligence_set_updated_at();

DROP TRIGGER IF EXISTS content_learnings_updated_at ON public.content_learnings;
CREATE TRIGGER content_learnings_updated_at
  BEFORE UPDATE ON public.content_learnings
  FOR EACH ROW EXECUTE FUNCTION public.intelligence_set_updated_at();

-- ── RLS ──────────────────────────────────────────────────────
ALTER TABLE public.airtable_entity_map ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.brand_brains ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.brand_brain_examples ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.brand_strategies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.brand_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.brand_channel_strategies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_themes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_theme_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_memory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.native_content_briefs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_edit_learnings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.performance_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_experiments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.experiment_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.experiment_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_learnings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workflow_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_usage_logs ENABLE ROW LEVEL SECURITY;

-- Owner isolation. Writes from API routes may use the service role (bypasses RLS)
-- after the route authenticates the user. Direct client access is user-scoped.
-- Policy names are identifiers (double-quoted), not string literals.
DROP POLICY IF EXISTS "airtable_entity_map_owner_all" ON public.airtable_entity_map;
CREATE POLICY "airtable_entity_map_owner_all"
  ON public.airtable_entity_map FOR ALL
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "brand_brains_owner_all" ON public.brand_brains;
CREATE POLICY "brand_brains_owner_all"
  ON public.brand_brains FOR ALL
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "brand_brain_examples_owner_all" ON public.brand_brain_examples;
CREATE POLICY "brand_brain_examples_owner_all"
  ON public.brand_brain_examples FOR ALL
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "brand_strategies_owner_all" ON public.brand_strategies;
CREATE POLICY "brand_strategies_owner_all"
  ON public.brand_strategies FOR ALL
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "brand_campaigns_owner_all" ON public.brand_campaigns;
CREATE POLICY "brand_campaigns_owner_all"
  ON public.brand_campaigns FOR ALL
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "brand_channel_strategies_owner_all" ON public.brand_channel_strategies;
CREATE POLICY "brand_channel_strategies_owner_all"
  ON public.brand_channel_strategies FOR ALL
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "content_themes_owner_all" ON public.content_themes;
CREATE POLICY "content_themes_owner_all"
  ON public.content_themes FOR ALL
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "content_theme_plans_owner_all" ON public.content_theme_plans;
CREATE POLICY "content_theme_plans_owner_all"
  ON public.content_theme_plans FOR ALL
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "content_memory_owner_all" ON public.content_memory;
CREATE POLICY "content_memory_owner_all"
  ON public.content_memory FOR ALL
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "native_content_briefs_owner_all" ON public.native_content_briefs;
CREATE POLICY "native_content_briefs_owner_all"
  ON public.native_content_briefs FOR ALL
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "content_drafts_owner_all" ON public.content_drafts;
CREATE POLICY "content_drafts_owner_all"
  ON public.content_drafts FOR ALL
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "user_edit_learnings_owner_all" ON public.user_edit_learnings;
CREATE POLICY "user_edit_learnings_owner_all"
  ON public.user_edit_learnings FOR ALL
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "performance_snapshots_owner_all" ON public.performance_snapshots;
CREATE POLICY "performance_snapshots_owner_all"
  ON public.performance_snapshots FOR ALL
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "content_experiments_owner_all" ON public.content_experiments;
CREATE POLICY "content_experiments_owner_all"
  ON public.content_experiments FOR ALL
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "experiment_variants_owner_all" ON public.experiment_variants;
CREATE POLICY "experiment_variants_owner_all"
  ON public.experiment_variants FOR ALL
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "experiment_results_owner_all" ON public.experiment_results;
CREATE POLICY "experiment_results_owner_all"
  ON public.experiment_results FOR ALL
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "content_learnings_owner_all" ON public.content_learnings;
CREATE POLICY "content_learnings_owner_all"
  ON public.content_learnings FOR ALL
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "content_scores_owner_all" ON public.content_scores;
CREATE POLICY "content_scores_owner_all"
  ON public.content_scores FOR ALL
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "workflow_jobs_owner_all" ON public.workflow_jobs;
CREATE POLICY "workflow_jobs_owner_all"
  ON public.workflow_jobs FOR ALL
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "ai_usage_logs_owner_select" ON public.ai_usage_logs;
CREATE POLICY "ai_usage_logs_owner_select"
  ON public.ai_usage_logs FOR SELECT
  USING (user_id = (select auth.uid()));
