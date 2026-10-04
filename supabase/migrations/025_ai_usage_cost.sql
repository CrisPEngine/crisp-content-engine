-- Additive cost columns for ai_usage_logs.
-- Nullable on purpose: existing rows stay valid and are not backfilled.
-- Apply during the deployment phase. Does not change Airtable or Make.

ALTER TABLE public.ai_usage_logs
  ADD COLUMN IF NOT EXISTS reasoning_tokens INT,
  ADD COLUMN IF NOT EXISTS estimated_cost_usd NUMERIC(12, 6);

COMMENT ON COLUMN public.ai_usage_logs.reasoning_tokens IS
  'Reasoning tokens reported by the provider. Null on rows written before this column existed.';
COMMENT ON COLUMN public.ai_usage_logs.estimated_cost_usd IS
  'Estimated USD from the central price table. Null when the model price is unknown or the row predates this column.';
