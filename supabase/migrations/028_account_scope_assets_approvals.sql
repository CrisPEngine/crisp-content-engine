-- Account-scoped credentials, brand asset library fields, and human approval requests.
-- Additive. Existing credential rows default to BRAND. Existing asset rows stay drafts and are not verified references.

ALTER TABLE public.agent_credentials
  ADD COLUMN IF NOT EXISTS scope TEXT NOT NULL DEFAULT 'BRAND';

ALTER TABLE public.content_assets
  ADD COLUMN IF NOT EXISTS library_type TEXT,
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS tags TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS product_feature TEXT,
  ADD COLUMN IF NOT EXISTS theme_ids TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS verified_reference BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS reference_allowed BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS public.approval_requests (
  id                    UUID        PRIMARY KEY,
  owner_user_id         UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  brand_id              UUID,
  credential_id         UUID        NOT NULL REFERENCES public.agent_credentials(id) ON DELETE CASCADE,
  action                TEXT        NOT NULL,
  target_type           TEXT        NOT NULL,
  target_id             TEXT        NOT NULL,
  summary               TEXT        NOT NULL,
  preview               JSONB       NOT NULL DEFAULT '{}'::jsonb,
  consequence_level     INT         NOT NULL,
  requested_action      TEXT        NOT NULL,
  parameters            JSONB       NOT NULL DEFAULT '{}'::jsonb,
  parameter_hash        TEXT        NOT NULL,
  content_hash          TEXT        NOT NULL,
  status                TEXT        NOT NULL,
  token_hash            TEXT        NOT NULL UNIQUE,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at            TIMESTAMPTZ NOT NULL,
  resolved_at           TIMESTAMPTZ,
  resolved_by           UUID,
  authorization_method  TEXT,
  execution_status      TEXT        NOT NULL DEFAULT 'pending',
  idempotency_key       TEXT
);

CREATE INDEX IF NOT EXISTS approval_requests_owner_idx
  ON public.approval_requests (owner_user_id, status, created_at DESC);

ALTER TABLE public.approval_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "approval_requests_owner_read" ON public.approval_requests;
CREATE POLICY "approval_requests_owner_read"
  ON public.approval_requests FOR SELECT
  USING (owner_user_id = (select auth.uid()));
