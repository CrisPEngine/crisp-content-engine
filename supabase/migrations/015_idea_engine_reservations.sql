-- ============================================================
-- 015: Idea Engine quota reservations
--
-- Introduces a reservation-based quota model for Idea Engine:
--   1. When Make returns generated items → create a reservation (do NOT
--      touch usage_posts yet).
--   2. When user confirms items into queue → convert reservation → usage.
--   3. Delete item before confirm → reduce reservation by 1.
--   4. Cancel run → delete reservation (quota never consumed).
--   5. Regenerate → no change to reservation (replace in place).
--
-- This prevents double-counting and ensures quota is only consumed for
-- items the user actually sends to the content queue.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.usage_reservations (
  id                UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id           UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Cascade-delete when the parent run is deleted/cancelled
  run_id            UUID        NOT NULL REFERENCES public.idea_engine_runs(id) ON DELETE CASCADE,
  year_month        TEXT        NOT NULL,  -- 'YYYY-MM' of the generation billing period
  linkedin_reserved INT         NOT NULL DEFAULT 0,
  x_reserved        INT         NOT NULL DEFAULT 0,
  blog_reserved     INT         NOT NULL DEFAULT 0,
  meta_pool_reserved INT        NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT usage_reservations_run_unique UNIQUE (run_id)
);

CREATE INDEX IF NOT EXISTS usage_reservations_user_ym_idx
  ON public.usage_reservations (user_id, year_month);

CREATE INDEX IF NOT EXISTS usage_reservations_run_id_idx
  ON public.usage_reservations (run_id);

ALTER TABLE public.usage_reservations ENABLE ROW LEVEL SECURITY;

-- All writes are via service-role API routes; users only read their own rows
CREATE POLICY "usage_reservations: user select"
  ON public.usage_reservations FOR SELECT
  USING (auth.uid() = user_id);
