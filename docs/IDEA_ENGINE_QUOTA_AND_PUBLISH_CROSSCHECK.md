# Idea Engine: Quota integrity and publish mode (internal reference)

**Audience:** Engineering, operations, and support who need **API-level** detail. **Not** for customers—see **[USER_GUIDE.md](./USER_GUIDE.md)** for how limits and workflows are experienced in the product.

This document predates some UX and reservation-model refinements; treat behaviour described here as directional and confirm in code for audits.

---

## 1. Quota handling

### Does deleting an Idea Engine draft item release its consumed quota?

**Yes.** As of the latest changes:

- **DELETE** `/api/idea-engine/items/[itemId]` looks up the item’s `channel`, then calls `decrementChannelUsage(userId, channel, 1)` before deleting the row.
- Only items that are not yet `queued` can be deleted; once queued, the item is in Airtable and quota is not reversed.

So deleting a draft item in the Series Review step **releases one unit of quota** for that channel (LinkedIn, X, blog, or meta_pool for Instagram/Facebook).

---

### Does cancelling an Idea Engine run release consumed quota?

**Yes, when the run is in `review`.**

- If the run is still **`generating`**: Make has not called the callback yet, so **no quota was consumed**; cancelling just marks the run `cancelled`. Nothing to release.
- If the run is **`review`**: Quota was consumed when Make called the callback. **DELETE** `/api/idea-engine/run/[runId]` now:
  - Loads all `idea_engine_items` for that run (excluding already `queued`),
  - Decrements channel usage for each item (linkedin, x, blog, or meta_pool),
  - Then sets the run to `cancelled`.

So cancelling a run after items have been generated **releases quota** for all draft items in that run. The Creator “series run” counter (`idea_engine_runs_used`) is **not** decremented on cancel (the run slot was still used).

---

### Does regenerating an item consume quota again, or replace the original item cleanly?

**Replace in place — no extra quota.**

- **POST** `/api/idea-engine/items/[itemId]/regenerate` only triggers Make with `action: 'regenerate_single'`.
- **POST** `/api/idea-engine/webhook/item-update` only updates the existing `idea_engine_items` row (title, body, image_prompt, hashtags) and sets `status: 'pending'`.
- Neither endpoint calls `incrementChannelUsage`. Regeneration reuses the quota already consumed for that item when the series was first generated.

---

### Are Idea Engine items protected from double counting when they go through the normal approval flow for LinkedIn and Meta?

**Yes.** Approval-time quota is skipped for Idea Engine items:

- In **PATCH** `/api/content/queue/[contentId]` (approve action), the code checks:
  - `record.fields?.generated_from === 'idea_engine'` **or**
  - `record.fields?.series_type === 'idea_engine'`.
- If either is true for LinkedIn or Meta:
  - The **limit** is still enforced (user cannot approve if over cap).
  - **No** `incrementChannelUsage` is called for that approval, because quota was already consumed at Idea Engine generation (webhook/callback).

So Idea Engine items are **not** counted again at approval; they are protected from double counting as long as Airtable has `generated_from` or `series_type` set (see Airtable section below).

---

### If Make returns a partial result, do we only consume quota for successfully returned items?

**Yes.**

- **POST** `/api/idea-engine/webhook/callback` receives a single `items` array from Make.
- It inserts exactly those records into `idea_engine_items` and then runs:
  - `channelCounts[channel] += 1` for each item in `items`,
  - `incrementChannelUsage(userId, channel, count)` for each channel.
- There is no separate “expected” total; only the items in the callback payload are inserted and counted. Partial results = quota consumed only for the items actually returned.

---

## 2. Publish mode behaviour

### Is “queue only” fully implemented?

**Yes.**

- On confirm, items are written to Airtable ContentQueue with `status: 'Draft'`.
- No `scheduled_time` is set; no auto-approval. They sit in the queue until the user approves/schedules them in the normal flow.

---

### Is “approve and schedule” fully implemented?

**No.** Not in the app.

- `publish_mode` is sent to Make in the run payload, but the **confirm** route does **not**:
  - set `scheduled_time` on Airtable records,
  - set status to “Ready To Publish”,
  - or stagger times by channel.
- So “approve and schedule” is **not** implemented in the app. To support it you would need either:
  - Make to return per-item `scheduled_time` and the app to write those into Airtable on confirm, or
  - A post-confirm job (or Make step) that assigns staggered `scheduled_time` and optionally status based on `publish_mode` and posting windows.

---

### Is “approve first item immediately” fully implemented so it goes live on the next cron cycle?

**No.**

- There is no logic that:
  - marks the “first” item as approved (Ready To Publish) and sets `scheduled_time` to “now” or next cron window, or
  - triggers immediate publish for one item.
- The UI only offers “Queue only” and “Approve & schedule”; “approve first item immediately” is not implemented.

---

### Are scheduled items staggered by channel?

**No.** Not in the app.

- Confirm writes all items with no `scheduled_time`. Staggering (e.g. LinkedIn every 2–3 days, Meta every 2–3 days) would require:
  - either the confirm route to compute and set `scheduled_time` per record from run metadata and channel,
  - or Make / another process to do it after records are created.

---

### Are posting windows respected if available?

**No.** Not in the app.

- Posting windows (e.g. from brand/profile settings) are not read in the Idea Engine confirm flow. No logic assigns `scheduled_time` within user-defined windows. That would require integration with wherever “posting windows” are stored and a scheduling step that sets times accordingly.

---

## 3. Airtable requirements

Exact **ContentQueue** fields to add or confirm for Idea Engine support:

