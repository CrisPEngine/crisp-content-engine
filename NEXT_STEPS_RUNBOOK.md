# Multi-Channel: Next Steps Runbook

**Code status:** ✅ Complete. Use this runbook to perform manual setup, then run end-to-end tests.

---

## Order of operations

Do these in order. Each step depends on the previous one for full testing.

### 1. Supabase migration (do first)

- [ ] Run the migration that creates `generation_jobs`:
  - **Command:** From project root, run your usual Supabase migration (e.g. `npx supabase db push` or apply `supabase/migrations/007_add_generation_tracking.sql` via Supabase dashboard).
  - **Verify:** Table `generation_jobs` exists with columns: `id`, `user_id`, `job_id`, `created_at`, and any RLS policies.

**Reference:** `supabase/migrations/007_add_generation_tracking.sql`

---

### 2. Airtable schema

- [ ] **ContentQueue table – add 7 fields** (see table below).
- [ ] **ContentQueue – update `platform`** single-select options to include: `LinkedIn`, `X`, `Instagram`, `Facebook`, `Blog`.
- [ ] **ContentQueue – create 7 views** (LinkedIn Approval, X Approval, Meta Approval, Blog Approval, LinkedIn Scheduled, X Scheduled, Meta Scheduled).

**Reference:** `AIRTABLE_SCHEMA_SETUP.md` and `MULTI_CHANNEL_IMPLEMENTATION.md` (exact field types and view formulas).

| Field             | Type         | Notes                          |
|-------------------|-------------|---------------------------------|
| `post_type`       | Single select | `single` (default), `thread`, `caption` |
| `thread_group_id`| Single line text |                                |
| `thread_index`    | Number      | Integer                         |
| `character_count` | Formula     | `LEN({post_content})`           |
| `visual_brief`    | Long text   |                                 |
| `generation_job_id` | Single line text | Idempotency                 |
| `content_item_key` | Single line text | Pre-generated, prevents duplicates |

---

### 3. Make.com scenario

- [ ] Rebuild the scenario to match the multi-channel flow:
  - Webhook accepts new payload with `channels[]`, `generation_job_id`, `content_item_key` per item.
  - Router for LinkedIn, X, Instagram, Facebook, Blog.
  - Per-channel prompts and output schemas.
  - X: validation + auto-rewrite for length; thread handling.
  - Idempotency: use `content_item_key` before creating Airtable records.
  - Completion HTTP request to your app: `POST /api/content/generation/complete` with counts and `generation_job_id`.

**Reference:** `MAKE_MULTI_CHANNEL_SCENARIO.md`

---

### 4. Smoke test (after 1–3 are done)

- [ ] Generate content for one channel (e.g. LinkedIn) and confirm:
  - Make webhook receives the payload.
  - Records appear in Airtable with `generation_job_id` and `content_item_key`.
  - Completion callback is called and usage increments (check `generation_jobs` and usage/quotas).
- [ ] Generate for multiple channels; confirm queue shows correct platforms and tabs.
- [ ] Confirm X singles >280 chars and X threads show correct warnings and blocked actions where designed.

**Reference:** “End-to-End Testing” and “Testing Requirements” in `MULTI_CHANNEL_STATUS.md`.

---

## Quick links

| Doc | Purpose |
|-----|--------|
| `MULTI_CHANNEL_STATUS.md` | Full status, feature matrix, limitations |
| `AIRTABLE_SCHEMA_SETUP.md` | Step-by-step Airtable fields and views |
| `MAKE_MULTI_CHANNEL_SCENARIO.md` | Make scenario structure and payloads |
| `MULTI_CHANNEL_IMPLEMENTATION.md` | Implementation and testing checklist |

---

## If something fails

- **Make 4xx/5xx:** Check webhook URL, body schema, and that `/api/content/generation/complete` is reachable from Make.
- **Duplicates in Airtable:** Ensure Make uses the pre-generated `content_item_key` and skips create when that key already exists.
- **Quota not updating:** Ensure completion callback sends `generation_job_id` and that migration 007 has been applied so idempotency works.
