# Make.com Scenario Setup for Automated Email Notifications

This guide explains how to set up the Make.com scenario to trigger automated "new content ready" emails.

## Overview

When content is created in Airtable, Make.com should call a webhook endpoint to notify users via email. The email is only sent if the user is not currently active (hasn't been seen in the last 30 minutes).

## Required Make.com Scenario Flow

### Step 1: Receive Content Generation Webhook

**Module:** Custom Webhook (Trigger)
- **Webhook URL:** Use the URL from `MAKE_CONTENT_GENERATION_WEBHOOK_URL` environment variable
- **Method:** POST
- **Expected Payload:**
```json
{
  "brand_profile_id": "recXXXXXXXXXXXXXX",
  "user_id": "uuid-here",
  "person_urn": "urn:li:person:123456",
  "organization_urn": "urn:li:organization:123456",
  "brand_type": "company",
  "strategy_json": {...},
  "strategy_summary": "Strategy summary text",
  "platforms_requested": ["LinkedIn", "Blog"],
  "triggered_at": "2025-01-15T10:00:00Z",
  "trigger_type": "strategy_confirmed"
}
```

### Step 2: Generate Content

**Modules:** AI Content Generation
- Use the strategy data to generate content items
- Generate content based on:
  - Approved strategy (`strategy_json`)
  - User's package limits
  - Platform preferences (`platforms_requested`)
  - Brand voice and guidelines

### Step 3: Create Content Records in Airtable

**Module:** Airtable - Create Record (or Create Multiple Records)

**Table:** ContentQueue

**Required Fields:**
- `hook` (Single Line Text) - Post title/subject
- `post_content` (Long Text) - Full content text
- `status` (Single Select) - Must be exactly `"Needs Approval"`
- `platform` (Single Select) - e.g., "LinkedIn", "Blog", "X"
- `brand_profile_id` (Link to BrandProfiles) - **Must be a LINK field, not text**
- `user_id` (Single Line Text) - User UUID

**Optional Fields:**
- `scheduled_time` (Date with time) - When content should be published
- `hashtags` (Single Line Text)
- `image_prompt` (Long Text)
- `summary` (Long Text)
- `call_to_action` (Single Line Text)

**Important Notes:**
- Create all content records in a single batch or loop
- Store the record IDs as you create them (you'll need them for the webhook)
- Ensure `brand_profile_id` is linked correctly (not just text)

### Step 4: Collect Content Record IDs

**Module:** Array aggregator or similar
- Collect all the Airtable record IDs from the content records you just created
- You need an array of IDs like: `["rec123", "rec456", "rec789"]`

### Step 5: Call Content Batch Ready Webhook

**Module:** HTTP - Make a Request

**Method:** POST

**URL:** `https://app.crispdigital.io/api/email/content-batch-ready-hook`
(Or use `NEXT_PUBLIC_APP_URL` + `/api/email/content-batch-ready-hook`)

**Headers:**
```
Content-Type: application/json
x-make-secret: your-secret-here (optional, if configured)
```

**Body:**
```json
{
  "userId": "{{1.user_id}}",
  "brandProfileId": "{{1.brand_profile_id}}",
  "contentItemIds": ["rec123", "rec456", "rec789"]
}
```

**Where:**
- `userId` = The `user_id` from the original webhook payload (Step 1)
- `brandProfileId` = The `brand_profile_id` from the original webhook payload (Step 1)
- `contentItemIds` = Array of Airtable record IDs from Step 4

### Step 6: Handle Response

**Expected Response:**
```json
{
  "ok": true,
  "message": "Batch ready email sent successfully",
  "userActive": false
}
```

**Or if user is active (email skipped):**
```json
{
  "message": "User active, skipped batch ready email",
  "skipped": true,
  "lastSeenAt": "2025-01-15T10:00:00Z"
}
```

## Complete Make.com Scenario Structure

```
1. Custom Webhook (Trigger)
   ↓
2. Router (if needed for different content types)
   ↓
3. AI Content Generation Module(s)
   ↓
4. Airtable - Create Multiple Records (or loop)
   ↓
5. Array Aggregator (collect record IDs)
   ↓
6. HTTP - Make a Request (call batch-ready webhook)
   ↓
7. Error Handler (optional)
```

## Environment Variables Required

Make sure these are set in Vercel:

```bash
# Content Generation Webhook (incoming to Make.com)
MAKE_CONTENT_GENERATION_WEBHOOK_URL=https://hook.make.com/your-webhook-id

# Webhook Secret (optional, for security)
MAKE_CONTENT_WEBHOOK_SECRET=your-secret-here
# OR
MAKE_SHARED_SECRET=your-secret-here
# OR
CONTENT_WEBHOOK_SECRET=your-secret-here

# App URL (for webhook callback)
NEXT_PUBLIC_APP_URL=https://app.crispdigital.io
```

## Security

The webhook endpoint accepts an optional `x-make-secret` header. If you configure one of the secret environment variables, Make.com must include this header:

```
x-make-secret: your-secret-here
```

If no secret is configured, the webhook will work without authentication (less secure, but functional).

## Testing the Scenario

1. **Test Content Creation:**
   - Trigger the content generation webhook manually
   - Verify content records are created in Airtable
   - Check that all required fields are populated

2. **Test Email Webhook:**
   - After creating content, verify the batch-ready webhook is called
   - Check the response to see if email was sent or skipped
   - Verify email appears in user's inbox (if not active)

3. **Test User Activity Check:**
   - If user is active (last_seen_at < 30 min), email should be skipped
   - If user is inactive, email should be sent

## Troubleshooting

### Issue: Email not being sent

**Check:**
- Is the webhook being called? Check Make.com execution logs
- Is the user active? Check `last_seen_at` in profiles table
- Are the content IDs correct? Verify they exist in Airtable
- Is the webhook secret correct? (if configured)

### Issue: Content not appearing in approval queue

**Check:**
- Is `status` set to exactly `"Needs Approval"`? (case-sensitive)
- Is `brand_profile_id` linked correctly? (must be Link field, not text)
- Are required fields (`hook`, `post_content`, `platform`) populated?

### Issue: Wrong user receiving email

**Check:**
- Is `userId` in webhook payload correct?
- Is `brandProfileId` linked to the correct brand?
- Verify user_id matches between webhook and Airtable records

## Example Make.com Scenario JSON

Here's a simplified example of what the scenario structure should look like:

```json
{
  "scenario": {
    "name": "Content Generation with Email Notification",
    "modules": [
      {
        "type": "webhook",
        "name": "Content Generation Trigger",
        "webhookUrl": "{{MAKE_CONTENT_GENERATION_WEBHOOK_URL}}"
      },
      {
        "type": "ai",
        "name": "Generate Content",
        "model": "gpt-4",
        "prompt": "Generate content based on strategy..."
      },
      {
        "type": "airtable",
        "name": "Create Content Records",
        "table": "ContentQueue",
        "action": "createMultiple"
      },
      {
        "type": "array",
        "name": "Collect Record IDs",
        "operation": "aggregate"
      },
      {
        "type": "http",
        "name": "Notify User",
        "method": "POST",
        "url": "https://app.crispdigital.io/api/email/content-batch-ready-hook",
        "headers": {
          "Content-Type": "application/json",
          "x-make-secret": "{{MAKE_CONTENT_WEBHOOK_SECRET}}"
        },
        "body": {
          "userId": "{{1.user_id}}",
          "brandProfileId": "{{1.brand_profile_id}}",
          "contentItemIds": "{{4.recordIds}}"
        }
      }
    ]
  }
}
```

## Next Steps

1. Create the Make.com scenario following the structure above
2. Test with a single content item first
3. Verify email is sent correctly
4. Scale up to batch content creation
5. Monitor execution logs for errors

## Related Documentation

- `MAKE_CONTENT_FIELDS.md` - Detailed field requirements for ContentQueue
- `MAKE_AUTOMATION_SETUP.md` - General Make.com setup guide
- `IMPLEMENTATION_UPDATES_SUMMARY.md` - Implementation details

