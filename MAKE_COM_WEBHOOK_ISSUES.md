# Make.com Content Generation Webhook Issues

## Problem Summary

### Issue 1: Multiple Webhook Calls Finding 0 Records

**What's happening:**
- Make.com is calling `/api/content/webhook` multiple times (15+ times in a short period)
- Each call reports "Found 0 content records in Airtable for brand_profile_id: recJXC2YIEdUsl0DF"
- This suggests Make.com is calling the webhook **BEFORE** it has actually created the records in Airtable

**Root Cause:**
Make.com scenario is likely:
1. Calling the webhook immediately after starting content generation
2. OR calling the webhook multiple times during the generation process
3. OR calling the webhook before the Airtable "Create Record" operations complete

**Expected Behavior:**
1. Make.com should create ALL ContentQueue records FIRST
2. Collect all created record IDs into `generated_content_ids` array
3. THEN call `/api/content/webhook` ONCE with the complete payload

### Issue 2: 123 Posts Created for Single User

**What's happening:**
- A single content brief approval resulted in 123 posts being created
- This is far more than expected (typically 10-30 posts per month)

**Possible Root Causes:**
1. **Infinite Loop in Make.com**: The scenario might be looping without proper exit conditions
2. **Multiple Scenario Executions**: The scenario might be triggered multiple times
3. **Iterator Without Limits**: An iterator module might be creating records without a limit
4. **Duplicate Webhook Triggers**: The brief approval might have triggered multiple times

**Expected Behavior:**
- Content generation should create a reasonable number of posts (e.g., 10-30 for a month)
- Make.com should have limits/controls to prevent runaway generation

## Log Analysis

### Timeline (Dec 16, 12:52 - 13:00)

1. **12:52:38** - Strategy approved (`/api/strategy/recJXC2YIEdUsl0DF/approve`)
   - Content generation webhook triggered successfully
   
2. **12:53:18 - 13:00:14** - Multiple webhook calls (15+ times)
   - All showing "Found 0 content records"
   - Make.com is calling webhook repeatedly before records exist

3. **12:53:26** - User views content approval page
   - Brand names map shows 4 brands
   - No content visible yet (because Make.com hasn't created records)

4. **12:56:30 - 12:56:44** - Some content operations
   - Image upload
   - Content queue updates (PATCH)
   - Suggests some records were eventually created

5. **13:00:08** - Publish job runs
   - Skips a post scheduled for Dec 18 (not due yet)

## Required Make.com Fixes

### Fix 1: Webhook Timing

**Current (WRONG):**
```
1. Start content generation
2. Call webhook immediately ← TOO EARLY
3. Create records in Airtable
```

**Correct Flow:**
```
1. Start content generation
2. Create ALL ContentQueue records in Airtable
3. Collect all created record IDs
4. Call webhook ONCE with complete payload including generated_content_ids
```

### Fix 2: Prevent Duplicate Executions

**Add to Make.com Scenario:**
- Check if brief status is already "Sent to Make" before starting
- Use error handling to prevent duplicate runs
- Add scenario-level error handling to stop on first failure

### Fix 3: Add Limits to Content Generation

**Add to Make.com Scenario:**
- Set maximum number of posts to generate (e.g., 30-50 per brief)
- Add loop limits/break conditions
- Log how many posts are being created

### Fix 4: Proper Record Creation

**Ensure Make.com:**
- Creates records in a single iterator path (not branching)
- Writes `content_brief_id = brief_id` on EVERY record
- Writes `brand_profile_id` correctly
- Sets `status = "Needs Approval"` for all new records

## Webhook Payload Requirements

Make.com MUST call `/api/content/webhook` with:

```json
{
  "mode": "content_generation",
  "trigger_type": "content_brief_approved",
  "brief_id": "recXXXXXXXXXXXX",
  "brand_profile_id": "recYYYYYYYYYYYY",
  "user_id": "uuid-here",
  "ok": true,
  "created_posts": 10,  // Actual number created
  "created_articles": 2,  // If applicable
  "generated_content_ids": [  // REQUIRED: All record IDs created
    "recContent1",
    "recContent2",
    "recContent3"
  ],
  "timestamp": "2025-12-16T13:00:00Z"
}
```

## Verification Steps

1. **Check Make.com Scenario Logs:**
   - How many times is the webhook module called?
   - When is it called relative to record creation?
   - Are there any errors or retries?

2. **Check Airtable ContentQueue:**
   - How many records were actually created?
   - Do they all have `content_brief_id` set?
   - What is the `brand_profile_id` on each record?

3. **Check Brief Status:**
   - What is the current status of the brief?
   - How many times was it updated?
   - Is there a `generation_completed_at` timestamp?

## Immediate Actions

1. **Stop the Make.com scenario** if it's still running
2. **Review Make.com scenario flow** for loops without limits
3. **Check for duplicate triggers** in Make.com execution history
4. **Verify Airtable records** - count actual posts created
5. **Clean up duplicate/excessive posts** if needed

## Prevention

1. **Add idempotency checks** in Make.com before starting generation
2. **Add limits** to content generation loops
3. **Ensure webhook is called AFTER all records are created**
4. **Add validation** in Make.com to verify record creation succeeded
5. **Monitor webhook call frequency** - should be called ONCE per brief
