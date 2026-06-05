# Idea Engine — automation webhook contract (legacy Make)

> **Deprecated** when `IDEA_ENGINE_NATIVE_ENABLED=true`. See **[IDEA_ENGINE_NATIVE.md](./IDEA_ENGINE_NATIVE.md)** for the in-app generator.

**Audience:** Operators wiring the external automation that receives Idea Engine runs and returns generated content. **Not** for end users—see **[USER_GUIDE.md](./USER_GUIDE.md)** for how customers use Idea Engine in the app.

**Webhook URL (environment variable):** `MAKE_IDEA_ENGINE_SERIES_WEBHOOK_URL`

Set this in your deployment configuration to your automation platform’s inbound webhook URL.

**End-user experience** (progressive UI, review, queue) is described in [USER_GUIDE.md](./USER_GUIDE.md).

---

## How progressive generation works

The application creates **placeholder records** for each expected item immediately when a run starts (channel + position).

The run status endpoint `GET /api/idea-engine/run/:id` returns:
- All placeholders (status `generating`) and any filled items (status `ready`)
- Progress fields: `expected_total_items`, `generated_items_count`, `expected_counts_by_channel`, `generated_counts_by_channel`

This enables the in-app workspace to show placeholder cards immediately and replace them as your automation returns content.

When the automation calls back with generated items, the callback **updates** existing placeholders (it does not create duplicate rows), matching by `run_id` + `channel` + `series_position`.

---

## Plan output sizes (maximum, before quota shrinking)

These are the default counts the app sends in `requested_counts`. Quota shrinking may reduce them further (see section 5).

| Plan | LinkedIn | X | Blog | Facebook | Instagram | **Total max** |
|------|----------|---|------|----------|-----------|---------------|
| Creator | 2 | 3 | 1 | 0 | 0 | **6** |
| Growth | 2 | 4 | 1 | 1 | 1 | **9** |
| Pro | 3 | 5 | 1 | 1 | 1 | **11** |
| Scale | 3 | 5 | 1 | 1 | 1 | **11** |

- Starter is locked. No Idea Engine access.
- Creator cannot access Facebook or Instagram channels (they resolve to 0).
- Quota shrinking may reduce counts further; only trigger generation when counts are greater than zero.

---

## 1. Payload sent by the app → automation (POST to `MAKE_IDEA_ENGINE_SERIES_WEBHOOK_URL`)

This is the **dedicated Idea Engine contract**. It does not reuse or extend the standard content-generation payload. Fields like `monthly_brief`, `channels[]`, `generation_job_id`, `strategy_json` (top-level), `brand_voice_context` and `scheduling_context` are **not sent** — they belong to the legacy generation flow.

Note: `strategy_json` is accessible inside `brand_context` as a nested key (from the stored brand profile), but it is not promoted to the top level.

All fields below are present in every Idea Engine webhook call.

| Field | Type | Description |
|-------|------|-------------|
| `series_run_id` | string (UUID) | Unique run id. Use this when calling back. |
| `run_id` | string (UUID) | Internal run id. |
| `user_id` | string (UUID) | Signed-in account id for the run. |
| `plan` | string | `"creator"` \| `"growth"` \| `"pro"` \| `"scale"`. |
| `brand_profile_id` | string | Brand profile record id. |
| `idea` | string | The user's raw idea text (10–2000 chars). Verbatim from the UI. |
| `goal` | string \| null | `"Awareness"` \| `"Engagement"` \| `"Traffic"` \| `"Conversion"` or null. |
| `notes` | string \| null | Optional user notes on the idea. Verbatim from the UI. |
| `selected_channels` | string[] | **Only channels with count > 0** after quota resolution. No zero-count channels included. |
| `publish_mode` | string | Always `"queue_only"`. Items go to queue as drafts. |
| `requested_counts` | Record<string, number> | **Exact per-channel counts to generate.** Keys match `selected_channels`. Computed as `min(plan_default, quota_remaining)`. |
| `quota_remaining_by_channel` | Record<string, number> | Remaining quota per pool (`linkedin`, `x`, `blog`, `meta_pool`). Informational. |
| `autopublish_capabilities` | Record<string, boolean> | Per-channel autopublish flags (`linkedin`, `instagram`, `facebook`, `x`, `blog`). |
| `timezone` | string | Brand profile timezone (e.g. `"Asia/Dubai"`) or `"UTC"` if missing. |
| `posting_windows` | unknown \| null | Brand profile posting windows or null. |
| `brand_context` | object | Structured brand profile and strategy context (e.g. `client_name`, `voice_rules`, `audience`, `value_props`, `offers`, `brand_palette`, `strategy_json`, `brand_goals`, `content_rules`, `language_region`, etc.). |
| `previous_content_json` | array | Up to 30 recent published/approved/scheduled content items for this brand. Use for deduplication. Empty array if unavailable — generation is safe without it. |
| `callback_url` | string | URL to POST results to. Environment-specific base URL + `/api/idea-engine/webhook/callback`. |

