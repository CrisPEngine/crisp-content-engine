# LinkedIn Native Publishing Setup

## Overview

This document describes the native LinkedIn publishing implementation that runs directly from the app, without Make.com dependency.

## Architecture

1. **Content Approval**: User approves content → Status changes to "Ready To Publish" in Airtable
2. **Scheduled Job**: Cron job runs every 5-10 minutes to check for due content
3. **Publishing**: Job publishes to LinkedIn API directly using OAuth tokens
4. **Status Updates**: Airtable is updated with Published/Failed status

## Components

### 1. LinkedIn Publishing Library
**File**: `src/lib/linkedin/publish.ts`

- `getLinkedInConnection()`: Fetches and refreshes LinkedIn OAuth tokens
- `publishToLinkedIn()`: Publishes text posts to LinkedIn UGC API

### 2. Scheduled Publishing Job
**File**: `src/app/api/publish/linkedin-due/route.ts`

- `publishDueContent()`: Main function that queries Airtable and publishes due content
- Endpoint: `GET/POST /api/publish/linkedin-due`

### 3. Approval Endpoint (Updated)
**File**: `src/app/api/content/queue/[contentId]/route.ts`

- Removed Make.com webhook trigger
- Only updates Airtable status to "Ready To Publish"

## Airtable Fields Required

### ContentQueue Table

**Required Fields:**
- `platform` (Single Select): "LinkedIn"
- `status` (Single Select): "Ready To Publish", "Published", "Failed"
- `post_content` or `content` or `post_body` (Long Text): Post content
- `post_title` (Single Line Text, optional): Post title
- `hashtags` (Single Line Text, optional): Hashtags
- `scheduled_time` (Date with time, optional): When to publish
- `scheduled_timezone` (Single Line Text, optional): Timezone for scheduled_time
- `brand_profile_id` (Link to BrandProfiles): Links to brand profile

**New Fields to Add:**
- `published_at` (Date with time): When content was published
- `published_url` (Single Line Text): LinkedIn post URL
- `publish_error` (Long Text): Error message if publish failed
- `publish_attempts` (Number, default 0): Number of publish attempts

## Supabase Tables

### social_connections Table

**Required Fields:**
- `user_id` (UUID): User ID
- `provider` (Text): "linkedin"
- `access_token` (Text, encrypted): LinkedIn access token
- `refresh_token` (Text, encrypted, optional): LinkedIn refresh token
- `expires_at` (Timestamp): Token expiration time
- `person_urn` (Text, optional): LinkedIn person URN (auto-fetched if missing)

## Environment Variables

```bash
# Airtable
AIRTABLE_PAT=your_airtable_personal_access_token
AIRTABLE_BASE_ID=your_base_id
AIRTABLE_CONTENTQUEUE_TABLE=ContentQueue
AIRTABLE_BRANDPROFILES_TABLE=BrandProfiles

# LinkedIn OAuth
LINKEDIN_CLIENT_ID=your_linkedin_client_id
LINKEDIN_CLIENT_SECRET=your_linkedin_client_secret
LINKEDIN_ENCRYPTION_KEY=your_32_byte_encryption_key

# Supabase
SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# Cron (optional, for authentication)
CRON_SECRET=your_cron_secret_key

# Site URL (for usage increment API)
NEXT_PUBLIC_SITE_URL=https://your-app.vercel.app
```

## Cron Job Setup

### Option 1: Vercel Cron (Recommended)

Create `vercel.json` in project root:

```json
{
  "crons": [
    {
      "path": "/api/publish/linkedin-due",
      "schedule": "*/5 * * * *"
    }
  ]
}
```

This runs every 5 minutes.

### Option 2: External Cron Service

Use a service like:
- **cron-job.org**
- **EasyCron**
- **GitHub Actions** (with scheduled workflows)

Call: `GET https://your-app.vercel.app/api/publish/linkedin-due`

If `CRON_SECRET` is set, include header:
```
Authorization: Bearer {CRON_SECRET}
```

## Publishing Flow

