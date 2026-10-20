-- Brand asset library: collections, enrichment, embeddings, and selection learning.
-- Migration 037. Independent of 036 (publish worker heartbeats on another branch).
-- Additive only: no ordering requirement relative to 036. Existing rows keep null collection and empty embedding until enriched.

CREATE TABLE IF NOT EXISTS public.asset_collections (
  id              UUID        PRIMARY KEY,
  owner_user_id   UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  brand_id        UUID        NOT NULL REFERENCES public.brand_brains(id) ON DELETE CASCADE,
  name            TEXT        NOT NULL,
  parent_id       UUID        REFERENCES public.asset_collections(id) ON DELETE SET NULL,
  sort_order      INT         NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS asset_collections_brand_idx
  ON public.asset_collections (owner_user_id, brand_id, sort_order);

ALTER TABLE public.content_assets
  ADD COLUMN IF NOT EXISTS collection_id UUID REFERENCES public.asset_collections(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source_attribution TEXT,
  ADD COLUMN IF NOT EXISTS search_embedding JSONB,
  ADD COLUMN IF NOT EXISTS embedding_model TEXT,
  ADD COLUMN IF NOT EXISTS embedding_updated_at TIMESTAMPTZ;

ALTER TABLE public.content_asset_links
  ADD COLUMN IF NOT EXISTS selection_path TEXT,
  ADD COLUMN IF NOT EXISTS selection_reason TEXT;

CREATE TABLE IF NOT EXISTS public.asset_selection_signals (
  id              UUID        PRIMARY KEY,
  owner_user_id   UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  brand_id        UUID        NOT NULL REFERENCES public.brand_brains(id) ON DELETE CASCADE,
  asset_id        UUID        REFERENCES public.content_assets(id) ON DELETE SET NULL,
  content_id      TEXT,
  channel         TEXT,
  signal_type     TEXT        NOT NULL,
  weight          REAL        NOT NULL DEFAULT 0,
  note            TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS asset_selection_signals_brand_asset_idx
  ON public.asset_selection_signals (owner_user_id, brand_id, asset_id, created_at DESC);

CREATE INDEX IF NOT EXISTS asset_selection_signals_content_idx
  ON public.asset_selection_signals (owner_user_id, content_id, created_at DESC);

ALTER TABLE public.asset_collections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.asset_selection_signals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "asset_collections_owner_read" ON public.asset_collections;
CREATE POLICY "asset_collections_owner_read"
  ON public.asset_collections FOR SELECT
  USING (owner_user_id = (select auth.uid()));

DROP POLICY IF EXISTS "asset_selection_signals_owner_read" ON public.asset_selection_signals;
CREATE POLICY "asset_selection_signals_owner_read"
  ON public.asset_selection_signals FOR SELECT
  USING (owner_user_id = (select auth.uid()));