**Complete example (Growth plan):**

```json
{
  "series_run_id": "550e8400-e29b-41d4-a716-446655440000",
  "run_id": "660e8400-e29b-41d4-a716-446655440001",
  "user_id": "770e8400-e29b-41d4-a716-446655440002",
  "plan": "growth",
  "brand_profile_id": "recXXXXXXXXXXXXXX",
  "idea": "Why founders struggle with content consistency and how systems solve it.",
  "goal": "Engagement",
  "notes": "Include angles: batching, systems, automation.",
  "selected_channels": ["LinkedIn", "X", "Blog", "Facebook", "Instagram"],
  "publish_mode": "queue_only",
  "requested_counts": { "LinkedIn": 2, "X": 4, "Blog": 1, "Facebook": 1, "Instagram": 1 },
  "quota_remaining_by_channel": { "linkedin": 10, "x": 8, "blog": 2, "meta_pool": 5 },
  "autopublish_capabilities": { "linkedin": true, "instagram": true, "facebook": true, "x": false, "blog": false },
  "timezone": "Asia/Dubai",
  "posting_windows": null,
  "brand_context": {
    "client_name": "CrisP Digital",
    "timezone": "Asia/Dubai",
    "voice_rules": "...",
    "audience": "...",
    "value_props": "...",
    "offers": "...",
    "brand_palette": "...",
    "strategy_json": "{ ... }",
    "brand_goals": "...",
    "content_rules": "No em dash, no oxford comma",
    "language_region": "AU English",
    "brand_type": "company"
  },
  "previous_content_json": [
    { "Post Title": "Why consistency beats creativity", "Post Content": "...", "Platform": "LinkedIn", "Status": "Published" }
  ],
  "callback_url": "https://app.crispdigital.io/api/idea-engine/webhook/callback"
}
```

---

## 2. Callback payload: automation → app (POST to `callback_url`)

Your automation must POST JSON to the `callback_url` with either a list of items or an error.

**How callback updates work:**

The callback **updates existing placeholder rows**, not inserts. Matching strategy:
1. If `series_position` is provided: match by `run_id` + `channel` + `series_position`.
2. Otherwise: fill the next available `generating` placeholder for that channel in order.

Your automation can send `series_position` explicitly (recommended) or omit it and let the app fill placeholders sequentially.

**Success:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `series_run_id` | string (UUID) | Yes | Must match the run's `series_run_id` from the trigger payload. |
| `items` | array | Yes | At least one item; see item shape below. |
| `error` | string | No | Omit on success. |

**Item shape (each element of `items`):**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `channel` | string | Yes | `"LinkedIn"` \| `"X"` \| `"Blog"` \| `"Instagram"` \| `"Facebook"`. |
| `post_title` | string | No | Hook/title line. |
| `body_draft` | string | No | Full post body. |
| `image_prompt` | object | No | See image prompt schema below (rich or simple depending on channel). |
| `hashtags` | string | No | Hashtags string. |
| `series_position` | number (int) | **Recommended** | 1-based index. If omitted, app fills placeholders in order. |
| `series_total` | number (int) | No | Total items in the series. |

**Failure (automation reports error):**

| Field | Type | Description |
|-------|------|-------------|
| `series_run_id` | string (UUID) | Must match the run. |
| `error` | string | Error message; run is marked failed. |
| `items` | array | Must be present and may be empty (`[]`). |

**Failure example:**

```json
{
  "series_run_id": "550e8400-e29b-41d4-a716-446655440000",
  "items": [],
  "error": "OpenAI module failed"
}
```

---

## 3. Run polling response (enhanced for live generation)

`GET /api/idea-engine/run/:id` returns placeholders + filled items immediately, enabling progressive reveal in the UI.

**Response fields:**

