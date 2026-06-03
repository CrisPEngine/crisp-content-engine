-- Operator action hardening
-- Adds durable audit logs, idempotency storage, and a rate-limit counter for internal operator actions.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================
-- 1. Durable operator audit logs
-- ============================================

CREATE TABLE IF NOT EXISTS public.operator_action_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  action text NOT NULL,
  status text NOT NULL CHECK (status IN ('started', 'succeeded', 'failed')),
  request_id text NOT NULL,
  idempotency_key text,
  actor_type text NOT NULL CHECK (actor_type IN ('admin_session', 'operator_secret', 'system')),
  actor_id text,
  dry_run boolean NOT NULL DEFAULT false,
  brand_profile_id text,
  content_id text,
  input_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  output_summary jsonb,
  result jsonb,
  error_code text,
  error_message text,
  duration_ms integer,
  source_ip text,
  user_agent text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS operator_action_logs_created_at_idx
  ON public.operator_action_logs (created_at DESC);

CREATE INDEX IF NOT EXISTS operator_action_logs_action_status_idx
  ON public.operator_action_logs (action, status, created_at DESC);

CREATE INDEX IF NOT EXISTS operator_action_logs_idempotency_idx
  ON public.operator_action_logs (action, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

ALTER TABLE public.operator_action_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role can manage operator action logs" ON public.operator_action_logs;
CREATE POLICY "Service role can manage operator action logs"
ON public.operator_action_logs
FOR ALL
USING (false)
WITH CHECK (false);

-- ============================================
-- 2. Idempotency storage
-- ============================================

CREATE TABLE IF NOT EXISTS public.operator_idempotency_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  action text NOT NULL,
  idempotency_key text NOT NULL,
  request_hash text NOT NULL,
  status text NOT NULL CHECK (status IN ('started', 'succeeded', 'failed')),
  actor_type text NOT NULL CHECK (actor_type IN ('admin_session', 'operator_secret', 'system')),
  actor_id text,
  request_id text NOT NULL,
  action_log_id uuid REFERENCES public.operator_action_logs(id) ON DELETE SET NULL,
  response jsonb,
  error_code text,
  error_message text,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  UNIQUE (action, idempotency_key)
);

CREATE INDEX IF NOT EXISTS operator_idempotency_keys_expires_at_idx
  ON public.operator_idempotency_keys (expires_at);

ALTER TABLE public.operator_idempotency_keys ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role can manage operator idempotency keys" ON public.operator_idempotency_keys;
CREATE POLICY "Service role can manage operator idempotency keys"
ON public.operator_idempotency_keys
FOR ALL
USING (false)
WITH CHECK (false);

-- ============================================
-- 3. Operator rate limits
-- ============================================

CREATE TABLE IF NOT EXISTS public.operator_rate_limits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  key text NOT NULL,
  action text NOT NULL,
  bucket_start timestamptz NOT NULL,
  count integer NOT NULL DEFAULT 0,
  UNIQUE (key, action, bucket_start)
);

CREATE INDEX IF NOT EXISTS operator_rate_limits_bucket_idx
  ON public.operator_rate_limits (bucket_start);

ALTER TABLE public.operator_rate_limits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role can manage operator rate limits" ON public.operator_rate_limits;
CREATE POLICY "Service role can manage operator rate limits"
ON public.operator_rate_limits
FOR ALL
USING (false)
WITH CHECK (false);

CREATE OR REPLACE FUNCTION public.check_operator_rate_limit(
  p_key text,
  p_action text,
  p_window_seconds integer,
  p_limit integer
)
RETURNS TABLE (
  allowed boolean,
  limit_count integer,
  remaining integer,
  reset_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_bucket_start timestamptz;
  v_count integer;
BEGIN
  v_bucket_start := to_timestamp(
    floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds
  );

  INSERT INTO public.operator_rate_limits (key, action, bucket_start, count)
  VALUES (p_key, p_action, v_bucket_start, 1)
  ON CONFLICT (key, action, bucket_start)
  DO UPDATE
    SET count = public.operator_rate_limits.count + 1,
        updated_at = now()
  RETURNING public.operator_rate_limits.count INTO v_count;

  RETURN QUERY
  SELECT
    v_count <= p_limit,
    p_limit,
    greatest(p_limit - v_count, 0),
    v_bucket_start + make_interval(secs => p_window_seconds);
END;
$$;

COMMENT ON TABLE public.operator_action_logs IS
'Durable internal audit trail for protected operator actions. Payloads must be redacted before insert.';

COMMENT ON TABLE public.operator_idempotency_keys IS
'Stores completed mutating operator action responses keyed by action and idempotency key.';

COMMENT ON FUNCTION public.check_operator_rate_limit(text, text, integer, integer) IS
'Atomically increments and checks operator action rate-limit buckets. Uses secure search_path.';
