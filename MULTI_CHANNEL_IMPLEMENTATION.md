# Multi-Channel Implementation Summary

## Overview

This implementation adds support for LinkedIn, X, Instagram, Facebook, and Blog as first-class channels with:
- Channel-native content generation
- Quota-based plan enforcement (no feature gating)
- Channel-specific queue tabs and previews
- X threads (export-only in V1)
- Idempotent generation with usage tracking

---

## Airtable Schema Changes (ContentQueue)

### New Fields to Add

| Field Name | Type | Options/Formula | Required | Notes |
|------------|------|-----------------|----------|-------|
| `post_type` | Single select | `single`, `thread`, `caption` | Yes | Default: `single` |
| `thread_group_id` | Single line text | - | No | Required for X threads |
| `thread_index` | Number (integer) | - | No | 1-based ordering for threads |
| `character_count` | Formula | `LEN({post_content})` | Yes | Auto-calculated |
| `visual_brief` | Long text | - | No | For Instagram/Facebook |
| `generation_job_id` | Single line text | - | No | Idempotency tracking |
| `content_item_key` | Single line text | - | No | Unique key per item |

### Existing Fields to Update

| Field Name | Action |
|------------|--------|
| `platform` | Add options: `X`, `Instagram`, `Facebook`, `Blog` (if missing) |
| `hashtags` | Confirm exists; if not, create as Long text |

### Canonical Field Names (locked)

| Purpose | Field Name | Type |
|---------|------------|------|
| Title/Hook | `hook` | Single line text |
| Body/Content | `post_content` | Long text |
| Character Count | `character_count` | Formula: `LEN({post_content})` |

**Rule:** Never write to `body_draft` or `post_body` or any alternative body field.

---

## Airtable Views (ContentQueue)

Create these views on the existing ContentQueue table:

### Approval Views

| View Name | Filter Formula |
|-----------|----------------|
| **LinkedIn Approval** | `{platform}="LinkedIn"` AND `OR({status}="Needs Approval",{status}="Needs Copy",{status}="Needs Review",{status}="Draft")` |
| **X Approval** | `{platform}="X"` AND `OR({status}="Needs Approval",{status}="Needs Copy",{status}="Needs Review",{status}="Draft")` |
| **Meta Approval** | `OR({platform}="Instagram",{platform}="Facebook")` AND `OR({status}="Needs Approval",{status}="Needs Copy",{status}="Needs Review",{status}="Draft")` |
| **Blog Approval** | `{platform}="Blog"` AND `OR({status}="Needs Approval",{status}="Needs Copy",{status}="Needs Review",{status}="Draft")` |

**Sort:** `{created_time}` descending, then `{thread_index}` ascending (for X)

### Scheduled Views

| View Name | Filter Formula |
|-----------|----------------|
| **LinkedIn Scheduled** | `{platform}="LinkedIn"` AND `OR({status}="Scheduled",{status}="Ready To Publish",{status}="Published",{status}="Failed")` |
| **X Scheduled** | `{platform}="X"` AND `OR({status}="Scheduled",{status}="Ready To Publish",{status}="Published",{status}="Failed")` AND `{post_type}="single"` |
| **Meta Scheduled** | `OR({platform}="Instagram",{platform}="Facebook")` AND `OR({status}="Scheduled",{status}="Ready To Publish",{status}="Published",{status}="Failed")` |

**Sort:** `{scheduled_time}` ascending

**Note:** X Scheduled view filters to `post_type="single"` only (threads are export-only).

---

## Supabase Changes

### New Table: generation_jobs

See: `supabase/migrations/007_add_generation_tracking.sql`

**Purpose:** Track generation requests for idempotency and usage reconciliation.

**Fields:**
- `id` (uuid, primary key)
- `generation_job_id` (text, unique)
- `user_id` (uuid, foreign key to auth.users)
- `brand_profile_id` (text)
- `channels` (jsonb) - array of channel objects with platform, count, keys
- `requested_count` (integer)
- `created_count` (integer, default 0)
- `usage_incremented` (boolean, default false)
- `created_at` (timestamptz)
- `completed_at` (timestamptz, nullable)

**RLS:** Users can view their own jobs; service role bypasses RLS.

---

## Plan Updates (src/config/pricing.ts)

| Plan | max_brands | posts_per_month | Channels |
|------|------------|-----------------|----------|
| Creator | 1 | 10 | LinkedIn, Blog, Medium |
| **Growth** | **1** | **150** | LinkedIn, X, Instagram, Facebook, Blog, Medium |
| Pro | 5 | 500 | LinkedIn, X, Instagram, Facebook, Blog, Medium |
| Scale | 20 | unlimited | All |

**Change:** Growth now allows 1 brand (was 2) and 150 posts/month (was 60).

---

## API Changes

### New Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/content/quota` | GET | Returns quota remaining for current user |
| `/api/content/generation/complete` | POST | Make.com completion callback |

### Modified Endpoints

