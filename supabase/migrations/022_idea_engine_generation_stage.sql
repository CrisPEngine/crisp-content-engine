-- ============================================================
-- 022: Idea Engine generation stage tracking (polling + stale guard)
-- ============================================================

ALTER TABLE public.idea_engine_runs
  ADD COLUMN IF NOT EXISTS generation_stage TEXT,
  ADD COLUMN IF NOT EXISTS generation_started_at TIMESTAMPTZ;

COMMENT ON COLUMN public.idea_engine_runs.generation_stage IS 'Native engine progress stage for UI polling (e.g. loading_brand_context, generating_x)';
COMMENT ON COLUMN public.idea_engine_runs.generation_started_at IS 'When the current generating pass started; used by stale-run guard';
