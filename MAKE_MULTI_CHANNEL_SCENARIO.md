# Make.com Multi-Channel Generation Scenario

## Overview

This scenario generates channel-native content for LinkedIn, X, Instagram, Facebook, and Blog based on brand voice and strategy.

**Key features:**
- Single scenario handles all channels via routing
- Pre-generated idempotency keys passed into prompts; each item returns `content_item_key` (no index drift)
- Per-channel AI prompts and validation
- X: singles only in V1 (no threads); X-specific auto-rewrite for validation failures
- One Airtable search per job (by `generation_job_id`) for idempotency; in-memory check per item
- Per-route: append record id + increment platform counter after each create; callback uses these variables

---

## Webhook Trigger Payload

**From:** `POST /api/content/generate` (multi-channel only)  
**To:** Make webhook (env: `MAKE_MULTI_CHANNEL_CONTENT_GENERATION_WEBHOOK_URL`)

The payload includes **identifiers**, **channel request list**, **brand onboarding context**, **approved strategy**, **monthly brief** (if any), **dedupe snapshot** (previous content), **scheduling context**, and **X algo digest**. Missing optional objects are sent as `null`; arrays as `[]`.

### Payload shape (TypeScript)

- **A. Identifiers:** `generation_job_id`, `request_id`, `user_id`, `brand_profile_id`
- **B. Channels:** `channels[]` with `platform`, `count`, `keys[]` (pre-generated content_item_key values)
- **C. Brand voice context:** All known BrandProfiles fields (see mapping below). Use `brand_voice_context.*` in prompts.
- **D. Strategy:** `strategy_json` (full object), `strategy_summary` (string or null)
- **E. Monthly brief:** `monthly_brief` (object or null). When null, Make should still run; use only when present.
- **F. Dedupe:** `previous_content_json` — array of `{ platform, hook, post_type?, topic_bucket?, created_time, one_line_summary? }` (last 30–60 items for this brand). Use to avoid repeating topics/hooks.
- **G. Scheduling context:** `scheduling_context`: `{ timezone, posting_windows?, cadence_defaults?, now_iso }`. **Do not ask OpenAI to schedule;** use only for context or future scheduling steps.
- **H. X algo digest:** `x_algo_digest`: `{ version, bullets[], guardrails: { do[], dont[] } }`

### Brand voice context mapping (source: Airtable BrandProfiles)

| Field | Source | Notes |
|-------|--------|--------|
| client_name, brand_type, timezone, website | BrandProfiles | |
| audience, value_props, offers, brand_tone | BrandProfiles | |
| brand_keywords, exclude_keywords, content_rules, voice_rules | BrandProfiles | |
| compliance_notes, language_region, spelling_variant | BrandProfiles | |
| posting_windows, platforms_requested | BrandProfiles | |
| risk_tolerance, tone_avoid, personal_voice_traits, personal_content_style | BrandProfiles (or null) | |
| brand_goals, additional_info, preferred_image_source | BrandProfiles | |
| personal_full_name, personal_job_title, personal_industry, personal_links | BrandProfiles (if brand_type=personal) | |
| personal_headline, personal_audience, personal_expertise, personal_goals, personal_story | BrandProfiles (if brand_type=personal) | |

### Monthly brief mapping (source: latest ContentBrief for brand, or null)

When present, `monthly_brief` includes: `objective`, `themes_focus`, `key_dates`, `feedback_notes`, `content_preferences`, `primary_goal`, `success_metric`, `cycle_label`, `cycle_start_date`, `cta`, `cta_link`, `offers_to_push`, `topics_to_avoid_this_month`, `competitor_or_inspo_links`, `best_post` (title, body_draft, reason), `worst_post` (title, body_draft, reason).

### Previous content (dedupe)

`previous_content_json` is a compact array (max 60 items) from ContentQueue for this `brand_profile_id`, sorted by `created_time` desc. Each item: `platform`, `hook`, `post_type`, `topic_bucket` (if present), `created_time`, `one_line_summary` (if present). Use in prompts to avoid repeating hooks/topics.

