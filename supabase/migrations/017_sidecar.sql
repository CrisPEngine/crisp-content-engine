-- ============================================================
-- 017: CRISP Sidecar — engagement opportunities, contacts, usage
-- Personal MVP; writes via service-role API routes only.
-- Do not apply automatically — run manually when ready.
-- ============================================================

-- ── sidecar_engagement_opportunities ─────────────────────────
CREATE TABLE IF NOT EXISTS public.sidecar_engagement_opportunities (
  id                    UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id               UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  brand_profile_id      TEXT,
  brand                 TEXT        NOT NULL,
  platform              TEXT        NOT NULL,
  page_url              TEXT,
  page_title            TEXT,
  source_text           TEXT,
  source_author         TEXT,
  source_handle         TEXT,
  source_profile_url    TEXT,
  message_type          TEXT        NOT NULL,
  objective             TEXT        NOT NULL,
  cta_strength          TEXT        NOT NULL,
  relationship_stage    TEXT        NOT NULL,
  fit_score             INT,
  opportunity_summary   TEXT,
  draft_text            TEXT,
  short_alternative     TEXT,
  recommended_action    TEXT,
  cta_recommendation    TEXT,
  link_recommendation   TEXT,
  risk_notes            TEXT,
  suggested_follow_up   TEXT,
  suggested_tags        TEXT[]      DEFAULT '{}',
  status                TEXT        NOT NULL DEFAULT 'Captured',
  outcome               TEXT        NOT NULL DEFAULT 'None',
  follow_up_date        DATE,
  notes                 TEXT,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT sidecar_opp_status_check CHECK (
    status IN (
      'Captured', 'Drafted', 'Copied', 'Posted manually', 'Sent manually',
      'Needs follow-up', 'Converted', 'Ignored', 'Not a fit'
    )
  ),
  CONSTRAINT sidecar_opp_outcome_check CHECK (
    outcome IN (
      'None', 'Reply received', 'New follower', 'Connection accepted', 'Signup',
      'Lead', 'Dealer interest', 'Creator interest', 'Advertiser interest', 'Sale',
      'Useful research', 'Content idea created', 'No response', 'Negative response'
    )
  ),
  CONSTRAINT sidecar_opp_fit_score_check CHECK (
    fit_score IS NULL OR (fit_score >= 1 AND fit_score <= 10)
  )
);

CREATE INDEX IF NOT EXISTS sidecar_opp_user_created_idx
  ON public.sidecar_engagement_opportunities (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS sidecar_opp_brand_idx
  ON public.sidecar_engagement_opportunities (brand_profile_id);

-- ── sidecar_contacts ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.sidecar_contacts (
  id                    UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id               UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  brand_profile_id      TEXT,
  brand                 TEXT        NOT NULL,
  name                  TEXT,
  handle                TEXT,
  platform              TEXT        NOT NULL,
  profile_url           TEXT,
  website               TEXT,
  email                 TEXT,
  phone                 TEXT,
  organisation          TEXT,
  country               TEXT,
  contact_type          TEXT        NOT NULL DEFAULT 'Other',
  relationship_stage    TEXT        NOT NULL DEFAULT 'Unknown',
  consent_status        TEXT        NOT NULL DEFAULT 'Unknown',
  source_url            TEXT,
  source_context        TEXT,
  notes                 TEXT,
  tags                  TEXT[]      DEFAULT '{}',
  next_action           TEXT,
  follow_up_date        DATE,
  lead_score            INT,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT sidecar_contact_type_check CHECK (
    contact_type IN (
      'Collector', 'Seller', 'Dealer', 'Custom builder', 'Content creator',
      'Photographer', 'Event organiser', 'Potential advertiser', 'Writer',
      'Beta user', 'Writing coach', 'Editor', 'Book marketer', 'Founder',
      'Consultant', 'Agency owner', 'Potential client', 'SaaS founder',
      'Partner', 'Investor / advisor', 'Other'
    )
  ),
  CONSTRAINT sidecar_contact_consent_check CHECK (
    consent_status IN (
      'Unknown', 'Public business contact', 'Provided directly', 'Existing customer',
      'Newsletter subscriber', 'Do not contact', 'Unsubscribed', 'Suppressed'
    )
  )
);

CREATE INDEX IF NOT EXISTS sidecar_contacts_user_created_idx
  ON public.sidecar_contacts (user_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS sidecar_contacts_user_brand_handle_idx
  ON public.sidecar_contacts (user_id, brand_profile_id, platform, handle)
  WHERE handle IS NOT NULL AND handle <> '';

-- ── sidecar_voice_examples (optional seed later) ─────────────
CREATE TABLE IF NOT EXISTS public.sidecar_voice_examples (
  id                UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id           UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  brand_profile_id  TEXT,
  brand             TEXT        NOT NULL,
  platform          TEXT,
  example_text      TEXT        NOT NULL,
  source_url        TEXT,
  approved          BOOLEAN     NOT NULL DEFAULT false,
  voice_tags        TEXT[]      DEFAULT '{}',
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS sidecar_voice_examples_brand_idx
  ON public.sidecar_voice_examples (user_id, brand);

-- ── sidecar_usage_events ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.sidecar_usage_events (
  id              UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id         UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  brand           TEXT,
  platform        TEXT,
  action          TEXT        NOT NULL,
  message_type    TEXT,
  objective       TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  metadata_json   JSONB       DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS sidecar_usage_events_user_created_idx
  ON public.sidecar_usage_events (user_id, created_at DESC);

-- ── updated_at trigger ───────────────────────────────────────
CREATE OR REPLACE FUNCTION public.sidecar_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS sidecar_opp_updated_at ON public.sidecar_engagement_opportunities;
CREATE TRIGGER sidecar_opp_updated_at
  BEFORE UPDATE ON public.sidecar_engagement_opportunities
  FOR EACH ROW EXECUTE FUNCTION public.sidecar_set_updated_at();

DROP TRIGGER IF EXISTS sidecar_contacts_updated_at ON public.sidecar_contacts;
CREATE TRIGGER sidecar_contacts_updated_at
  BEFORE UPDATE ON public.sidecar_contacts
  FOR EACH ROW EXECUTE FUNCTION public.sidecar_set_updated_at();

DROP TRIGGER IF EXISTS sidecar_voice_examples_updated_at ON public.sidecar_voice_examples;
CREATE TRIGGER sidecar_voice_examples_updated_at
  BEFORE UPDATE ON public.sidecar_voice_examples
  FOR EACH ROW EXECUTE FUNCTION public.sidecar_set_updated_at();

-- ── RLS ──────────────────────────────────────────────────────
ALTER TABLE public.sidecar_engagement_opportunities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sidecar_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sidecar_voice_examples ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sidecar_usage_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sidecar_opp: user select"
  ON public.sidecar_engagement_opportunities FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "sidecar_contacts: user select"
  ON public.sidecar_contacts FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "sidecar_voice_examples: user select"
  ON public.sidecar_voice_examples FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "sidecar_usage_events: user select"
  ON public.sidecar_usage_events FOR SELECT
  USING (auth.uid() = user_id);
