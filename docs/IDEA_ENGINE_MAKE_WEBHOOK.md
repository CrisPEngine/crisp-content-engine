# Idea Engine – Make.com webhook contract

Use this to wire the Make scenario that receives the Idea Engine run and calls back with generated items.

**Webhook URL (env):** `MAKE_IDEA_ENGINE_SERIES_WEBHOOK_URL`

Set in your environment (e.g. Vercel / `.env.local`) to your Make webhook URL, for example:
`https://hook.eu2.make.com/5wpmpho96i8zk4gyc4ikkelqiw9ctrc6`

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
- Quota shrinking may reduce counts further; Make should only be called with counts > 0.

---

## 1. Payload sent by the app → Make (POST to `MAKE_IDEA_ENGINE_SERIES_WEBHOOK_URL`)

The app sends a single JSON body. All fields are present every time unless noted.

| Field | Type | Description |
|-------|------|-------------|
| `series_run_id` | string (UUID) | Unique run id; use this when calling the callback. |
| `run_id` | string (UUID) | Internal DB run id. |
| `user_id` | string (UUID) | Supabase auth user id. |
| `plan` | string | `"creator"` \| `"growth"` \| `"pro"` \| `"scale"`. |
| `brand_profile_id` | string | Airtable BrandProfiles record id. |
| `idea` | string | User's idea (10–2000 chars). |
| `goal` | string \| null | `"Awareness"` \| `"Engagement"` \| `"Traffic"` \| `"Conversion"` or null. |
| `notes` | string \| null | Optional notes. |
| `selected_channels` | string[] | Only channels with count > 0, e.g. `["LinkedIn", "X", "Blog"]`. |
| `publish_mode` | string | Always `"queue_only"` (publish mode simplified). |
| `requested_counts` | Record<string, number> | **Exact per-channel counts Make must generate.** Keys match `selected_channels`. No zeros included. |
| `quota_remaining_by_channel` | Record<string, number> | Remaining quota per pool (`linkedin`, `x`, `blog`, `meta_pool`) for context. |
| `dropped_channels` | string[] | Channels that resolved to 0 (unsupported by plan or quota exhausted). Informational only. |
| `autopublish_capabilities` | Record<string, boolean> | Per-channel autopublish flags. |
| `timezone` | string | Brand profile timezone (e.g. `"Europe/London"`) or `"UTC"` if missing. |
| `posting_windows` | unknown \| null | Brand profile posting windows or null. |
| `brand_context` | object | Full Airtable BrandProfiles fields (voice, audience, strategy, etc.). |
| `callback_url` | string | URL to POST results to: `{APP_URL}/api/idea-engine/webhook/callback`. |

**Example (Growth plan, full channels):**

```json
{
  "series_run_id": "550e8400-e29b-41d4-a716-446655440000",
  "run_id": "660e8400-e29b-41d4-a716-446655440001",
  "user_id": "770e8400-e29b-41d4-a716-446655440002",
  "plan": "growth",
  "brand_profile_id": "recXXXXXXXXXXXXXX",
  "idea": "Why founders struggle with content consistency and how systems solve it.",
  "goal": "Engagement",
  "notes": null,
  "selected_channels": ["LinkedIn", "X", "Blog", "Facebook", "Instagram"],
  "publish_mode": "queue_only",
  "requested_counts": { "LinkedIn": 2, "X": 4, "Blog": 1, "Facebook": 1, "Instagram": 1 },
  "quota_remaining_by_channel": { "linkedin": 10, "x": 8, "blog": 2, "meta_pool": 5 },
  "dropped_channels": [],
  "autopublish_capabilities": { "linkedin": true, "instagram": true, "facebook": true, "x": false, "blog": false },
  "timezone": "Europe/London",
  "posting_windows": null,
  "brand_context": { "client_name": "Acme", "timezone": "Europe/London" },
  "callback_url": "https://app.crispdigital.io/api/idea-engine/webhook/callback"
}
```

---

## 2. Callback payload: Make → app (POST to `callback_url`)

Make must POST JSON to the `callback_url` with either a list of items or an error.

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
| `series_position` | number (int) | No | 1-based index in the series. |
| `series_total` | number (int) | No | Total items in the series. |

**Failure (Make reports error):**

| Field | Type | Description |
|-------|------|-------------|
| `series_run_id` | string (UUID) | Must match the run. |
| `error` | string | Error message; run is marked failed. |
| `items` | array | Must still be present (even as `[]`). |

---

## 3. Image prompt schemas by channel

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

The app accepts either schema in the `image_prompt` field. The review UI and queue display will render whichever object is returned without breaking.

---

## 4. Timezone and posting windows

- The app sends top-level `timezone` (Brand Profile timezone or `"UTC"`) and `posting_windows` (from Brand Profile or `null`).
- Both are also inside `brand_context`.
- When the user confirms items, the app loads the Brand Profile and uses these for schedule staggering (LinkedIn 9am, Meta 10am in the brand timezone, or UTC if missing).

---

## 5. Quota-aware counts

`requested_counts` is pre-calculated by the app using:

```
actual = min(plan_default, quota_remaining)
```

Channels with `actual = 0` are dropped before Make is called. The run only fails if **all** selected channels resolve to zero. Make will never receive a channel with count 0.

This means `requested_counts` may be **smaller** than the plan default table above when a user is near their monthly limit. Make should generate exactly what `requested_counts` specifies.

---

## 6. Regenerate single item (optional)

For "regenerate one item" the app calls the **same** `MAKE_IDEA_ENGINE_SERIES_WEBHOOK_URL` with an extra `action: "regenerate_single"` and item/run context. Make then updates that item and calls the item-update webhook. See the regenerate route and `webhook/item-update` for the exact shape when implementing this.
