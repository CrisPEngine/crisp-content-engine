# Make.com Webhook Payload Reference

## Overview

This document shows the complete payload structures for both trigger types sent to Make.com content generation webhook.

## Webhook URL
`https://hook.eu2.make.com/w6w7needblgtso6hgmo6f9xlz9pntcbf`

## Trigger Type 1: `content_brief_approved`

**When:** A monthly content brief is approved by the user  
**Source:** `/src/lib/contentBrief.ts` → `triggerContentGenerationFromBrief()`

### Complete Payload Structure

```json
{
  "mode": "content_generation",
  "trigger_type": "content_brief_approved",
  "brief_id": "recXXXXXXXXXXXX",
  "user_id": "uuid-here",
  "brand_profile_id": "recYYYYYYYYYYYY",
  "brand_type": "personal" | "company",
  "brief_mode": "continue" | "feedback",
  "monthly": {
    "objective": "Increase engagement and drive sign-ups",
    "themes_focus": "Personal branding tips, platform promotion",
    "key_dates": "December 2025",
    "feedback_notes": "Focus on longer form content with strong hooks",
    "content_preferences": "Call-to-action focused, tips and tricks",
    "cycle_start_date": "2025-12-01",
    "cycle_label": "December 2025",
    "primary_goal": "Awareness" | "Engagement" | "Traffic" | "Leads",
    "success_metric": "CTR" | "comments" | "followers" | "leads",
    "cta": "First Month of CRISP Content is FREE",
    "cta_link": "https://crispdigital.io/signup",
    "offers_to_push": "Free trial, personal brand building tips",
    "topics_to_avoid_this_month": "Competitor mentions, controversial topics",
    "competitor_or_inspo_links": "https://example.com/inspiration"
  },
  "master_strategy_json": {
    "brand_understanding": {
      "summary": "Your go-to expert for AI-driven digital marketing solutions"
    },
    "brand_name": "Ben Rodriguez",
    "audience": "Entrepreneurs and business owners",
    "value_props": "AI-powered content creation",
    "brand_goals": "Drive sign-ups to platform",
    "offers": "First Month FREE trial",
    "voice": {
      "voice_rules": "Professional yet approachable",
      "tone": "Helpful and informative",
      "personality": ["Expert", "Supportive", "Innovative"],
      "style_guidelines": "Long-form content with strong hooks"
    },
    "pillars": [
      {
        "id": "pillar-1",
        "title": "Personal Branding Tips",
        "description": "Actionable advice for building a strong personal brand",
        "topics": ["Personal branding", "Professional growth"]
      }
    ],
    "platform_cadence": [
      {
        "platform": "LinkedIn",
        "postsPerWeek": 3
      }
    ],
    "guardrails": {
      "brand_keywords": ["AI", "digital marketing"],
      "exclude_keywords": ["competitor names"],
      "content_rules": "Focus on value-driven content",
      "topics_to_avoid": ["Controversial topics"],
      "risk_tolerance": "Medium risk"
    }
  },
  "best_post": {
    "id": "recBestPost123",
    "title": "How to Build Your Personal Brand in 2025",
    "body_draft": "Here are 5 actionable tips...",
    "reason": "High engagement and comments"
  },
  "worst_post": {
    "id": "recWorstPost123",
    "title": "Generic Marketing Tips",
    "body_draft": "Some basic marketing advice...",
    "reason": "Low engagement, too generic"
  },
  "person_urn": "urn:li:person:xAYt9A7nyS",
  "organization_urn": null,
  "triggered_at": "2025-12-16T14:30:00.000Z"
}
```

### Key Fields for `content_brief_approved`

- **`mode`**: Always `"content_generation"`
- **`trigger_type`**: Always `"content_brief_approved"`
- **`brief_id`**: Airtable record ID of the content brief
- **`brief_mode`**: `"continue"` or `"feedback"`
- **`monthly`**: Object containing all brief-specific fields
- **`best_post`** / **`worst_post`**: Only present if `brief_mode === "feedback"`

---

## Trigger Type 2: `strategy_confirmed`

**When:** User confirms/keeps their strategy for the next cycle  
**Source:** `/src/lib/email/contentCreation.ts` → `triggerContentCreationForBrand()`

### Complete Payload Structure