| Field name (API)   | Type   | Purpose |
|--------------------|--------|--------|
| `generated_from`   | Single line text (or Single select: e.g. `idea_engine`, `multi_channel`) | Source of the post; app sets `idea_engine` for Idea Engine items. **Required** for approval double-count protection. |
| `series_id`        | Single line text (or formula) | UUID of the series run; same as `series_run_id`. Optional for grouping/filtering. |
| `series_run_id`    | Single line text | UUID of the series run. Optional. |
| `series_title`     | Long text | Short title for the series (e.g. truncated idea). Optional. |
| `series_type`      | Single line text (or Single select: `idea_engine`) | Type of series. **Required** for approval double-count protection if you prefer not to use `generated_from`. |
| `series_position`  | Number | 1-based index of this item in the series. Optional. |
| `series_total`     | Number | Total items in the series. Optional. |
| `source_idea`      | Long text | Original idea text. Optional. |

**Minimum for quota correctness:**  
At least one of **`generated_from`** or **`series_type`** must exist and be set to `idea_engine` (or equivalent) so that the approval route can skip LinkedIn/Meta increment. The app writes both when creating records; if Airtable rejects unknown fields, it retries without the optional series fields but **must** keep a way to identify Idea Engine (e.g. keep `generated_from` as the minimal field).

**Existing ContentQueue fields** used by Idea Engine confirm (no change needed):  
`hook`, `post_content`, `platform`, `status`, `image_prompt`, `hashtags`, `brand_profile_id`.

---

## 4. Final completion checklist

### Remaining to-do list

- [ ] **Publish mode “approve and schedule”**: Implement setting `scheduled_time` (and optionally status) on confirm, with optional staggering by channel and/or posting windows.
- [ ] **Publish mode “approve first item immediately”**: Implement logic to mark one item as ready and set it for the next cron cycle (or trigger publish).
- [ ] **Posting windows**: Integrate with brand/profile posting windows when setting `scheduled_time` for Idea Engine items (if/when “approve and schedule” is implemented).
- [ ] **Make scenario**: Implement and connect the Make scenario that:
  - Accepts the Idea Engine payload (including `publish_mode`),
  - Returns `items[]` with `channel`, `post_title`, `body_draft`, `image_prompt`, `hashtags`, `series_position`, `series_total`,
  - Optionally returns per-item `scheduled_time` if you implement “approve and schedule” in the app.
- [ ] **Regenerate single item**: Make must support `action: 'regenerate_single'` and call `/api/idea-engine/webhook/item-update` with the updated item.
- [ ] **Airtable**: Add the fields above to ContentQueue (at least `generated_from` or `series_type` for quota protection).
- [ ] **Env**: Set `MAKE_IDEA_ENGINE_SERIES_WEBHOOK_URL` (and ensure Make can call the callback and item-update webhooks with the expected auth).

---

### Completed list

- [x] Idea Engine UI (input → preview → generating → review → done).
- [x] Series preview with per-channel counts and quota remaining.
- [x] Series review screen: edit, delete, regenerate per item; “Add to queue” / “Cancel series”.
- [x] Regenerate single item (API + webhook item-update); no extra quota.
- [x] Quota enforcement: preflight in run creation; consumption in webhook/callback; partial result = only returned items counted.
- [x] Creator series run limit (3/month) and increment on run creation.
- [x] Double-count protection: approval route skips LinkedIn/Meta increment when `generated_from` or `series_type` is Idea Engine.
- [x] Releasing quota: delete draft item → decrement that channel; cancel run in `review` → decrement all draft items in that run.
- [x] Series metadata written to Airtable on confirm (with fallback if fields are missing).
- [x] Queue integration: confirm writes to ContentQueue with `generated_from`, series fields, and core fields.
- [x] Rate limiting: 1 run per minute per user.
- [x] Duplicate idea warning (10 min) with option to force.
- [x] Upgrade prompts: Starter locked; Creator limit reached; Meta channels on Creator.
- [x] Progress UI during generation and polling.
- [x] Dashboard quick action and Content Actions “Idea Engine” / “Launch Idea Engine” (and locked state for Starter).

---

### Known limitations

- **Publish modes** “approve and schedule” and “approve first item immediately” are not implemented; only “queue only” is fully implemented.
- **Staggering and posting windows** are not applied in the app; all items are confirmed as drafts with no `scheduled_time`.
- **Creator run counter** is not decremented when a run is cancelled (by design; the run “slot” was used).
- **Make dependency**: Full flow depends on a Make scenario that returns the expected payload and calls the callback/item-update webhooks; without it, runs stay in `generating` or fail.
- **Airtable**: If series metadata fields are not created, the app still writes core content but grouping/filtering by series and double-count protection rely on at least `generated_from` or `series_type` being present.

---

### Production risks before shipping

1. **Airtable schema**: If **neither** `generated_from` nor `series_type` exists (or they’re not set), LinkedIn/Meta approval will **double count** Idea Engine items. Mitigation: Add at least one of these fields and ensure the app sets it on confirm (already implemented; only schema/add field in Airtable is required).
2. **Make not configured**: If `MAKE_IDEA_ENGINE_SERIES_WEBHOOK_URL` is missing or Make doesn’t call the callback, runs will fail or hang in `generating`. Mitigation: Configure the webhook and test end-to-end.
3. **Regenerate**: If Make doesn’t implement `regenerate_single` or doesn’t call `/api/idea-engine/webhook/item-update`, “Regenerate” in the UI will only set the item to `regenerating` and never update content. Mitigation: Implement and test the regenerate path in Make.
4. **Quota race**: If a user deletes an item and immediately confirms the rest, or cancels and starts a new run in the same minute, quota operations are not transactional with the rest of the flow; in edge cases, usage could be briefly inconsistent. Mitigation: Acceptable for V1; monitor and add idempotency or transactions if needed.

---

*Last updated: after quota integrity fixes (delete/cancel release quota; approval skips increment for Idea Engine; partial result = only returned items).*
