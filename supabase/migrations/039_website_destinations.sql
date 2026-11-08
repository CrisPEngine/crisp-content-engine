-- Website and CMS destinations per owner and brand.
-- Credentials live in website_destination_secrets, encrypted by the app and readable only by the service role.

CREATE TABLE IF NOT EXISTS public.website_destinations (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id       UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  brand_id            UUID        NOT NULL REFERENCES public.brand_brains(id) ON DELETE CASCADE,
  destination_key     TEXT        NOT NULL,
  provider            TEXT        NOT NULL,
  name                TEXT        NOT NULL,
  base_url            TEXT,
  enabled             BOOLEAN     NOT NULL DEFAULT TRUE,
  credential_source   TEXT        NOT NULL DEFAULT 'stored' CHECK (credential_source IN ('stored', 'environment')),
  settings            JSONB       NOT NULL DEFAULT '{}'::jsonb,
  taxonomy            JSONB,
  taxonomy_synced_at  TIMESTAMPTZ,
  health              JSONB       NOT NULL DEFAULT '{}'::jsonb,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (owner_user_id, brand_id, destination_key)
);

CREATE INDEX IF NOT EXISTS website_destinations_owner_brand_idx
  ON public.website_destinations (owner_user_id, brand_id);

ALTER TABLE public.website_destinations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS website_destinations_owner_select ON public.website_destinations;
CREATE POLICY website_destinations_owner_select ON public.website_destinations
  FOR SELECT TO authenticated
  USING (owner_user_id = auth.uid());

REVOKE ALL ON public.website_destinations FROM anon;
REVOKE ALL ON public.website_destinations FROM authenticated;
GRANT SELECT ON public.website_destinations TO authenticated;
GRANT ALL ON public.website_destinations TO service_role;

CREATE TABLE IF NOT EXISTS public.website_destination_secrets (
  destination_id        UUID        PRIMARY KEY REFERENCES public.website_destinations(id) ON DELETE CASCADE,
  credentials_encrypted TEXT        NOT NULL,
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.website_destination_secrets ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.website_destination_secrets FROM authenticated;
REVOKE ALL ON public.website_destination_secrets FROM anon;
GRANT ALL ON public.website_destination_secrets TO service_role;

COMMENT ON TABLE public.website_destination_secrets IS
  'Encrypted CMS credentials for website_destinations. Service role only; never returned to the browser.';
