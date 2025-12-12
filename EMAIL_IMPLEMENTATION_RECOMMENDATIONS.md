# Email Implementation Recommendations

## Overview

This document outlines recommendations for implementing `ContentApprovalDigestEmail` and `ContentBatchReadyEmail` without using Make.com, running directly from the app.

**Current Setup:**
- Using cron-job.org (free tier) for scheduled jobs (Vercel Hobby plan doesn't support cron)
- All email endpoints use POST method (important for cron-job.org configuration)
- Strategy reminder already working (was 405, now 200 OK after fixing method to POST)

## Current State

### ContentApprovalDigestEmail
- **Current**: Triggered by cron job (`/api/email/content-approval-reminder`)
- **Frequency**: Every 3 hours (configurable)
- **Logic**: Queries Airtable for content with `status = "Needs Approval"`
- **Cooldown**: 6 hours between emails per user

### ContentBatchReadyEmail
- **Current**: Triggered by Make.com webhook (`/api/email/content-batch-ready-hook`)
- **Issue**: User wants to remove Make.com dependency

## Recommendations

### 1. ContentApprovalDigestEmail - Enhanced Logic

**Current Behavior:**
- Checks for any content with `status = "Needs Approval"`
- Sends reminder every 6 hours if pending content exists

**Recommended Enhancement:**
- Check for content that hasn't been approved for **1 week after the first scheduled date**
- Only send reminders for content that is overdue (scheduled date + 7 days has passed)
- This prevents spam and focuses on content that truly needs attention

**Implementation:**
```typescript
// Filter logic:
// 1. status = "Needs Approval"
// 2. scheduled_time exists
// 3. scheduled_time + 7 days < now
// 4. created_time or first_reminder_sent_at tracking
```

**Airtable Formula:**
```
AND(
  {status} = "Needs Approval",
  {scheduled_time} != "",
  DATETIME_DIFF(NOW(), {scheduled_time}, 'days') >= 7
)
```

### 2. ContentBatchReadyEmail - App-Based Trigger

**Option A: Direct from Content Generation API (Recommended)**

When content is generated and saved to Airtable, trigger the email directly:

1. **In your content generation endpoint** (`/api/content/generate` or similar):
   - After content is created in Airtable
   - Check if user is active (last_seen_at within 30 minutes)
   - If not active, call email sending function directly
   - No webhook needed

**Pros:**
- ✅ No external dependency
- ✅ Immediate notification
- ✅ Simpler architecture

**Cons:**
- ⚠️ Adds latency to content generation endpoint
- ⚠️ Need to handle email failures gracefully

**Option B: Background Job Queue**

Use a job queue (e.g., Vercel Queue, Upstash QStash, or simple database queue):

1. Content generation creates records in Airtable
2. Also creates a job record in Supabase `email_jobs` table
3. Cron job runs every 5-15 minutes to process pending jobs
4. Sends emails and marks jobs as complete

**Pros:**
- ✅ Async processing
- ✅ Retry logic
- ✅ Better error handling

**Cons:**
- ⚠️ More complex setup
- ⚠️ Slight delay in email delivery

**Option C: Vercel Cron + Database Check**

Similar to current approval reminder:

1. Cron job runs every 15-30 minutes
2. Queries Airtable for content created in last hour with `status = "Needs Approval"`
3. Groups by user and brand
4. Sends batch ready email if:
   - Content was created recently (within last hour)
   - User hasn't been notified yet (track in database)
   - User is not currently active

**Pros:**
- ✅ Uses existing cron infrastructure
- ✅ Simple to implement
- ✅ No changes to content generation flow

**Cons:**
- ⚠️ Delay in notification (up to 15-30 minutes)
- ⚠️ Need to track which batches have been notified

## Recommended Implementation Plan

### Phase 1: Update ContentApprovalDigestEmail ✅

1. Update `/api/email/content-approval-reminder/route.ts`:
   - Add filter for content where `scheduled_time + 7 days < now`
   - Only send for overdue content
   - Track `first_reminder_sent_at` in Airtable or database

### Phase 2: Replace ContentBatchReadyEmail Trigger

**Recommended: Option C (Vercel Cron + Database Check)**

1. Create new endpoint: `/api/email/content-batch-ready-check`
2. Cron job runs every 15 minutes
3. Query Airtable for:
   - Content with `status = "Needs Approval"`
   - `created_time` within last 2 hours
   - Group by `user_id` and `brand_profile_id`
4. Check Supabase `profiles` table for:
   - `last_batch_notified_at` timestamp
   - Skip if notified in last 2 hours
5. Send email and update `last_batch_notified_at`

### Database Schema Updates

Add to `profiles` table:
```sql
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS last_batch_notified_at TIMESTAMPTZ;
ADD COLUMN IF NOT EXISTS last_batch_notified_brand_id TEXT;
```

This tracks:
- When user was last notified about a batch
- Which brand the notification was for (to allow multiple brands)

## Code Structure

### ContentApprovalDigestEmail Endpoint
```
/api/email/content-approval-reminder
├── Query Airtable for overdue content (scheduled + 7 days)
├── Group by user_id
├── Check cooldown (6 hours)
├── Build email items
└── Send email
```

### ContentBatchReadyEmail Endpoint
```
/api/email/content-batch-ready-check
├── Query Airtable for recent content (created in last 2 hours)
├── Group by user_id + brand_profile_id
├── Check if user already notified for this brand
├── Check if user is active (skip if active)
├── Fetch sample content items
└── Send email
```

## Environment Variables

No new environment variables needed - uses existing:
- `AIRTABLE_PAT`
- `AIRTABLE_BASE_ID`
- `AIRTABLE_CONTENTQUEUE_TABLE`
- `AIRTABLE_BRANDPROFILES_TABLE`
- `CRON_SECRET`
- `NEXT_PUBLIC_APP_URL`

## Cron Job Schedule (cron-job.org)

**Note**: Using cron-job.org (free tier) since Vercel Hobby plan doesn't support cron jobs.

### Current Schedule

1. **Strategy Reminder**: Daily at 9:00 AM UTC
   - Endpoint: `/api/email/strategy-reminder`
   - Method: **POST** (important - 405 errors occur if set to GET)
   - Header: `X-Cron-Secret: [CRON_SECRET]`
   - Cron: `0 9 * * *`

2. **Content Approval Reminder**: Every 3-6 hours
   - Endpoint: `/api/email/content-approval-reminder`
   - Method: **POST**
   - Header: `X-Cron-Secret: [CRON_SECRET]`
   - Cron: `0 */6 * * *` (every 6 hours) or `0 */3 * * *` (every 3 hours)

### Recommended New Schedule

3. **Content Batch Ready Check**: Every 15 minutes
   - Endpoint: `/api/email/content-batch-ready-check` (new endpoint to create)
   - Method: **POST**
   - Header: `X-Cron-Secret: [CRON_SECRET]`
   - Cron: `*/15 * * * *`
   - Note: cron-job.org free tier minimum is 5 minutes, so `*/15 * * * *` works

### Important: HTTP Method Configuration

**All email endpoints require POST method**. If cron-job.org is configured with GET, you'll get a `405 Method Not Allowed` error.

**Fix for 405 errors:**
1. Go to cron-job.org dashboard
2. Edit the cron job
3. Set **Request Method** to `POST` (not GET)
4. Ensure header `X-Cron-Secret` is set correctly
5. Save and test

## Testing

1. **Manual Testing**:
   - Use test endpoint to send emails
   - Verify email content and links
   - Test approval actions

2. **Integration Testing**:
   - Create test content in Airtable
   - Trigger cron jobs manually
   - Verify emails are sent correctly

3. **Production Monitoring**:
   - Monitor email delivery rates
   - Track user engagement (click-through rates)
   - Monitor cron job execution

## Migration Steps

1. ✅ Update ContentApprovalDigestEmail logic (add 7-day filter)
2. ✅ Create ContentBatchReadyEmail cron endpoint
3. ✅ Add database columns for tracking
4. ✅ Set up new cron job in cron-job.org
5. ✅ Test in production
6. ✅ Remove Make.com webhook dependency
7. ✅ Monitor and adjust frequency as needed

## Benefits

- ✅ **No Make.com dependency**: All logic in app
- ✅ **Better control**: Can adjust logic without external changes
- ✅ **Cost savings**: No Make.com subscription needed
- ✅ **Faster iteration**: Changes deploy with app
- ✅ **Better monitoring**: All logs in one place (Vercel)

## Considerations

- ⚠️ **Cron frequency**: Free tier limits (cron-job.org: 2 jobs, 5 min minimum)
- ⚠️ **Airtable rate limits**: Monitor API usage
- ⚠️ **Email delivery**: Monitor Resend delivery rates
- ⚠️ **User experience**: Balance between timely notifications and spam

