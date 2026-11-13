-- Stable keys so applying a proposal twice updates the same record.

ALTER TABLE public.brand_products
  ADD COLUMN IF NOT EXISTS natural_key TEXT;

ALTER TABLE public.brand_capabilities
  ADD COLUMN IF NOT EXISTS natural_key TEXT;

ALTER TABLE public.brand_claims
  ADD COLUMN IF NOT EXISTS natural_key TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS brand_products_natural_key_idx
  ON public.brand_products (brand_brain_id, natural_key)
  WHERE natural_key IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS brand_capabilities_natural_key_idx
  ON public.brand_capabilities (brand_brain_id, natural_key)
  WHERE natural_key IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS brand_claims_natural_key_idx
  ON public.brand_claims (brand_brain_id, natural_key)
  WHERE natural_key IS NOT NULL;
