-- Native strategy drafts, generation metadata, and pre-regenerate snapshots.

ALTER TABLE public.brand_strategies
  ADD COLUMN IF NOT EXISTS draft_payload JSONB,
  ADD COLUMN IF NOT EXISTS generation_metadata JSONB,
  ADD COLUMN IF NOT EXISTS strategy_extras JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS public.brand_strategy_snapshots (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  strategy_id     UUID        NOT NULL REFERENCES public.brand_strategies(id) ON DELETE CASCADE,
  snapshot        JSONB       NOT NULL,
  reason          TEXT        NOT NULL DEFAULT 'pre_regenerate',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS brand_strategy_snapshots_strategy_idx
  ON public.brand_strategy_snapshots (strategy_id, created_at DESC);

ALTER TABLE public.brand_strategy_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "brand_strategy_snapshots_owner_all" ON public.brand_strategy_snapshots;
CREATE POLICY "brand_strategy_snapshots_owner_all"
  ON public.brand_strategy_snapshots FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
