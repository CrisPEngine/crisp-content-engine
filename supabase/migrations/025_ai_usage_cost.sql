-- Additive cost columns for ai_usage_logs.
-- Apply manually. Does not change Airtable, Make, or existing rows.

ALTER TABLE public.ai_usage_logs
  ADD COLUMN IF NOT EXISTS reasoning_tokens INT,
  ADD COLUMN IF NOT EXISTS estimated_cost_usd NUMERIC(12, 6);
