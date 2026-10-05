-- Additive destination model.
-- An OAuth authorization is owned by the user. A brand maps to a destination.
-- Existing Meta and LinkedIn tables are not changed or copied by this migration.

CREATE TABLE IF NOT EXISTS public.social_authorizations (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id         UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider              TEXT        NOT NULL,
  provider_account_id   TEXT,
  scopes                TEXT[]      NOT NULL DEFAULT '{}',
  expires_at            TIMESTAMPTZ,
  status                TEXT        NOT NULL DEFAULT 'CONNECTED',
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.social_destinations (
  id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  authorization_id        UUID        NOT NULL REFERENCES public.social_authorizations(id) ON DELETE CASCADE,
  provider                TEXT        NOT NULL,
  destination_type        TEXT        NOT NULL,
  provider_destination_id TEXT        NOT NULL,
  display_name            TEXT        NOT NULL,
  handle                  TEXT,
  status                  TEXT        NOT NULL DEFAULT 'CONNECTED',
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (authorization_id, provider_destination_id)
);

CREATE TABLE IF NOT EXISTS public.brand_destinations (
  brand_id        UUID        NOT NULL REFERENCES public.brand_brains(id) ON DELETE CASCADE,
  destination_id  UUID        NOT NULL REFERENCES public.social_destinations(id) ON DELETE CASCADE,
  purpose         TEXT        NOT NULL DEFAULT 'default_publish',
  enabled         BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (brand_id, destination_id, purpose)
);

ALTER TABLE public.social_authorizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_destinations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.brand_destinations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "social_authorizations_owner_read" ON public.social_authorizations;
CREATE POLICY "social_authorizations_owner_read"
  ON public.social_authorizations FOR SELECT
  USING (owner_user_id = (select auth.uid()));

DROP POLICY IF EXISTS "social_destinations_owner_read" ON public.social_destinations;
CREATE POLICY "social_destinations_owner_read"
  ON public.social_destinations FOR SELECT
  USING (
    authorization_id IN (
      SELECT id FROM public.social_authorizations WHERE owner_user_id = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS "brand_destinations_owner_read" ON public.brand_destinations;
CREATE POLICY "brand_destinations_owner_read"
  ON public.brand_destinations FOR SELECT
  USING (
    brand_id IN (
      SELECT id FROM public.brand_brains WHERE user_id = (select auth.uid())
    )
  );