```json
{
  "trigger_type": "strategy_confirmed",
  "brand_profile_id": "recYYYYYYYYYYYY",
  "user_id": "uuid-here",
  "person_urn": "urn:li:person:xAYt9A7nyS",
  "organization_urn": null,
  "brand_type": "personal" | "company",
  "strategy_json": {
    "brand_understanding": {
      "summary": "Your go-to expert for AI-driven digital marketing solutions"
    },
    "brand_name": "Ben Rodriguez",
    "audience": "Entrepreneurs and business owners",
    "value_props": "AI-powered content creation",
    "brand_goals": "Drive sign-ups to platform",
    "offers": "First Month FREE trial",
    "voice": {
      "voice_rules": "Professional yet approachable",
      "tone": "Helpful and informative",
      "personality": ["Expert", "Supportive", "Innovative"],
      "style_guidelines": "Long-form content with strong hooks"
    },
    "pillars": [
      {
        "id": "pillar-1",
        "title": "Personal Branding Tips",
        "description": "Actionable advice for building a strong personal brand",
        "topics": ["Personal branding", "Professional growth"]
      }
    ],
    "platform_cadence": [
      {
        "platform": "LinkedIn",
        "postsPerWeek": 3
      }
    ],
    "guardrails": {
      "brand_keywords": ["AI", "digital marketing"],
      "exclude_keywords": ["competitor names"],
      "content_rules": "Focus on value-driven content",
      "topics_to_avoid": ["Controversial topics"],
      "risk_tolerance": "Medium risk"
    }
  },
  "strategy_summary": "Your go-to expert for AI-driven digital marketing solutions. Focus on personal branding tips...",
  "platforms_requested": ["LinkedIn"],
  "triggered_at": "2025-12-16T14:30:00.000Z"
}
```

### Key Fields for `strategy_confirmed`

- **`trigger_type`**: Always `"strategy_confirmed"`
- **NO `mode` field** (unlike `content_brief_approved`)
- **NO `brief_id`** or `monthly` object
- **`strategy_summary`**: Human-readable summary of the strategy
- **`platforms_requested`**: Array of platform names

---

## Differences Summary

| Field | `content_brief_approved` | `strategy_confirmed` |
|-------|------------------------|---------------------|
| `mode` | ✅ `"content_generation"` | ❌ Not present |
| `trigger_type` | ✅ `"content_brief_approved"` | ✅ `"strategy_confirmed"` |
| `brief_id` | ✅ Present | ❌ Not present |
| `brief_mode` | ✅ Present | ❌ Not present |
| `monthly` | ✅ Present (object) | ❌ Not present |
| `best_post` / `worst_post` | ✅ Present (if feedback mode) | ❌ Not present |
| `strategy_summary` | ❌ Not present | ✅ Present |
| `platforms_requested` | ❌ Not present | ✅ Present (array) |
| `master_strategy_json` | ✅ Present | ✅ Present (as `strategy_json`) |

---

## Make.com Scenario Setup

### Route by `trigger_type`

In your Make.com scenario, use a router or filter to handle both trigger types:

1. **Check `trigger_type` field**:
   - If `trigger_type === "content_brief_approved"` → Use brief-specific fields
   - If `trigger_type === "strategy_confirmed"` → Use strategy-only fields

2. **Common fields** (available in both):
   - `brand_profile_id`
   - `user_id`
   - `brand_type`
   - `person_urn` / `organization_urn`
   - `strategy_json` (or `master_strategy_json`)

3. **Content Brief specific**:
   - `brief_id`
   - `brief_mode`
   - `monthly.*` fields
   - `best_post` / `worst_post`

4. **Strategy Confirmed specific**:
   - `strategy_summary`
   - `platforms_requested`

---

## Test Payloads Sent

Both test payloads have been sent to your webhook URL. You should now see all fields in Make.com's webhook module mapping interface.

If you don't see `trigger_type` in the mapping, it may be because:
1. The webhook module needs to be refreshed
2. The field exists but Make.com hasn't indexed it yet
3. Try clicking "Run once" or refreshing the webhook module

---

## Next Steps

1. **Verify fields in Make.com**: Check that all fields are visible in the webhook module
2. **Set up routing**: Use `trigger_type` to route to different flows
3. **Map fields**: Map the appropriate fields based on trigger type
4. **Test**: Run the scenario with both trigger types to verify