### Scheduling context

- `timezone`: from brand (default UTC)
- `posting_windows`: from brand if present, else null
- `cadence_defaults`: derived from `strategy_json.platform_cadence` or `strategy_json.cadence` when available, e.g. `{ LinkedIn: 3, X: 5 }` (posts per week)
- `now_iso`: server timestamp (UTC) when the payload was built

### Example payload (minimal)

```json
{
  "generation_job_id": "uuid-here",
  "request_id": "uuid-here",
  "user_id": "supabase-user-uuid",
  "brand_profile_id": "recXXX",
  "channels": [
    { "platform": "LinkedIn", "count": 3, "keys": ["uuid:LinkedIn:1", "uuid:LinkedIn:2", "uuid:LinkedIn:3"] },
    { "platform": "X", "count": 10, "keys": ["uuid:X:1", "uuid:X:2", "..."] }
  ],
  "brand_voice_context": {
    "client_name": "Acme",
    "brand_type": "company",
    "timezone": "America/New_York",
    "website": "https://acme.com",
    "audience": "...",
    "value_props": "...",
    "offers": "...",
    "brand_tone": null,
    "brand_keywords": "...",
    "exclude_keywords": "...",
    "content_rules": "...",
    "voice_rules": "...",
    "compliance_notes": null,
    "language_region": "US English",
    "spelling_variant": null,
    "posting_windows": null,
    "platforms_requested": ["LinkedIn", "X"]
  },
  "strategy_json": { "content_pillars": [], "platform_cadence": [] },
  "strategy_summary": "...",
  "monthly_brief": null,
  "previous_content_json": [
    { "platform": "LinkedIn", "hook": "Last week we...", "post_type": "single", "created_time": "2026-01-20T..." }
  ],
  "scheduling_context": {
    "timezone": "America/New_York",
    "posting_windows": null,
    "cadence_defaults": { "LinkedIn": 3, "X": 5 },
    "now_iso": "2026-01-21T12:00:00.000Z"
  },
  "x_algo_digest": {
    "version": "2026-01-21",
    "bullets": ["Engagement signals matter most...", "..."],
    "guardrails": { "do": ["..."], "dont": ["..."] }
  },
  "triggered_at": "2026-01-21T12:00:00.000Z"
}
```

---

## Module Sequence

### 1. Webhook (Trigger)
- Receives payload from `/api/content/generate`
- Parse JSON automatically

### 2. Initialize Variables + Load Existing Keys (Once Per Job)
- **Set variables** (initial values):
  - `record_ids` = `[]`
  - `linkedin_created` = `0`, `x_created` = `0`, `instagram_created` = `0`, `facebook_created` = `0`, `blog_created` = `0`
- **Search records** in ContentQueue
  - Filter: `{generation_job_id} = "{{generation_job_id}}"`
  - Retrieve all `content_item_key` values into an array: `existing_keys` (or merge search results into `existing_keys` if Make returns a list of records)
- This single search avoids per-item Airtable lookups and rate limits.

### 3. Iterator: Loop Channels
- Input array: `channels[]`
- Each iteration provides: `platform`, `count`, `keys[]`

### 4. Router: Channel-Specific Generation
- Route by `platform` value
- 5 routes: LinkedIn, X, Instagram, Facebook, Blog

---

## Route 1: LinkedIn

### 3a. OpenAI Chat (LinkedIn)
**Model:** `gpt-4` (or `gpt-4o`)
**System prompt:**
```
You are CRISP Content Engine. Write LinkedIn-native posts using the brand voice provided.
Output ONLY valid JSON matching the schema exactly.
```

