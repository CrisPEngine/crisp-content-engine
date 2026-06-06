-- ============================================================
-- 021: Idea Engine partial success + per-channel expansion
-- Adds review_with_errors / confirmed run statuses and confirmed item status
-- ============================================================

ALTER TABLE public.idea_engine_runs
  DROP CONSTRAINT IF EXISTS idea_engine_runs_status_check;

ALTER TABLE public.idea_engine_runs
  ADD CONSTRAINT idea_engine_runs_status_check
  CHECK (status IN (
    'pending',
    'generating',
    'review',
    'review_with_errors',
    'completed',
    'confirmed',
    'cancelled',
    'failed'
  ));

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
    'queued',
    'confirmed'
  ));
