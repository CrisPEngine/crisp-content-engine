# Retry Posts That Failed Due to Auth Issues

This document explains how to retry all posts that failed due to authentication issues before the automatic retry feature was implemented.

## Endpoint

**POST** `/api/publish/retry-auth-failed`

## Authentication

The endpoint requires either:
1. Admin authentication (logged in as an admin user)
2. Secret header: `x-retry-secret` matching `RETRY_FAILED_SECRET` environment variable

## What It Does

1. Finds all LinkedIn connections that are currently valid (`needs_reauth: false`)
2. For each connection, gets the brand profiles assigned to it
3. Finds all posts in Airtable that:
   - Are for LinkedIn platform
   - Belong to one of those brand profiles
   - Have status "Failed" OR (status "Ready To Publish" AND `publish_attempts >= 3`)
   - Have error messages indicating auth issues (reconnect, expired, 401, 403, REVOKED_ACCESS_TOKEN, etc.)
4. Resets those posts to "Ready To Publish" with `publish_attempts: 0`

## Usage

### Using cURL

```bash
# With admin session (requires cookie)
curl -X POST https://your-domain.com/api/publish/retry-auth-failed \
  -H "Cookie: your-session-cookie"

# With secret header
curl -X POST https://your-domain.com/api/publish/retry-auth-failed \
  -H "x-retry-secret: your-retry-secret"
```

### Using Node.js/TypeScript

```typescript
const response = await fetch('https://your-domain.com/api/publish/retry-auth-failed', {
  method: 'POST',
  headers: {
    'x-retry-secret': process.env.RETRY_FAILED_SECRET,
  },
});

const result = await response.json();
console.log(`Reset ${result.totalPostsReset} posts across ${result.connectionsProcessed} connections`);
```

## Response Format

```json
{
  "ok": true,
  "message": "Processed 5 connections, reset 12 posts",
  "connectionsProcessed": 5,
  "connectionsWithPostsReset": 3,
  "totalPostsReset": 12,
  "totalErrors": 0,
  "results": [
    {
      "connectionId": "conn-123",
      "connectionName": "John Doe",
      "brandProfileIds": ["brand-456"],
      "postsReset": 5,
      "errorCount": 0
    }
  ]
}
```

## Notes

- The endpoint processes up to 100 posts per brand profile (Airtable limit)
- Posts are reset to "Ready To Publish" with `publish_attempts: 0`
- The next cron job run will pick up these posts and attempt to publish them
- Only posts with auth-related errors are retried (not other types of failures)
- Connections without brand assignments are skipped

## Environment Variables

Make sure these are set:
- `RETRY_FAILED_SECRET` - Secret for authenticating the endpoint
- `AIRTABLE_PAT` - Airtable Personal Access Token
- `AIRTABLE_BASE_ID` - Airtable Base ID
- `AIRTABLE_CONTENTQUEUE_TABLE` - Airtable Content Queue Table ID