| Endpoint | Changes |
|----------|---------|
| `/api/content/generate` | Complete rewrite: accepts multi-channel array, pre-checks quota, creates generation job, pre-generates keys, sends new payload to Make |
| `/api/content/queue` | Add `?platform=` filter for channel tabs |
| `/api/usage/increment` | Add idempotency check via `generation_job_id` |

---

## Channel Registry (src/lib/channels/)

### Files Created

- `types.ts` - TypeScript interfaces
- `validators.ts` - Validation logic + LinkedIn-style pattern detection
- `linkedin.ts` - LinkedIn channel definition
- `x.ts` - X channel definition  
- `meta.ts` - Instagram + Facebook channel definitions
- `blog.ts` - Blog channel definition
- `registry.ts` - Central registry + helper functions
- `x-algo-digest.ts` - X algorithm digest constant

### Key Functions

- `getChannel(id)` - Get channel definition by ID
- `getChannelByPlatform(platform)` - Get channel by Airtable platform value
- `isPublishable(platform, postType)` - Check if content can be scheduled/published
- `canScheduleOrPublish(platform, postType, charCount)` - Validation for scheduling

---

## V1 Constraints (Critical)

### X Threads: Export-Only

- X threads (`post_type="thread"`) can be generated and approved
- **Cannot** be scheduled or published via Buffer in V1
- UI must:
  - Show "Copy thread" and "Copy tweet" actions
  - Hide/disable schedule/publish buttons for threads
  - Display clear label: "Threads are export-only for now"

### Publishable Content Rules

| Platform | Post Type | Publishable? | Additional Constraints |
|----------|-----------|--------------|------------------------|
| LinkedIn | single | ✅ Yes | None |
| X | single | ✅ Yes | `<=280` chars |
| X | thread | ❌ No | Export-only in V1 |
| Instagram | caption | ✅ Yes | Buffer connection required |
| Facebook | caption | ✅ Yes | Buffer connection required |
| Blog | single | ❌ No | Export-only (copy/paste to blog manually) |

---

## Quota Enforcement

### Counting Rules

- 1 Airtable ContentQueue record = 1 post toward quota
- X threads count **per tweet** (e.g., 5-tweet thread = 5 posts)
- All channels count equally

### Enforcement Points

1. **Brand creation** (`/api/onboarding`):
   - Check `entitlements.max_brands`
   - Block if user already has max brands

2. **Content generation** (`/api/content/generate`):
   - Calculate total requested count across all channels
   - Check against `posts_per_month - usage`
   - Block if insufficient quota

3. **Usage increment** (`/api/usage/increment`):
   - Increment only after Airtable records created (via completion callback)
   - Idempotent via `generation_job_id`

---

## UI Changes

### Content Approval Queue

**File:** `src/app/(app)/content/approval/page.tsx`

**Changes:**
- Add channel tabs: LinkedIn | X | Meta | Blog
- Each tab queries `/api/content/queue?stage=approval&platform=<platform>`
- Channel-specific previews:
  - LinkedIn: existing card
  - X: tweet preview (show char count badge)
  - X thread: stacked preview with thread indicator
  - Meta: caption + hashtag block + visual brief
  - Blog: article preview
- Validation badges for invalid content
- Disable schedule/publish for:
  - X threads
  - Blog posts
  - X singles >280 chars

### Dashboard

**File:** `src/app/(app)/dashboard/page.tsx`

**Changes:**
- Show "Posts remaining this month" indicator
- Call `/api/content/quota` to get remaining count

---

## Make.com Scenario Summary

See: `MAKE_MULTI_CHANNEL_SCENARIO.md`

**Key points:**
- Single scenario handles all channels via routing
- Receives pre-generated `content_item_key` values
- Iterates `channels[]` array (not object)
- Per-channel OpenAI prompts with strict JSON output
- X-specific validation + one-pass auto-rewrite
- Idempotency check before creating each Airtable record
- Completion callback with counts per platform

---

## Testing Checklist

- [ ] Airtable fields added without errors
- [ ] Supabase migration runs successfully
- [ ] Quota API returns correct remaining count
- [ ] Multi-channel generation request succeeds
- [ ] Make receives payload with pre-generated keys
- [ ] Airtable records created with correct fields
- [ ] X validation rejects tweets >280 chars
- [ ] X auto-rewrite works (one pass)
- [ ] Idempotency: second run skips all creates
- [ ] Completion callback increments usage correctly
- [ ] Usage increment is idempotent
- [ ] Channel tabs filter correctly
- [ ] X threads show "export-only" label
- [ ] Schedule/publish disabled for X threads and Blog

---

## Deployment Checklist

1. Run Supabase migration: `007_add_generation_tracking.sql`
2. Add Airtable fields to ContentQueue
3. Create Airtable views
4. Deploy code to Vercel
5. Update Make.com scenario with new module sequence
6. Test end-to-end with small generation request
7. Verify quota enforcement
8. Verify idempotency (run same request twice)

---

## Known Limitations (V1)

- X threads cannot be scheduled/published (export-only)
- Blog posts cannot be published (export-only)
- Calendar view not yet implemented (future phase)
- No drag-drop scheduling (future phase)
- Buffer connection required for X/Instagram/Facebook publishing
