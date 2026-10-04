-- Native content assets and long-form articles.
-- Binary files stay with the storage provider. These tables hold CCE metadata.
-- This migration is not applied by the change that adds it.

CREATE TABLE IF NOT EXISTS public.content_assets (
  id                    UUID        PRIMARY KEY,
  owner_user_id         UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  brand_id              UUID        REFERENCES public.brand_brains(id) ON DELETE SET NULL,
  asset_type            TEXT        NOT NULL,
  source_type           TEXT        NOT NULL,
  storage_provider      TEXT        NOT NULL DEFAULT 'cloudinary',
  provider_asset_id     TEXT,
  secure_url            TEXT,
  mime_type             TEXT,
  width                 INT,
  height                INT,
  aspect_ratio          TEXT,
  file_size             BIGINT,
  alt_text              TEXT,
  caption               TEXT,
  title                 TEXT,
  generation_prompt     TEXT,
  generation_provider   TEXT,
  generation_model      TEXT,
  provenance            JSONB       NOT NULL DEFAULT '{}'::jsonb,
  rights_notes          TEXT,
  approval_status       TEXT        NOT NULL DEFAULT 'draft',
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS content_assets_owner_brand_idx
  ON public.content_assets (owner_user_id, brand_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.content_asset_links (
  id              UUID        PRIMARY KEY,
  owner_user_id   UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  asset_id        UUID        NOT NULL REFERENCES public.content_assets(id) ON DELETE CASCADE,
  target_type     TEXT        NOT NULL,
  target_id       TEXT        NOT NULL,
  role            TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (owner_user_id, asset_id, target_type, target_id)
);

CREATE INDEX IF NOT EXISTS content_asset_links_target_idx
  ON public.content_asset_links (owner_user_id, target_type, target_id);

CREATE TABLE IF NOT EXISTS public.articles (
  id              UUID        PRIMARY KEY,
  owner_user_id   UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  brand_id        UUID        NOT NULL REFERENCES public.brand_brains(id) ON DELETE CASCADE,
  status          TEXT        NOT NULL,
  title           TEXT        NOT NULL,
  slug            TEXT,
  document        JSONB       NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS articles_owner_brand_idx
  ON public.articles (owner_user_id, brand_id, updated_at DESC);

ALTER TABLE public.content_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_asset_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.articles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "content_assets_owner_read" ON public.content_assets;
CREATE POLICY "content_assets_owner_read"
  ON public.content_assets FOR SELECT
  USING (owner_user_id = (select auth.uid()));

DROP POLICY IF EXISTS "content_asset_links_owner_read" ON public.content_asset_links;
CREATE POLICY "content_asset_links_owner_read"
  ON public.content_asset_links FOR SELECT
  USING (owner_user_id = (select auth.uid()));

DROP POLICY IF EXISTS "articles_owner_read" ON public.articles;
CREATE POLICY "articles_owner_read"
  ON public.articles FOR SELECT
  USING (owner_user_id = (select auth.uid()));
