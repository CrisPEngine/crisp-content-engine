-- Additive brand knowledge. brand_brains remains the parent record.
-- Existing identity, voice, guardrails, and knowledge JSON are not modified.
-- Approved products, capabilities, claims, and sources are children of a brand brain.
-- Proposals are not approved knowledge until a person applies them.

CREATE TABLE IF NOT EXISTS public.brand_evidence_sources (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  brand_brain_id    UUID        NOT NULL REFERENCES public.brand_brains(id) ON DELETE CASCADE,
  title             TEXT        NOT NULL,
  source_type       TEXT        NOT NULL,
  origin            TEXT,
  url               TEXT,
  retrieved_at      TIMESTAMPTZ,
  published_at      TIMESTAMPTZ,
  content_hash      TEXT,
  trust             TEXT        NOT NULL DEFAULT 'unclassified',
  review_status     TEXT        NOT NULL DEFAULT 'unreviewed',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS brand_evidence_sources_brand_idx
  ON public.brand_evidence_sources (brand_brain_id, review_status);

CREATE TABLE IF NOT EXISTS public.brand_products (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  brand_brain_id      UUID        NOT NULL REFERENCES public.brand_brains(id) ON DELETE CASCADE,
  name                TEXT        NOT NULL,
  description         TEXT,
  category            TEXT,
  parent_product_id   UUID        REFERENCES public.brand_products(id) ON DELETE SET NULL,
  commercial_model    TEXT,
  pricing             JSONB       NOT NULL DEFAULT '{}'::jsonb,
  availability        TEXT        NOT NULL DEFAULT 'unverified',
  markets             JSONB       NOT NULL DEFAULT '[]'::jsonb,
  product_url         TEXT,
  documentation_url   TEXT,
  release_version     TEXT,
  last_verified       DATE,
  lifecycle_status    TEXT        NOT NULL DEFAULT 'unverified',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS brand_products_brand_idx
  ON public.brand_products (brand_brain_id, name);

CREATE TABLE IF NOT EXISTS public.brand_capabilities (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  brand_brain_id        UUID        NOT NULL REFERENCES public.brand_brains(id) ON DELETE CASCADE,
  product_id            UUID        REFERENCES public.brand_products(id) ON DELETE SET NULL,
  name                  TEXT        NOT NULL,
  description           TEXT        NOT NULL DEFAULT '',
  user_benefit          TEXT,
  availability          TEXT        NOT NULL DEFAULT 'unverified',
  verification_status   TEXT        NOT NULL DEFAULT 'verification_required',
  evidence              TEXT,
  evidence_url          TEXT,
  source_id             UUID        REFERENCES public.brand_evidence_sources(id) ON DELETE SET NULL,
  documentation_ref     TEXT,
  release_version       TEXT,
  last_verified         DATE,
  verification_owner    TEXT,
  approved_language     TEXT,
  limitations           TEXT,
  prohibited_claims     JSONB       NOT NULL DEFAULT '[]'::jsonb,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT brand_capabilities_verification_check CHECK (
    verification_status IN ('verified', 'unverified', 'verification_required', 'evidence_outdated', 'disputed')
  )
);

CREATE INDEX IF NOT EXISTS brand_capabilities_brand_idx
  ON public.brand_capabilities (brand_brain_id, verification_status, availability);

CREATE TABLE IF NOT EXISTS public.brand_claims (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  brand_brain_id        UUID        NOT NULL REFERENCES public.brand_brains(id) ON DELETE CASCADE,
  product_id            UUID        REFERENCES public.brand_products(id) ON DELETE SET NULL,
  capability_id         UUID        REFERENCES public.brand_capabilities(id) ON DELETE SET NULL,
  claim_text            TEXT        NOT NULL,
  category              TEXT,
  verification_status   TEXT        NOT NULL DEFAULT 'verification_required',
  approval_status       TEXT        NOT NULL DEFAULT 'proposed',
  approved_wording      TEXT,
  scope                 TEXT,
  market                TEXT,
  prohibited            BOOLEAN     NOT NULL DEFAULT FALSE,
  restrictions          TEXT,
  source_id             UUID        REFERENCES public.brand_evidence_sources(id) ON DELETE SET NULL,
  last_reviewed         DATE,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS brand_claims_brand_idx
  ON public.brand_claims (brand_brain_id, approval_status, prohibited);

CREATE TABLE IF NOT EXISTS public.brand_knowledge_proposals (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  brand_brain_id    UUID        NOT NULL REFERENCES public.brand_brains(id) ON DELETE CASCADE,
  session_key       TEXT        NOT NULL,
  record_type       TEXT        NOT NULL,
  natural_key       TEXT        NOT NULL,
  payload           JSONB       NOT NULL,
  status            TEXT        NOT NULL DEFAULT 'proposed',
  source_id         UUID        REFERENCES public.brand_evidence_sources(id) ON DELETE SET NULL,
  decided_at        TIMESTAMPTZ,
  applied_record_id UUID,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (brand_brain_id, session_key, natural_key)
);

CREATE INDEX IF NOT EXISTS brand_knowledge_proposals_brand_idx
  ON public.brand_knowledge_proposals (brand_brain_id, status);

CREATE TABLE IF NOT EXISTS public.brand_knowledge_events (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  brand_brain_id    UUID        NOT NULL REFERENCES public.brand_brains(id) ON DELETE CASCADE,
  action            TEXT        NOT NULL,
  record_type       TEXT        NOT NULL,
  record_id         UUID,
  before_state      JSONB,
  after_state       JSONB,
  note              TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS brand_knowledge_events_brand_idx
  ON public.brand_knowledge_events (brand_brain_id, created_at DESC);

ALTER TABLE public.ai_usage_logs
  ADD COLUMN IF NOT EXISTS brand_id UUID,
  ADD COLUMN IF NOT EXISTS content_id UUID,
  ADD COLUMN IF NOT EXISTS correlation_id TEXT;

COMMENT ON COLUMN public.ai_usage_logs.brand_id IS
  'Brand brain that scoped the invocation. Null on rows written before attribution existed.';
COMMENT ON COLUMN public.ai_usage_logs.content_id IS
  'Article or content item, when the caller had one. Null when the call is not content-specific.';
COMMENT ON COLUMN public.ai_usage_logs.correlation_id IS
  'Groups the model calls of one workflow run. Not an API key.';

ALTER TABLE public.brand_evidence_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.brand_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.brand_capabilities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.brand_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.brand_knowledge_proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.brand_knowledge_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "brand_evidence_sources_owner_all" ON public.brand_evidence_sources;
CREATE POLICY "brand_evidence_sources_owner_all"
  ON public.brand_evidence_sources FOR ALL
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "brand_products_owner_all" ON public.brand_products;
CREATE POLICY "brand_products_owner_all"
  ON public.brand_products FOR ALL
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "brand_capabilities_owner_all" ON public.brand_capabilities;
CREATE POLICY "brand_capabilities_owner_all"
  ON public.brand_capabilities FOR ALL
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "brand_claims_owner_all" ON public.brand_claims;
CREATE POLICY "brand_claims_owner_all"
  ON public.brand_claims FOR ALL
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "brand_knowledge_proposals_owner_all" ON public.brand_knowledge_proposals;
CREATE POLICY "brand_knowledge_proposals_owner_all"
  ON public.brand_knowledge_proposals FOR ALL
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "brand_knowledge_events_owner_all" ON public.brand_knowledge_events;
CREATE POLICY "brand_knowledge_events_owner_all"
  ON public.brand_knowledge_events FOR ALL
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));
