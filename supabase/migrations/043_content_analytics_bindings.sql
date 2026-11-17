-- Per-brand Search Console and GA4 property bindings.
-- A property stored for one brand is not readable as another brand's binding.

CREATE TABLE IF NOT EXISTS public.content_analytics_bindings (
  id                              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                         UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  brand_id                        TEXT        NOT NULL,
  search_console_site_url         TEXT,
  ga4_property_id                 TEXT,
  search_console_last_success_at  TIMESTAMPTZ,
  search_console_last_error       TEXT,
  ga4_last_success_at             TIMESTAMPTZ,
  ga4_last_error                  TEXT,
  created_at                      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, brand_id)
);

CREATE INDEX IF NOT EXISTS content_analytics_bindings_owner_idx
  ON public.content_analytics_bindings (user_id, brand_id);

ALTER TABLE public.content_analytics_bindings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "content_analytics_bindings_owner_all" ON public.content_analytics_bindings;
CREATE POLICY "content_analytics_bindings_owner_all"
  ON public.content_analytics_bindings FOR ALL
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));