**User prompt:**
```
Brand: {{brand_voice_context.client_name}}
Audience: {{brand_voice_context.audience}}
Voice: {{brand_voice_context.voice_rules}}
Strategy: {{strategy_summary}}

Generate exactly {{count}} LinkedIn posts.
Assign each item a content_item_key from this list in order (first item = first key, etc.): {{keys}}

Output schema (strict JSON):
{
  "items": [
    {
      "content_item_key": "uuid:LinkedIn:1",
      "platform": "LinkedIn",
      "post_type": "single",
      "hook": "...",
      "post_content": "...",
      "hashtags": "..."
    }
  ]
}
```

**Response format:** JSON

### 3b. JSON Parse (LinkedIn)
- Parse OpenAI response
- Extract `items[]`

### 3c. Iterator: Loop LinkedIn Items
- Input array: `items[]`
- Provides: `content_item_key`, `hook`, `post_content`, `hashtags`

### 3d. Idempotency Check (LinkedIn)
- Check: `existing_keys` contains `{{item.content_item_key}}`
- If yes: **Skip create** (go to next iteration)
- If no: continue to create

### 3e. Airtable Create Record (LinkedIn)
- Table: ContentQueue
- Fields:
  - `content_item_key`: `{{item.content_item_key}}`
  - `generation_job_id`: `{{generation_job_id}}`
  - `platform`: `LinkedIn`
  - `post_type`: `single`
  - `hook`: `{{item.hook}}`
  - `post_content`: `{{item.post_content}}`
  - `hashtags`: `{{item.hashtags}}`
  - `brand_profile_id`: `{{brand_profile_id}}` (as link field)
  - `status`: `Needs Approval`
  - `thread_group_id`: empty
  - `thread_index`: empty
  - `visual_brief`: empty
- **After create:** append new record id to `record_ids`; set `linkedin_created = linkedin_created + 1`

---

## Route 2: X

### 3a. OpenAI Chat (X)
**Model:** `gpt-4`
**System prompt:**
```
You are CRISP Content Engine. Write X-native tweets using the brand voice and X algorithm insights provided.
CRITICAL: Each tweet must be <=280 characters.
Output ONLY valid JSON matching the schema exactly.
```

**User prompt:**
```
Brand: {{brand_voice_context.client_name}}
Voice: {{brand_voice_context.voice_rules}}
Strategy: {{strategy_summary}}

X Algorithm Digest ({{x_algo_digest.version}}):
{{x_algo_digest.bullets}} (iterate and list)

Do:
{{x_algo_digest.guardrails.do}} (iterate and list)

Don't:
{{x_algo_digest.guardrails.dont}} (iterate and list)

Generate exactly {{count}} X posts. Singles only (no threads). Each tweet must be <=280 characters.
Assign each item a content_item_key from this list in order: {{keys}}

Output schema (strict JSON):
{
  "items": [
    {
      "content_item_key": "uuid:X:1",
      "platform": "X",
      "post_type": "single",
      "hook": "First 20 chars of tweet",
      "post_content": "Full tweet (<=280 chars)",
      "hashtags": ""
    }
  ]
}
```

**Response format:** JSON

### 3b. JSON Parse (X)
- Parse OpenAI response
- Extract `items[]`

### 3c. Iterator: Loop X Items
- Input array: `items[]`

### 3d. X Validator
- Check: `LEN(item.post_content) <= 280`
- Check: No LinkedIn-style patterns (regex check for "I'm excited to announce", "Here's what I learned", etc.)
- If validation fails: route to rewrite module
- If validation passes: route to idempotency check

### 3e. X Auto-Rewrite (if validation failed)
**OpenAI Chat:**
**System prompt:**
```
Rewrite this tweet to fix validation errors.
MUST be <=280 characters.
Remove LinkedIn-style formal language.
Keep the core message.
Output ONLY the rewritten tweet text.
```

**User prompt:**
```
Original tweet:
{{item.post_content}}

Validation errors:
- Over 280 characters
- Contains LinkedIn-style language

Rewrite to fix these issues.
```

**Response:** Plain text

### 3f. Re-validate Rewritten Tweet
- Check: `LEN(rewritten_text) <= 280`
- If still invalid: set `status="Needs Copy"`
- If valid: set `status="Needs Approval"`

