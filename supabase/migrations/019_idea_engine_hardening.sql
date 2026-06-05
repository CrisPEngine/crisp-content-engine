-- ============================================================
-- 019: Idea Engine production hardening
-- hook column on items; idempotency_key on runs
-- ============================================================

ALTER TABLE public.idea_engine_items
  ADD COLUMN IF NOT EXISTS hook TEXT;

COMMENT ON COLUMN public.idea_engine_items.hook IS 'Hook/headline line; maps to ContentQueue hook on confirm';

ALTER TABLE public.idea_engine_runs
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idea_engine_runs_user_idempotency_idx
  ON public.idea_engine_runs (user_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;
