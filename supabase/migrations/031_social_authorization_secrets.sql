-- Encrypted OAuth tokens for native provider authorizations (Instagram Login, Threads, etc.)
-- Service role only — never exposed to authenticated RLS clients.

CREATE TABLE IF NOT EXISTS public.social_authorization_secrets (
  authorization_id        UUID        PRIMARY KEY REFERENCES public.social_authorizations(id) ON DELETE CASCADE,
  access_token_encrypted  TEXT        NOT NULL,
  refresh_token_encrypted TEXT,
  expires_at              TIMESTAMPTZ,
  token_type              TEXT        NOT NULL DEFAULT 'user',
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.social_authorization_secrets ENABLE ROW LEVEL SECURITY;

-- No policies for authenticated users
REVOKE ALL ON public.social_authorization_secrets FROM authenticated;
GRANT ALL ON public.social_authorization_secrets TO service_role;

COMMENT ON TABLE public.social_authorization_secrets IS
  'OAuth tokens for social_authorizations. Read/write via service role only.';
