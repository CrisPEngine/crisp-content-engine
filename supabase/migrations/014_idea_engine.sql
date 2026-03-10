-- ============================================================
-- 014: Idea Engine tables
-- Creates idea_engine_runs, idea_engine_items, and adds
-- idea_engine_runs_used to usage_posts
-- ============================================================

-- ── idea_engine_runs ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.idea_engine_runs (
  id                 UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id            UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  brand_profile_id   TEXT,
  idea               TEXT        NOT NULL,
  goal               TEXT,
  notes              TEXT,
  selected_channels  TEXT[]      NOT NULL DEFAULT '{}',
  publish_mode       TEXT        NOT NULL DEFAULT 'queue_only',
  status             TEXT        NOT NULL DEFAULT 'pending',
  -- series_run_id is the public identifier sent to Make and stored in Airtable records
  series_run_id      UUID        DEFAULT gen_random_uuid() UNIQUE,
  total_expected     INT,
  total_generated    INT         DEFAULT 0,
  error              TEXT,
  created_at         TIMESTAMPTZ DEFAULT NOW(),
  completed_at       TIMESTAMPTZ,
  cancelled_at       TIMESTAMPTZ,
  CONSTRAINT idea_engine_runs_status_check
    CHECK (status IN ('pending', 'generating', 'review', 'completed', 'cancelled', 'failed'))
);

CREATE INDEX IF NOT EXISTS idea_engine_runs_user_id_idx
  ON public.idea_engine_runs (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idea_engine_runs_series_run_id_idx
  ON public.idea_engine_runs (series_run_id);

-- ── idea_engine_items ─────────────────────────────────────────
-- Draft items returned by Make, held here before the user confirms them into Airtable ContentQueue.
CREATE TABLE IF NOT EXISTS public.idea_engine_items (
  id               UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  run_id           UUID        NOT NULL REFERENCES public.idea_engine_runs(id) ON DELETE CASCADE,
  user_id          UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  channel          TEXT        NOT NULL,
  post_title       TEXT,
  body_draft       TEXT,
  image_prompt     TEXT,
  hashtags         TEXT,
  series_position  INT,
  series_total     INT,
  status           TEXT        NOT NULL DEFAULT 'pending',
  airtable_record_id TEXT,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT idea_engine_items_status_check
    CHECK (status IN ('pending', 'approved', 'rejected', 'regenerating', 'queued'))
);

CREATE INDEX IF NOT EXISTS idea_engine_items_run_id_idx
  ON public.idea_engine_items (run_id);
CREATE INDEX IF NOT EXISTS idea_engine_items_user_id_idx
  ON public.idea_engine_items (user_id);

-- ── usage_posts: add idea_engine_runs_used column ────────────
ALTER TABLE public.usage_posts
  ADD COLUMN IF NOT EXISTS idea_engine_runs_used INT NOT NULL DEFAULT 0;

-- ── RLS ──────────────────────────────────────────────────────
ALTER TABLE public.idea_engine_runs  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.idea_engine_items ENABLE ROW LEVEL SECURITY;

-- Users can read and update their own runs (writes go through service-role API routes)
CREATE POLICY "idea_engine_runs: user select"
  ON public.idea_engine_runs FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "idea_engine_items: user select"
  ON public.idea_engine_items FOR SELECT
  USING (auth.uid() = user_id);