### 3g. Idempotency Check (X)
- Check: `existing_keys` contains `{{item.content_item_key}}`
- If yes: skip create
- If no: create record

### 3h. Airtable Create Record (X)
- Table: ContentQueue
- Fields:
  - `content_item_key`: `{{item.content_item_key}}`
  - `generation_job_id`: `{{generation_job_id}}`
  - `platform`: `X`
  - `post_type`: `single` (always single in V1)
  - `hook`: `{{item.hook}}`
  - `post_content`: `{{item.post_content}}` (or rewritten text if rewrite occurred)
  - `hashtags`: `{{item.hashtags}}`
  - `brand_profile_id`: `{{brand_profile_id}}`
  - `status`: `{{validation_status}}` (Needs Approval or Needs Copy)
  - `thread_group_id`: empty
  - `thread_index`: empty
  - `visual_brief`: empty
- **After create:** append new record id to `record_ids`; set `x_created = x_created + 1`

---

## Route 3: Instagram

### 3a. OpenAI Chat (Instagram)
**Model:** `gpt-4`
**System prompt:**
```
You are CRISP Content Engine. Write Instagram-native captions using the brand voice provided.
Captions should be visual-led with short paragraphs.
Output ONLY valid JSON matching the schema exactly.
```

**User prompt:**
```
Brand: {{brand_voice_context.client_name}}
Audience: {{brand_voice_context.audience}}
Voice: {{brand_voice_context.voice_rules}}
Strategy: {{strategy_summary}}

Generate exactly {{count}} Instagram captions.
Assign each item a content_item_key from this list in order: {{keys}}

Output schema (strict JSON):
{
  "items": [
    {
      "content_item_key": "uuid:Instagram:1",
      "platform": "Instagram",
      "post_type": "caption",
      "hook": "First line of caption",
      "post_content": "Full caption with short paragraphs",
      "hashtags": "#hashtag1 #hashtag2 (5-15 total)",
      "visual_brief": "Optional: Scene description, composition, on-image text suggestion"
    }
  ]
}
```

### 3b-3e. JSON Parse → Iterator → Idempotency Check → Create
- Same pattern as LinkedIn: use `item.content_item_key`; check `existing_keys`; after create append to `record_ids` and set `instagram_created = instagram_created + 1`

---

## Route 4: Facebook

- **Same as Instagram route** (shared Meta pipeline)
- Prompt: use `{{keys}}` for content_item_key in order; schema includes `content_item_key` per item
- Airtable: `platform` = `Facebook`; idempotency via `existing_keys`; after create append to `record_ids` and set `facebook_created = facebook_created + 1`
- Reduce hashtag count (0–5) in prompt

---

## Route 5: Blog

### 3a. OpenAI Chat (Blog)
**System prompt:**
```
You are CRISP Content Engine. Write long-form blog posts using the brand voice provided.
Output ONLY valid JSON matching the schema exactly.
```

**User prompt:**
```
Brand: {{brand_voice_context.client_name}}
Audience: {{brand_voice_context.audience}}
Strategy: {{strategy_summary}}

Generate exactly {{count}} blog posts (300-1000 words each).
Assign each item a content_item_key from this list in order: {{keys}}

Output schema (strict JSON):
{
  "items": [
    {
      "content_item_key": "uuid:Blog:1",
      "platform": "Blog",
      "post_type": "single",
      "hook": "Blog post title",
      "post_content": "Full blog post content (markdown ok)",
      "hashtags": ""
    }
  ]
}
```

### 3b-3e. JSON Parse → Iterator → Idempotency Check → Create
- Same pattern as LinkedIn: use `item.content_item_key`; check `existing_keys`; after create append to `record_ids` and set `blog_created = blog_created + 1`

---

## 5. Completion Callback (Use Variables From Routes)

No separate aggregator step. Each route already appends the new record id to `record_ids` and increments the platform counter after every Airtable create. Use those variables in the callback.

