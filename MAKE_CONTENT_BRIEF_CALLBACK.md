# Make.com Content Brief Callback Specification

## Standardized Callback Payload

When Make.com completes content generation for an approved content brief, it must call `/api/content/webhook` with the following payload structure:

### Success Payload

```json
{
  "mode": "content_generation",
  "trigger_type": "content_brief_approved",
  "brief_id": "recXXXXXXXXXXXX",
  "brand_profile_id": "recYYYYYYYYYYYY",
  "user_id": "uuid-here",
  "ok": true,
  "created_posts": 10,
  "created_articles": 2,
  "generated_content_ids": [
    "recContent1",
    "recContent2",
    "recContent3"
  ],
  "timestamp": "2025-01-15T10:30:00Z"
}
```

### Failure Payload

```json
{
  "mode": "content_generation",
  "trigger_type": "content_brief_approved",
  "brief_id": "recXXXXXXXXXXXX",
  "brand_profile_id": "recYYYYYYYYYYYY",
  "user_id": "uuid-here",
  "ok": false,
  "error_message": "Failed to generate content: AI service timeout",
  "status": "Failed",
  "timestamp": "2025-01-15T10:30:00Z"
}
```

## Required Fields

- **`mode`**: Must be `"content_generation"`
- **`trigger_type`**: Must be `"content_brief_approved"`
- **`brief_id`**: The Airtable record ID of the content brief (from StrategyUpdates table)
- **`brand_profile_id`**: The Airtable record ID of the brand profile
- **`user_id`**: The Supabase user ID
- **`ok`**: Boolean indicating success (`true`) or failure (`false`)

## Success-Specific Fields

- **`created_posts`**: Number of posts created (optional but recommended)
- **`created_articles`**: Number of articles created (optional but recommended)
- **`generated_content_ids`**: Array of Airtable record IDs for all created ContentQueue records (required for traceability)

## Failure-Specific Fields

- **`error_message`**: Human-readable error description (required when `ok: false`)
- **`status`**: Error status string (optional, defaults to "Failed")

## Traceability Requirement

**CRITICAL**: Make.com must write `content_brief_id = brief_id` on every ContentQueue record it creates. This enables:

1. Linking content back to the brief that generated it
2. Filtering content by brief in the dashboard
3. Deep linking from emails to specific brief-generated content

### Airtable Field

Add a `content_brief_id` field to the ContentQueue table:
- **Type**: Text (or Link to StrategyUpdates if preferred)
- **Required**: No (for backward compatibility)
- **Usage**: Set to the `brief_id` value when creating records

## Idempotency

The webhook handler is idempotent:
- Duplicate callbacks for completed briefs are ignored
- Status updates only occur if brief is not already "Generation Completed"

## Example Make.com Scenario Flow

1. Receive webhook from app with `brief_id`, `master_strategy_json`, and brief data
2. Generate content using master strategy + brief guidance
3. Create ContentQueue records with:
   - `brand_profile_id` = brief's brand_profile_id
   - `content_brief_id` = brief_id (for traceability)
   - `status` = "Needs Approval"
4. Aggregate all created record IDs into `generated_content_ids` array
5. Call `/api/content/webhook` with success payload including all IDs

## Error Handling

If content generation fails at any point:
1. Set `ok: false`
2. Include detailed `error_message`
3. Call webhook with failure payload
4. App will update brief status to "Failed" and store error message

## Retry Behavior

If Make.com scenario fails or times out:
- User can retry via `POST /api/content-brief/:id/retry`
- Only allowed if status is "Failed" or "Sent to Make" older than 30 minutes
- Retry resets brief to "Approved" and resends webhook
