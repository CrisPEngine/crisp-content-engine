# Content Auto-Publish Deadline Setup

## Overview

When content is created in Airtable (via Make.com webhooks or other sources), the `auto_publish_deadline` field should be set to enable automatic publishing after 48 hours if not manually approved.

## Required Field

**Airtable Field**: `auto_publish_deadline`
- **Type**: Date/Time
- **Format**: ISO 8601 (e.g., `2024-03-15T10:30:00.000Z`)
- **Purpose**: When content status is "Needs Approval" and this deadline passes, it will be auto-approved and set to "Ready To Publish"

## Implementation

### Option 1: Set in Make.com Webhook

When your Make.com scenario creates content in Airtable, add this field:

```json
{
  "fields": {
    "status": "Needs Approval",
    "auto_publish_deadline": "{{formatDate(addDays(now(), 2), 'YYYY-MM-DDTHH:mm:ss.SSS[Z]')}}",
    // ... other fields
  }
}
```

### Option 2: Set via API After Creation

If content is created without the deadline, you can update it via Airtable API:

```javascript
// Calculate deadline: 48 hours from now
const deadline = new Date();
deadline.setHours(deadline.getHours() + 48);

// Update Airtable record
await fetch(`https://api.airtable.com/v0/${BASE_ID}/${TABLE_ID}/${recordId}`, {
  method: 'PATCH',
  headers: {
    Authorization: `Bearer ${AIRTABLE_TOKEN}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    fields: {
      auto_publish_deadline: deadline.toISOString(),
    },
  }),
});
```

### Option 3: Default in Airtable Formula

You can set a default value in Airtable using a formula field (though this won't work for filtering, so a regular date field is preferred):

```
DATEADD({created_time}, 2, 'days')
```

## Auto-Publish Job Behavior

The `/api/email/content-auto-publish` cron job:
1. Queries Airtable for content with `status = "Needs Approval"`
2. Filters records where `auto_publish_deadline <= now()`
3. Updates status to `"Ready To Publish"`
4. Sends summary email to user

## Notes

- If `auto_publish_deadline` is not set, content will not be auto-published
- The deadline is checked every hour by the cron job
- Content is only auto-published if status is still "Needs Approval" at deadline time
- Users receive an email notification when content is auto-published