---

## 6. Per-Route Progress Callback (After Each Route Completes)

**IMPORTANT:** Each route (LinkedIn, X, Instagram, Facebook, Blog) should call the progress endpoint **after** it finishes creating records, **before** the final completion callback.

**Endpoint:** `POST https://app.crispdigital.io/api/content/generation/progress`

**Headers:**
- Content-Type: application/json
- x-make-secret: {{env.MAKE_SHARED_SECRET}}

**Body (example for LinkedIn route):**
```json
{
  "generation_job_id": "{{generation_job_id}}",
  "platform": "LinkedIn",
  "route_status": "completed",
  "created_count": {{linkedin_created}},
  "record_ids": {{linkedin_record_ids}},
  "skipped_count": 0,
  "errors": []
}
```

**Notes:**
- `route_status`: `"completed"` or `"failed"`
- `record_ids`: array of Airtable record IDs created by this route
- Call this at the **end of each route** (LinkedIn, X, Instagram, Facebook, Blog)
- The server uses this to track progress and determine when all routes are done

---

## 7. Final Completion Callback (Optional, for Backward Compatibility)

**Endpoint:** `POST https://app.crispdigital.io/api/content/generation/complete`

**Headers:**
- Content-Type: application/json
- x-make-secret: {{env.MAKE_SHARED_SECRET}}

**Body:**
```json
{
  "generation_job_id": "{{generation_job_id}}",
  "created": {
    "LinkedIn": {{linkedin_created}},
    "X": {{x_created}},
    "Instagram": {{instagram_created}},
    "Facebook": {{facebook_created}},
    "Blog": {{blog_created}}
  },
  "record_ids": {{record_ids}}
}
```

**Note:** With the new progress tracking (step 6), this final callback is optional. The job completion is determined by the per-route progress callbacks. However, you can keep this for backward compatibility or as a final summary.

---

## Environment Variables (Make.com)

Required in Make scenario:
- `MAKE_SHARED_SECRET` (for completion callback auth)
- `OPENAI_API_KEY` (for OpenAI Chat modules)
- `AIRTABLE_PAT` (for Airtable operations)
- `AIRTABLE_BASE_ID`
- `AIRTABLE_CONTENTQUEUE_TABLE`

---

## Error Handling

- If OpenAI fails: log error, skip that channel, continue others
- If Airtable create fails: log error, mark job as partially complete
- If validation fails and rewrite fails: create record with `status="Needs Copy"`
- Always call completion callback (even if partial failure)

---

## Testing

1. **Test with single channel:**
   ```json
   {
     "generation_job_id": "test-123",
     "channels": [{"platform": "LinkedIn", "count": 1, "keys": ["test-123:LinkedIn:1"]}],
     ...
   }
   ```

2. **Test idempotency:**
   - Run same payload twice
   - Second run should skip all creates (records already exist)

3. **Test X validation + rewrite:**
   - Generate X content
   - Verify tweets >280 get rewritten
   - Verify LinkedIn-style tweets get rewritten
   - Verify failed rewrites get `status="Needs Copy"`

4. **Test completion callback:**
   - Verify callback is called with correct counts
   - Verify usage is incremented only once (idempotent)

---

## Notes

- **Idempotency**: Search Airtable once by `generation_job_id` to get `existing_keys`. For each item, if `item.content_item_key` is in `existing_keys`, skip create. No per-item Airtable search.
- **Keys**: Each item’s `content_item_key` comes from the prompt/schema (app provides `keys[]`; AI assigns them in order). Airtable write uses `item.content_item_key`—no index-based mapping.
- **X (V1)**: Singles only. No threads in default multi-channel run; `post_type` = single, `thread_group_id` and `thread_index` empty. Threads can be a separate generator option later.
- **Export-only**: Blog posts are export-only (no scheduling/publishing in V1).
- **Character count**: Airtable formula `LEN({post_content})` auto-populates this field.
