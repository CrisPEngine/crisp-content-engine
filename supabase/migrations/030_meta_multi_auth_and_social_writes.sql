-- Multi Meta authorizations per user + native social write policies + unique auth keys

-- Allow multiple Meta OAuth identities per CCE user
ALTER TABLE public.meta_connections DROP CONSTRAINT IF EXISTS meta_connections_user_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS meta_connections_user_facebook_uid
  ON public.meta_connections (user_id, facebook_user_id);

ALTER TABLE public.meta_pages
  ADD COLUMN IF NOT EXISTS meta_connection_id UUID REFERENCES public.meta_connections(id) ON DELETE CASCADE;

ALTER TABLE public.meta_instagram_accounts
  ADD COLUMN IF NOT EXISTS meta_connection_id UUID REFERENCES public.meta_connections(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_meta_pages_connection ON public.meta_pages(meta_connection_id);
CREATE INDEX IF NOT EXISTS idx_meta_ig_connection ON public.meta_instagram_accounts(meta_connection_id);

-- Deduplicate social authorizations per provider account
CREATE UNIQUE INDEX IF NOT EXISTS social_authorizations_owner_provider_account
  ON public.social_authorizations (owner_user_id, provider, provider_account_id);

DROP POLICY IF EXISTS "social_authorizations_owner_write" ON public.social_authorizations;
CREATE POLICY "social_authorizations_owner_write"
  ON public.social_authorizations FOR ALL
  USING (owner_user_id = (select auth.uid()))
  WITH CHECK (owner_user_id = (select auth.uid()));

DROP POLICY IF EXISTS "brand_destinations_owner_write" ON public.brand_destinations;
CREATE POLICY "brand_destinations_owner_write"
  ON public.brand_destinations FOR ALL
  USING (
    brand_id IN (SELECT id FROM public.brand_brains WHERE user_id = (select auth.uid()))
  )
  WITH CHECK (
    brand_id IN (SELECT id FROM public.brand_brains WHERE user_id = (select auth.uid()))
  );

COMMENT ON INDEX meta_connections_user_facebook_uid IS
  'Supports multiple Meta OAuth identities per user (e.g. CrisP Digital vs Folian Instagram admin).';
