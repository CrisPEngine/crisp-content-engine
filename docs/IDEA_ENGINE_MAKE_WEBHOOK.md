# Idea Engine – Make.com webhook contract

Use this to wire the Make scenario that receives the Idea Engine run and calls back with generated items.

**Webhook URL (env):** `MAKE_IDEA_ENGINE_SERIES_WEBHOOK_URL`  
Example: `https://hook.eu2.make.com/...`

---

## 1. Payload sent by the app → Make (POST to `MAKE_IDEA_ENGINE_SERIES_WEBHOOK_URL`)

The app sends a single JSON body. All fields are present every time unless noted.

| Field | Type | Description |
|-------|------|-------------|
| `series_run_id` | string (UUID) | Unique run id; use this when calling the callback. |
| `run_id` | string (UUID) | Internal DB run id. |
| `user_id` | string (UUID) | Supabase auth user id. |
| `plan` | string | `"starter"` \| `"creator"` \| `"growth"` \| `"pro"` \| `"scale"`. |
| `brand_profile_id` | string | Airtable BrandProfiles record id. |
| `idea` | string | User’s idea (10–2000 chars). |
| `goal` | string \| null | `"Awareness"` \| `"Engagement"` \| `"Traffic"` \| `"Conversion"` or null. |
| `notes` | string \| null | Optional notes. |
| `selected_channels` | string[] | e.g. `["LinkedIn", "X", "Blog"]`. |
| `publish_mode` | string | `"queue_only"` \| `"approve_and_schedule"` \| `"approve_first_immediately"`. |
| `requested_counts` | Record<string, number> | **Exact per-channel counts Make must return.** Keys: `LinkedIn`, `X`, `Blog`, `Instagram`, `Facebook`. Same source as preview. |
| `quota_remaining_by_channel` | Record<string, number> | Remaining quota per channel (e.g. `linkedin`, `x`, `blog`, `meta_pool`) for context. |
| `autopublish_capabilities` | Record<string, boolean> | `linkedin`, `instagram`, `facebook`, `x`, `blog` → whether autopublish is allowed. |
| `timezone` | string | Brand profile timezone (e.g. `"Europe/London"`) or `"UTC"` if missing. |
| `posting_windows` | unknown \| null | Brand profile posting windows when present; null otherwise. |
| `brand_context` | object | Full Airtable BrandProfiles fields (e.g. `client_name`, `timezone`, `posting_windows`, voice, etc.). |
| `callback_url` | string | URL to POST results to: `{APP_URL}/api/idea-engine/webhook/callback`. |

**Example (minimal):**

```json
{
  "series_run_id": "550e8400-e29b-41d4-a716-446655440000",
  "run_id": "660e8400-e29b-41d4-a716-446655440001",
  "user_id": "770e8400-e29b-41d4-a716-446655440002",
  "plan": "creator",
  "brand_profile_id": "recXXXXXXXXXXXXXX",
  "idea": "Launch our new sustainability report and drive sign-ups.",
  "goal": "Traffic",
  "notes": null,
  "selected_channels": ["LinkedIn", "X", "Blog"],
  "publish_mode": "queue_only",
  "requested_counts": { "LinkedIn": 3, "X": 4, "Blog": 1 },
  "quota_remaining_by_channel": { "linkedin": 10, "x": 8, "blog": 2 },
  "autopublish_capabilities": { "linkedin": true, "instagram": false, "facebook": false, "x": false, "blog": false },
  "timezone": "Europe/London",
  "posting_windows": null,
  "brand_context": { "client_name": "Acme", "timezone": "Europe/London", ... },
  "callback_url": "https://app.example.com/api/idea-engine/webhook/callback"
}
```

---

## 2. Callback payload: Make → app (POST to `callback_url`)

Make must POST JSON to the `callback_url` with either a list of items or an error.

**Success:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `series_run_id` | string (UUID) | Yes | Must match the run’s `series_run_id` from the trigger payload. |
| `items` | array | Yes | At least one item; see item shape below. |
| `error` | string | No | Omit on success. |

**Item shape (each element of `items`):**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `channel` | string | Yes | `"LinkedIn"` \| `"X"` \| `"Blog"` \| `"Instagram"` \| `"Facebook"`. |
| `post_title` | string | No | Hook/title. |
| `body_draft` | string | No | Post body. |
| `image_prompt` | string | No | Image prompt for the asset. |
| `hashtags` | string | No | Hashtags. |
| `series_position` | number (int) | No | 1-based index in series. |
| `series_total` | number (int) | No | Total items in series. |

**Failure (Make reports error):**

| Field | Type | Description |
|-------|------|-------------|
| `series_run_id` | string (UUID) | Must match the run. |
| `error` | string | Error message; run is marked failed. |
| `items` | array | Must still be present (e.g. `[]`) for schema. |

**Example success:**

```json
{
  "series_run_id": "550e8400-e29b-41d4-a716-446655440000",
  "items": [
    {
      "channel": "LinkedIn",
      "post_title": "3 takeaways from our sustainability report",
      "body_draft": "...",
      "image_prompt": "Professional chart showing...",
      "hashtags": "#sustainability #ESG",
      "series_position": 1,
      "series_total": 8
    }
  ]
}
```

**Auth:** Send either header `x-make-secret` (value = `MAKE_SHARED_SECRET`) or `x-api-key` (value = `MAKE_API_KEY`).

---

## 3. Timezone and posting windows

- **In run payload:** The app sends top-level `timezone` (Brand Profile timezone or `"UTC"`) and `posting_windows` (from Brand Profile or `null`). Same values are also inside `brand_context`.
- **In confirm/scheduling:** When the user confirms items, the app loads the Brand Profile again and uses:
  - **Timezone:** For all scheduled times (LinkedIn/Meta stagger). If the profile has no timezone, scheduling uses UTC.
  - **Posting windows:** If present and parseable, the app uses them to choose the hour (e.g. 9 or 10) for “tomorrow at 9am” style slots; otherwise it uses defaults (LinkedIn 9, Meta 10).

So: **timezone and posting_windows are already included** in the run payload and are used for scheduling when the user confirms.

---

## 4. `requested_counts` vs preview

- **Preview:** The UI uses `IDEA_ENGINE_DEFAULTS` from `@/config/pricing` (e.g. LinkedIn 3, X 4, Blog 1, Instagram 2, Facebook 2) and the user’s selected channels to show expected counts and quota.
- **Run payload:** `requested_counts` is built from the same `IDEA_ENGINE_DEFAULTS` and the same `selected_channels`.
- So **`requested_counts` is guaranteed to match the preview.** Make should return exactly that many items per channel (or signal a controlled variation); the app reserves quota for the items actually returned and converts that reservation to usage only for items the user confirms.

---

## 5. Regenerate single item (optional)

For “regenerate one item” the app calls the **same** `MAKE_IDEA_ENGINE_SERIES_WEBHOOK_URL` with an extra `action: "regenerate_single"` and item/run context. Make then updates that item and calls the item-update webhook. See the regenerate route and `webhook/item-update` for the exact shape if you implement this.
