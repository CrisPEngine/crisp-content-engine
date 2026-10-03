-- 024 intelligence operations: publish IDs and action audit log
-- Additive only. Safe to re-run.

ALTER TABLE public.content_memory
  ADD COLUMN IF NOT EXISTS external_post_id TEXT;

ALTER TABLE public.content_memory
  ADD COLUMN IF NOT EXISTS external_url TEXT;

CREATE INDEX IF NOT EXISTS content_memory_external_post_idx
  ON public.content_memory (external_post_id)
  WHERE external_post_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.intelligence_action_logs (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_type            TEXT        NOT NULL,
  actor_id              TEXT        NOT NULL,
  channel               TEXT        NOT NULL,
  action                TEXT        NOT NULL,
  ok                    BOOLEAN     NOT NULL,
  error_code            TEXT,
  brand_airtable_id     TEXT,
  idempotency_key       TEXT,
  duration_ms           INT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS intelligence_action_logs_user_idx
  ON public.intelligence_action_logs (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS intelligence_action_logs_actor_idx
  ON public.intelligence_action_logs (actor_type, actor_id, created_at DESC);

ALTER TABLE public.intelligence_action_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "intelligence_action_logs_owner_select" ON public.intelligence_action_logs;
CREATE POLICY "intelligence_action_logs_owner_select"
  ON public.intelligence_action_logs FOR SELECT
  USING (user_id = (select auth.uid()));
