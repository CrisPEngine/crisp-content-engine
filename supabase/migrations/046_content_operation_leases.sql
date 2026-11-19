-- One lease for the content operations worker.
-- Service role writes it. A second overlapping cron run must not start another article.

CREATE TABLE IF NOT EXISTS public.content_operation_leases (
  worker        TEXT        PRIMARY KEY,
  owner         TEXT        NOT NULL,
  leased_until  TIMESTAMPTZ NOT NULL,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.content_operation_leases ENABLE ROW LEVEL SECURITY;

GRANT ALL ON public.content_operation_leases TO service_role;
