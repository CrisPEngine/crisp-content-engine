# Content Brief Implementation Plan

## Overview
Transform "Monthly Strategy Update" into "Monthly Content Brief" system where:
- Master strategy remains editable from dashboard
- Monthly briefs guide content generation (not replace strategy)
- Briefs can include performance feedback (best/worst posts)

## System Changes Required

### 1. Airtable Table Changes
**StrategyUpdates table** → Rename to **ContentBriefs** (or keep same table, just change field names)
- Keep existing fields but rename conceptually:
  - `mode` → `brief_mode` ('continue' | 'feedback')
  - Add `best_performing_post_id` (Link to ContentQueue)
  - Add `worst_performing_post_id` (Link to ContentQueue)
  - `status` options: 'Pending', 'Processing', 'Completed', 'Approved', 'Failed'

### 2. API Endpoints to Create/Update

**New Endpoints:**
- `GET /api/content/published` - Fetch published posts for dropdown selection
- `PATCH /api/strategy/[id]` - Update master strategy (auto-save from dashboard)
- `POST /api/content-brief` - Submit monthly content brief (renamed from monthly-update)
- `GET /api/content-briefs` - Fetch pending briefs for approval
- `POST /api/content-brief/[id]/approve` - Approve brief and trigger content generation

**Update Existing:**
- Rename `/api/strategy/monthly-update` → `/api/content-brief`
- Update webhook payload to send brief data (not strategy generation request)

### 3. UI Pages to Create/Update

**New Pages:**
- `/strategy/[id]/edit` - Editable master strategy view (auto-saves to Airtable)

**Update Existing:**
- `/strategy/monthly-update` → `/content-brief` (rename and update form)
- `/strategy/monthly-updates` → `/content-briefs` (rename approval page)
- Dashboard - Add section for pending briefs + editable strategy

### 4. Make.com Changes Required

**Webhook Payload Changes:**
- Change `mode: 'monthly_update'` → `mode: 'content_brief'`
- Include `brief_mode: 'continue' | 'feedback'`
- Include `best_performing_post_id` and `worst_performing_post_id` if feedback mode
- Include master `strategy_json` from BrandProfiles (not generate new strategy)
- Make.com should use brief to guide content generation, not generate new strategy

**Scenario Changes:**
- Update scenario to receive content brief
- Use brief + master strategy to generate content
- Don't generate new strategy JSON

## Implementation Steps

1. ✅ Create API to fetch published posts
2. ✅ Update content brief form with best/worst post dropdowns
3. ✅ Make master strategy editable from dashboard
4. ✅ Update approval flow for content briefs
5. ✅ Update Make.com webhook payload
6. ✅ Update dashboard to show pending briefs

## User Flow

1. User edits master strategy from dashboard → Auto-saves to Airtable
2. User submits monthly content brief → Creates record in ContentBriefs table
3. Make.com receives brief → Generates content using brief + master strategy
4. User sees pending brief on dashboard → Approves brief
5. Content generation triggered with brief + master strategy
