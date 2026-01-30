# Generation Progress Tracking

**Date:** 2026-01-21  
**Purpose:** Track per-platform progress for multi-channel generation jobs and determine when all routes are complete.

---

## Overview

When a multi-channel generation job is triggered, Make.com processes each platform route (LinkedIn, X, Instagram, Facebook, Blog) independently. To track when the entire job is complete, each route reports its progress to the app via a callback.

**Flow:**
1. App creates `generation_job` with `expected_platforms` and `status='in_progress'`
2. Make webhook receives request and processes each platform route
3. **Each route** calls `/api/content/generation/progress` after creating records
4. Progress API upserts `generation_job_progress` row for that platform
5. Progress API checks if all `expected_platforms` have reported
6. If yes, marks `generation_jobs.status` as `completed`, `partial`, or `failed`

---

## Database Schema

### New Table: `generation_job_progress`

Tracks per-platform progress for each generation job.

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid (pk) | Primary key |
| `generation_job_id` | uuid | FK to generation_jobs |
| `platform` | text | LinkedIn, X, Instagram, Facebook, Blog |
| `route_status` | text | `completed` or `failed` |
| `created_count` | int | Number of records created |
| `record_ids` | jsonb | Array of Airtable record IDs |
| `skipped_count` | int | Number of items skipped (idempotency) |
| `errors` | jsonb | Array of error objects (if any) |
| `reported_at` | timestamptz | When this progress was reported |
| `updated_at` | timestamptz | Last update timestamp |

**Constraints:**
- Unique index on `(generation_job_id, platform)` (one row per job+platform)

**RLS:**
- Enabled, but only service role writes
- Users can read their own progress (optional policy, commented out)

---

### Updated Table: `generation_jobs`

Extended with progress tracking fields.

| New Column | Type | Description |
|------------|------|-------------|
| `expected_platforms` | jsonb | Array of platform names requested (e.g. `["LinkedIn", "X"]`) |
| `completed_platforms` | jsonb | Array of platforms that have reported completion |
| `status` | text | `pending`, `in_progress`, `completed`, `failed`, `partial` |
| `created_counts` | jsonb | Map of platform -> count (e.g. `{"LinkedIn": 3, "X": 10}`) |
| `record_ids` | jsonb | Map of platform -> record ID array |
| `last_progress_at` | timestamptz | Timestamp of last progress update |

---

## API Endpoints

### POST `/api/content/generation/progress`

**Purpose:** Report progress for a single platform route.

**Auth:** `x-make-secret` header (must match `MAKE_SHARED_SECRET`)

**Request Body:**
```json
{
  "generation_job_id": "uuid-here",
  "platform": "LinkedIn",
  "route_status": "completed",
  "created_count": 3,
  "record_ids": ["recXXX1", "recXXX2", "recXXX3"],
  "skipped_count": 0,
  "errors": []
}
```

**Required fields:**
- `generation_job_id` (string)
- `platform` (enum: LinkedIn, X, Instagram, Facebook, Blog)
- `route_status` (enum: completed, failed)
- `created_count` (int >= 0)
- `record_ids` (array of strings)

**Optional fields:**
- `request_id`, `user_id`, `brand_profile_id` (strings)
- `errors` (array, default `[]`)
- `skipped_count` (int, default `0`)
- `reported_at` (ISO timestamp, default `now()`)

**Response:**
```json
{
  "ok": true,
  "generation_job_id": "uuid-here",
  "platform": "LinkedIn",
  "job_status": "in_progress",
  "completed_platforms": ["LinkedIn"]
}
```

**Behavior:**
1. Validates auth and payload
2. Fetches `generation_job` to get `expected_platforms`
3. Upserts `generation_job_progress` row (idempotent: merges `record_ids` on conflict)
4. Adds `platform` to `completed_platforms` if not present
5. Checks if all `expected_platforms` have reported in `generation_job_progress`
6. If yes, sets `job_status`:
   - `completed` if all routes have `route_status='completed'`
   - `failed` if all routes have `route_status='failed'`
   - `partial` if mix of completed/failed
7. Updates `generation_jobs` with progress and status
8. Returns current job status

---

## Make.com Scenario Changes

### Before (old flow)

1. Webhook trigger
2. Iterator (channels)
3. Router (per-platform)
4. OpenAI + Airtable create (per route)
5. **Single** aggregator + completion callback at the end

### After (new flow with progress tracking)

1. Webhook trigger
2. Initialize variables + load existing keys
3. Iterator (channels)
4. Router (per-platform)
5. OpenAI + Airtable create (per route)
6. **Per-route progress callback** (new step after each route completes)
   - Call `POST /api/content/generation/progress` with platform, route_status, created_count, record_ids
7. (Optional) Final aggregator + completion callback for backward compatibility

**Example per-route callback (LinkedIn route):**

After all LinkedIn records are created, add HTTP module:
- **URL:** `{{env.APP_URL}}/api/content/generation/progress`
- **Method:** POST
- **Headers:**
  - `Content-Type: application/json`
  - `x-make-secret: {{env.MAKE_SHARED_SECRET}}`
- **Body:**
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

Repeat for X, Instagram, Facebook, Blog routes.

---

## Testing

### 1. Run migration

```bash
# From project root or Supabase CLI
supabase db push
# Or manually run: supabase/migrations/008_add_generation_progress.sql
```

Verify:
- `generation_job_progress` table exists
- `generation_jobs` has new columns: `expected_platforms`, `completed_platforms`, `status`, `created_counts`, `record_ids`, `last_progress_at`

### 2. Test progress API (manual)

```bash
curl -X POST 'http://localhost:3000/api/content/generation/progress' \
  -H 'Content-Type: application/json' \
  -H 'x-make-secret: YOUR_MAKE_SHARED_SECRET' \
  -d '{
    "generation_job_id": "test-job-123",
    "platform": "LinkedIn",
    "route_status": "completed",
    "created_count": 3,
    "record_ids": ["recXXX1", "recXXX2", "recXXX3"]
  }'
```

Expected: 404 (job not found, which is correct if you haven't created a test job yet)

### 3. Test full flow

1. Create a generation job via `/api/content/generate` (multi-channel)
2. Check `generation_jobs` table: `status` should be `in_progress`, `expected_platforms` should be set
3. Simulate progress callbacks from Make (one per platform)
4. After all platforms report, check `generation_jobs.status` (should be `completed`)
5. Check `generation_job_progress` table (should have one row per platform)

---

## Migration SQL

**File:** `supabase/migrations/008_add_generation_progress.sql`

Run this migration to create the `generation_job_progress` table and extend `generation_jobs` with progress tracking fields.

---

## Notes

- **Idempotency:** Progress callbacks can be sent multiple times. The upsert logic merges `record_ids` (union) and updates counts/timestamps.
- **Completion logic:** Job is complete when all `expected_platforms` have a row in `generation_job_progress` with `route_status='completed'` or `'failed'`.
- **Backward compatibility:** The old `/api/content/generation/complete` endpoint still works, but is optional with progress tracking.
- **RLS:** `generation_job_progress` is service-role only by default. Add a policy if you want users to poll their job progress in the UI.

---

## Files Changed

1. `supabase/migrations/008_add_generation_progress.sql` (new)
2. `src/app/api/content/generation/progress/route.ts` (new)
3. `src/app/api/content/generate/route.ts` (updated to set `expected_platforms`, `status='in_progress'`)
4. `MAKE_MULTI_CHANNEL_SCENARIO.md` (updated with per-route progress callback step)
5. `GENERATION_PROGRESS_TRACKING.md` (this doc)
