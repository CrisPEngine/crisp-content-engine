# Content Brief Implementation Summary

## ✅ Completed Implementation

### 1. API Endpoints Created

**POST `/api/content-brief`**
- Creates content brief record in Airtable (StrategyUpdates table)
- Captures snapshots: `strategy_snapshot_json`, `brief_snapshot_json`, `recent_post_history_snapshot`
- Validates user ownership
- Returns brief ID

**GET `/api/content-briefs?brand_profile_id=...`**
- Returns content briefs for a brand profile
- Used by dashboard to show pending briefs

**POST `/api/content-brief/:id/approve`**
- Approves content brief
- Sets status to "Approved" and `approved_at` timestamp
- Triggers content generation via `triggerContentGenerationFromBrief()`

**GET `/api/content/published?brand_profile_id=...`**
- Returns published posts for best/worst post selection dropdowns

### 2. Content Generation Trigger

**`triggerContentGenerationFromBrief(briefId)`** in `/src/lib/contentBrief.ts`
- Loads brief and strategy snapshot
- Fetches best/worst post details if provided
- Builds webhook payload:
  ```json
  {
    "mode": "content_generation",
    "trigger_type": "content_brief_approved",
    "brief_id": "...",
    "user_id": "...",
    "brand_profile_id": "...",
    "brief_mode": "continue" | "feedback",
    "monthly": { ... },
    "master_strategy_json": { ... },
    "best_post": { id, title, body_draft, reason },
    "worst_post": { id, title, body_draft, reason }
  }
  ```
- POSTs to `MAKE_CONTENT_GENERATION_WEBHOOK_URL`

### 3. UI Components Created

**`/content-brief` Page**
- Monthly content brief form
- Brief mode selector (continue | feedback)
- Best/worst post dropdowns (for feedback mode)
- Reason fields for best/worst posts
- Redirects to dashboard on submit

**`MasterStrategyEditor` Component**
- Editable JSON editor for master strategy
- Auto-save with 800ms debounce
- Shows last saved time
- Saves to `BrandProfiles.strategy_json`

**`ContentBriefsSection` Component**
- Shows pending briefs for approval
- Displays brief status
- Approve button for pending briefs
- Links to content review when generation completed

**`DashboardStrategySection` Component**
- Wrapper that loads strategy and displays:
  - Master Strategy Editor
  - Content Briefs Section

### 4. Webhook Handler Updated

**`/api/content/webhook`**
- Handles `mode: "content_generation"` and `trigger_type: "content_brief_approved"`
- Updates ContentBrief status to "Generation Completed"
- Sets `generation_completed_at` timestamp
- Stores `generated_content_ids` if provided
- Sends "Content Ready" email notification

### 5. Email Notifications

**`ContentReadyEmail` Component**
- Sent when content generation completes
- Deep links to content approval queue filtered by brand
- Uses `EMAIL_DEBUG_OVERRIDE_TO` during testing

### 6. Strategy Editing

**PATCH `/api/strategy/:id`**
- Removed restriction on editing approved strategies
- Master strategy is now always editable
- Auto-saves to `BrandProfiles.strategy_json`

## 🔄 System Updates Required

### Airtable Fields (StrategyUpdates Table)

**Required Fields:**
- ✅ `brand_profile_id` (Link to BrandProfiles)
- ✅ `user_id`
- ✅ `brief_mode` (Single Select: continue | feedback)
- ✅ `cycle_start_date`
- ✅ `objective` (Text)
- ✅ `themes_focus` (Text)
- ✅ `key_dates` (Text)
- ✅ `feedback_notes` (Long Text)
- ✅ `content_preferences` (Long Text)
- ✅ `best_performing_post_id` (Link to ContentQueue, optional)
- ✅ `worst_performing_post_id` (Link to ContentQueue, optional)
- ✅ `best_post_reason` (Long Text, optional)
- ✅ `worst_post_reason` (Long Text, optional)
- ✅ `status` (Single Select: Draft | Pending Approval | Approved | Sent to Make | Generation Completed | Failed)
- ✅ `submitted_at` (Date/Time)
- ✅ `approved_at` (Date/Time)
- ✅ `sent_to_make_at` (Date/Time)
- ✅ `generation_completed_at` (Date/Time)
- ✅ `last_error` (Text)

**Snapshot Fields:**
- ✅ `strategy_snapshot_json` (Long Text)
- ✅ `brief_snapshot_json` (Long Text)
- ✅ `recent_post_history_snapshot` (Long Text, optional)
- ✅ `generated_content_ids` (Long Text or JSON array)

### Make.com Scenario Updates

**Webhook Payload Changes:**
- Change from `mode: "monthly_update"` → `mode: "content_generation"`
- Add `trigger_type: "content_brief_approved"`
- Include `brief_id`, `brief_mode`
- Include `master_strategy_json` (from snapshot, not generate new)
- Include `best_post` and `worst_post` objects if feedback mode
- **Do NOT generate new strategy JSON** - use `master_strategy_json` provided

**Scenario Behavior:**
- Receive content brief webhook
- Use `master_strategy_json` + brief data to generate content
- Create ContentQueue records with status "Needs Approval"
- Call `/api/content/webhook` with:
  ```json
  {
    "mode": "content_generation",
    "trigger_type": "content_brief_approved",
    "brief_id": "...",
    "ok": true,
    "generated_content_ids": ["rec1", "rec2", ...]
  }
  ```

## 🚫 Removed/Deprecated

### Old Monthly Strategy Update Flow
- `/api/strategy/monthly-update` - Still exists but should be deprecated
- `/strategy/monthly-update` page - Replaced by `/content-brief`
- Strategy generation webhook (`MAKE_STRATEGY_WEBHOOK_URL`) - No longer used for monthly updates

## 📋 User Flow

1. **User edits master strategy** → Dashboard → Master Strategy Editor → Auto-saves to Airtable
2. **User submits content brief** → `/content-brief` → Creates brief with status "Pending Approval" → Redirects to dashboard
3. **User approves brief** → Dashboard → Content Briefs Section → Approve button → Triggers content generation
4. **Make.com generates content** → Uses brief + master strategy → Creates ContentQueue records
5. **Make.com calls webhook** → `/api/content/webhook` → Updates brief status → Sends email
6. **User reviews content** → Email link → Content approval queue → Approve/reject content

## 🔍 Testing Checklist

- [ ] Submit content brief (continue mode)
- [ ] Submit content brief (feedback mode with best/worst posts)
- [ ] Approve brief and verify webhook is triggered
- [ ] Verify Make.com receives correct payload
- [ ] Verify content generation uses master strategy + brief
- [ ] Verify brief status updates to "Generation Completed"
- [ ] Verify email notification is sent
- [ ] Edit master strategy from dashboard
- [ ] Verify auto-save works (800ms debounce)
- [ ] Verify strategy changes are saved to Airtable

## 📝 Notes

- Master strategy remains in `BrandProfiles.strategy_json`
- Content briefs are stored in `StrategyUpdates` table (repurposed)
- Briefs guide content generation but don't replace the master strategy
- Old monthly strategy generation flow is deprecated but not removed (for backward compatibility)
