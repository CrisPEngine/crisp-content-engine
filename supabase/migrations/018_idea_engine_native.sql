-- ============================================================
-- 018: Idea Engine native generation support
-- Widen item status constraint; add scheduling + post_type columns
-- ============================================================

ALTER TABLE public.idea_engine_items
  DROP CONSTRAINT IF EXISTS idea_engine_items_status_check;

ALTER TABLE public.idea_engine_items
  ADD CONSTRAINT idea_engine_items_status_check
  CHECK (status IN (
    'pending',
    'generating',
    'ready',
    'failed',
    'approved',
    'rejected',
    'regenerating',
    'queued'
  ));

ALTER TABLE public.idea_engine_items
  ADD COLUMN IF NOT EXISTS scheduled_time TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS post_type TEXT;

-- image_prompt may store JSON objects from native generator
COMMENT ON COLUMN public.idea_engine_items.image_prompt IS 'JSON string or text image prompt from generator';
COMMENT ON COLUMN public.idea_engine_items.scheduled_time IS 'Recommended publish time (ISO), set at generation when native engine enabled';
