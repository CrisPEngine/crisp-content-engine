-- ============================================================
-- 020: Idea Engine generation warning (non-fatal history failures)
-- ============================================================

ALTER TABLE public.idea_engine_runs
  ADD COLUMN IF NOT EXISTS generation_warning TEXT;

COMMENT ON COLUMN public.idea_engine_runs.generation_warning IS 'Non-fatal warning shown during generation (e.g. content history unavailable)';
