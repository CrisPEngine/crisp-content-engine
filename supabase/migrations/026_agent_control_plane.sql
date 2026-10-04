-- Agent control plane.
-- Stores hashed credentials, audit, idempotency, and agent-owned records.
-- Plaintext API keys are never stored.

CREATE TABLE IF NOT EXISTS public.agent_credentials (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name                TEXT        NOT NULL,
  owner_user_id       UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organisation_id     TEXT,
  allowed_brand_ids   UUID[]      NOT NULL DEFAULT '{}',
  capabilities        TEXT[]      NOT NULL DEFAULT '{}',
  environment         TEXT        NOT NULL DEFAULT 'production',
  key_hash            TEXT        NOT NULL UNIQUE,
  key_prefix          TEXT        NOT NULL,
  rate_limit          JSONB       NOT NULL DEFAULT '{}'::jsonb,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at        TIMESTAMPTZ,
  expires_at          TIMESTAMPTZ,
  revoked_at          TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS agent_credentials_owner_idx ON public.agent_credentials (owner_user_id);

CREATE TABLE IF NOT EXISTS public.agent_idempotency (
  credential_id     UUID        NOT NULL REFERENCES public.agent_credentials(id) ON DELETE CASCADE,
  idempotency_key   TEXT        NOT NULL,
  request_hash      TEXT        NOT NULL,
  response          JSONB       NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (credential_id, idempotency_key)
);

CREATE TABLE IF NOT EXISTS public.agent_rate_windows (
  credential_id     UUID        NOT NULL REFERENCES public.agent_credentials(id) ON DELETE CASCADE,
  window_key        TEXT        NOT NULL,
  count             INT         NOT NULL,
  reset_at          TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (credential_id, window_key)
);

CREATE TABLE IF NOT EXISTS public.agent_daily_cost (
  credential_id     UUID        NOT NULL REFERENCES public.agent_credentials(id) ON DELETE CASCADE,
  day               DATE        NOT NULL,
  usd               NUMERIC(12, 6) NOT NULL,
  image_usd         NUMERIC(12, 6) NOT NULL DEFAULT 0,
  PRIMARY KEY (credential_id, day)
);

CREATE TABLE IF NOT EXISTS public.agent_audit_log (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  credential_id       UUID        NOT NULL REFERENCES public.agent_credentials(id) ON DELETE CASCADE,
  owner_user_id       UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  brand_id            UUID,
  action              TEXT        NOT NULL,
  capability          TEXT,
  consequence_level   INT,
  request_id          TEXT        NOT NULL,
  idempotency_key     TEXT,
  request_summary     JSONB       NOT NULL DEFAULT '{}'::jsonb,
  affected_object     TEXT,
  result_status       TEXT        NOT NULL,
  approval_required   BOOLEAN     NOT NULL DEFAULT FALSE,
  approval_id         TEXT,
  latency_ms          INT         NOT NULL,
  error_code          TEXT,
  external_ids        JSONB       NOT NULL DEFAULT '{}'::jsonb,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS agent_audit_owner_idx ON public.agent_audit_log (owner_user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.agent_records (
  id              UUID        PRIMARY KEY,
  owner_user_id   UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  brand_id        UUID,
  kind            TEXT        NOT NULL,
  payload         JSONB       NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS agent_records_owner_kind_idx ON public.agent_records (owner_user_id, kind, brand_id);

ALTER TABLE public.agent_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_idempotency ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_rate_windows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_daily_cost ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "agent_credentials_owner_read" ON public.agent_credentials;
CREATE POLICY "agent_credentials_owner_read"
  ON public.agent_credentials FOR SELECT
  USING (owner_user_id = (select auth.uid()));

DROP POLICY IF EXISTS "agent_audit_owner_read" ON public.agent_audit_log;
CREATE POLICY "agent_audit_owner_read"
  ON public.agent_audit_log FOR SELECT
  USING (owner_user_id = (select auth.uid()));

DROP POLICY IF EXISTS "agent_records_owner_read" ON public.agent_records;
CREATE POLICY "agent_records_owner_read"
  ON public.agent_records FOR SELECT
  USING (owner_user_id = (select auth.uid()));