### 1. Content Approval
```
User clicks "Approve" 
→ PATCH /api/content/queue/{contentId}
→ Updates Airtable: status = "Ready To Publish"
→ No Make.com webhook
```

### 2. Scheduled Job
```
Cron triggers /api/publish/linkedin-due
→ Query Airtable for due content:
  - platform = "LinkedIn"
  - status = "Ready To Publish"
  - scheduled_time <= now (or null)
  - publish_attempts < 3
→ For each record:
  a) Get user_id from brand_profile_id
  b) Get LinkedIn connection from Supabase
  c) Refresh token if needed
  d) Publish to LinkedIn API
  e) Update Airtable status
  f) Increment usage
```

### 3. Publishing Logic
```
For each due content:
1. Validate content (not empty)
2. Get LinkedIn OAuth token (refresh if expired)
3. Build LinkedIn API payload:
   - Title (if provided)
   - Body content
   - Hashtags (appended at end)
4. Call LinkedIn UGC Posts API
5. On success:
   - status = "Published"
   - published_at = now
   - published_url = LinkedIn post URL
   - Increment usage
6. On failure:
   - status = "Failed" (if attempts >= 3) or "Ready To Publish"
   - publish_error = error message
   - publish_attempts += 1
```

## LinkedIn API Details

### Endpoint
```
POST https://api.linkedin.com/v2/ugcPosts
```

### Required Scopes
- `w_member_social` (for posting)

### Payload Format
```json
{
  "author": "urn:li:person:{person_id}",
  "lifecycleState": "PUBLISHED",
  "specificContent": {
    "com.linkedin.ugc.ShareContent": {
      "shareCommentary": {
        "text": "Post text with hashtags"
      },
      "shareMediaCategory": "NONE"
    }
  },
  "visibility": {
    "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC"
  }
}
```

### Response
```json
{
  "id": "urn:li:ugcPost:{post_id}"
}
```

## Error Handling

### Token Refresh Failures
- If token refresh fails, the job continues with existing token
- If token is invalid, connection is marked as failed

### Publishing Failures
- First 2 attempts: Status remains "Ready To Publish", error logged
- After 3 attempts: Status changes to "Failed"
- Error message stored in `publish_error` field

### Network Errors
- Retries are handled by the cron job (runs every 5 minutes)
- Each run attempts to publish failed content again (if attempts < 3)

## Testing

### Manual Test
```bash
curl -X GET https://your-app.vercel.app/api/publish/linkedin-due \
  -H "Authorization: Bearer {CRON_SECRET}"
```

### Expected Response
```json
{
  "ok": true,
  "processed": 5,
  "success": 4,
  "failed": 1,
  "errors": ["Record recXXX: No LinkedIn connection"]
}
```

## Monitoring

### Check Publishing Status
1. Query Airtable ContentQueue table
2. Filter by `status`:
   - "Ready To Publish": Waiting to be published
   - "Published": Successfully published
   - "Failed": Failed after 3 attempts

### Check Errors
- View `publish_error` field in Airtable
- Check Vercel function logs for detailed errors

## Future Enhancements

1. **Image Support**: Add image upload for Creator+ tier
2. **Other Platforms**: Extend pattern to X, Instagram, etc.
3. **Retry Logic**: Add exponential backoff for retries
4. **Webhooks**: Notify users when content is published
5. **Analytics**: Track publish success rates

## Troubleshooting

### Content Not Publishing
1. Check `status` in Airtable - should be "Ready To Publish"
2. Check `scheduled_time` - should be null or in the past
3. Check `publish_attempts` - should be < 3
4. Verify LinkedIn connection exists in Supabase
5. Check cron job is running (Vercel logs)

### Token Errors
1. Verify `LINKEDIN_CLIENT_ID` and `LINKEDIN_CLIENT_SECRET` are set
2. Check token expiration in Supabase `social_connections` table
3. Verify `LINKEDIN_ENCRYPTION_KEY` is correct (32 bytes)

### Airtable Errors
1. Verify all required fields exist
2. Check field names match exactly (case-sensitive)
3. Verify `brand_profile_id` is a valid link field