| Field | Type | Description |
|-------|------|-------------|
| `run` | object | Run metadata: id, status, total_expected, total_generated, error, etc. |
| `items` | array | All placeholder + filled items, sorted by channel then series_position. |
| `expected_total_items` | number | Total items expected (from run.total_expected). |
| `generated_items_count` | number | Count of items with body_draft or status='ready'. |
| `expected_counts_by_channel` | object | Channel → expected count map (derived from placeholder rows). |
| `generated_counts_by_channel` | object | Channel → ready count map (derived from filled rows). |

**Item status field:**
- `generating`: Placeholder waiting to be filled.
- `ready`: Content has been filled by the callback from your automation.

The application polls this endpoint and renders:
- Placeholder cards for `generating` items.
- Actual content cards for `ready` items.

---

## 4. Image prompt schemas by channel

To reduce token cost and generation complexity, two image prompt schemas are used depending on channel.

### Rich image prompt — LinkedIn, Instagram, Facebook

Use for channels where strong, platform-aware imagery is critical.

```json
{
  "objective": {
    "primary_intent": "",
    "content_idea_supported": "",
    "platform_context": "",
    "scroll_trigger": "",
    "success_criteria": ""
  },
  "concept": {
    "core_metaphor": "",
    "storybeat": "",
    "symbolism_notes": "",
    "originality_constraint": ""
  },
  "subject_and_scene": {
    "subject": "",
    "environment": "",
    "time_of_day": "",
    "era_or_setting": "",
    "scene_description": ""
  },
  "composition_and_camera": {
    "framing": "",
    "camera_angle": "",
    "lens_or_focal_style": "",
    "depth_of_field": "",
    "layout_geometry": "",
    "focal_point": "",
    "foreground_midground_background": ""
  },
  "visual_elements": {
    "key_objects": [],
    "supporting_objects": [],
    "materials_and_textures": [],
    "motion_or_energy": "",
    "ui_or_graphics": {
      "included": false,
      "description": "",
      "readability_rules": ""
    }
  },
  "style": {
    "style_and_medium": "",
    "reference_class": "",
    "level_of_realism": "",
    "render_quality": "",
    "brand_fit_notes": ""
  },
  "colour_and_lighting": {
    "palette": "",
    "contrast_level": "",
    "lighting_setup": "",
    "light_direction": "",
    "highlight_focus": "",
    "colour_avoid": ""
  },
  "typography": {
    "include_text": false,
    "text_content": "",
    "font_style": "",
    "placement": "",
    "legibility_rules": ""
  },
  "platform_output": {
    "aspect_ratio": "",
    "safe_margins_px": "",
    "crop_risk_notes": ""
  },
  "negative_prompt": {
    "hard_exclusions": [],
    "soft_avoidances": [],
    "cliche_blacklist": []
  }
}
```

### Simple image prompt — X, Blog

Use for channels where image use is optional or secondary. Keeps token usage low.

```json
{
  "intent": "",
  "scene": "",
  "composition": "",
  "style": "",
  "lighting": "",
  "avoid": ""
}
```

The application accepts either schema in the `image_prompt` field. Review and queue views render whichever object is returned.

---

## 5. Timezone and posting windows

- The app sends top-level `timezone` (Brand Profile timezone or `"UTC"`) and `posting_windows` (from Brand Profile or `null`).
- Both are also inside `brand_context`.
- When the user confirms items, the app loads the Brand Profile and uses these for schedule staggering (LinkedIn 9am, Meta 10am in the brand timezone, or UTC if missing).

---

## 6. Quota-aware counts

`requested_counts` is pre-calculated by the app using:

```
actual = min(plan_default, quota_remaining)
```

Channels with `actual = 0` are dropped before the automation is triggered — they will not appear in `selected_channels` or `requested_counts`. The run only fails if **all** selected channels resolve to zero. The automation will never receive a channel with a zero count.

`requested_counts` may therefore be **smaller** than the plan default table above when a user is near their monthly limit. Generate **exactly** what `requested_counts` specifies — no more, no fewer.

`requested_counts` and the in-app preview use the same computation, so what the preview shows is exactly what the webhook payload contains.

---

## 7. Regenerate single item (optional)

For “regenerate one item” the application calls the **same** `MAKE_IDEA_ENGINE_SERIES_WEBHOOK_URL` with an extra `action: "regenerate_single"` and item/run context. The automation then updates that item and calls the item-update webhook. See the regenerate route and `webhook/item-update` in the codebase for the exact shape when implementing this.
