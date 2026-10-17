-- Structured vision analysis for brand asset library matching.
-- Additive. Existing assets keep null analysis until analysed.

ALTER TABLE public.content_assets
  ADD COLUMN IF NOT EXISTS vision_analysis JSONB,
  ADD COLUMN IF NOT EXISTS vision_analysis_status TEXT,
  ADD COLUMN IF NOT EXISTS vision_user_locked BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE public.content_asset_links
  ADD COLUMN IF NOT EXISTS match_reason TEXT;
