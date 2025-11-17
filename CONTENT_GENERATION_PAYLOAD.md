# Content Generation Webhook Payload

## Endpoint
`MAKE_CONTENT_GENERATION_WEBHOOK_URL`

## Trigger
When a user approves their strategy via `/api/strategy/[id]/approve`

## Payload Structure

```json
{
  "brand_profile_id": "recXXXXXXXXXXXXXX",
  "user_id": "959656d4-b1c2-4d21-bd46-f89f3f41bb0f",
  "person_urn": "urn:li:person:123456789",
  "brand_type": "personal",
  "strategy_json": "{...full strategy JSON from ChatGPT...}",
  "strategy_summary": "📌 Your go-to expert for AI-powered digital marketing...",
  "triggered_at": "2025-11-17T10:05:18.754Z"
}
```

## Field Descriptions

### Required Fields

- **`brand_profile_id`** (string): Airtable record ID of the BrandProfiles record
- **`user_id`** (string): Supabase user ID
- **`person_urn`** (string): LinkedIn person URN for posting (format: `urn:li:person:123456789`)
- **`brand_type`** (string): Either `"personal"` or `"company"` - used by AI to craft appropriate content
- **`triggered_at`** (string): ISO 8601 timestamp when content generation was triggered

### Optional Fields

- **`strategy_json`** (string | object): Full strategy JSON from ChatGPT (stored in Airtable `strategy_json` field)
- **`strategy_summary`** (string): Human-readable strategy summary (stored in Airtable `strategy_summary` field)

## Make Scenario Instructions

### 1. Receive Webhook
- Module: Custom Webhook
- URL: `MAKE_CONTENT_GENERATION_WEBHOOK_URL`
- Method: POST
- Headers: Optional `x-make-secret` for authentication

### 2. Get Brand Profile from Airtable
- Module: Airtable - Get a Record
- Table: BrandProfiles (use `{{1.brand_profile_id}}`)
- Retrieve:
  - `strategy_json` (if not provided in webhook)
  - `strategy_summary` (if not provided in webhook)
  - `platforms_requested` (array of platforms)
  - `client_name`
  - `timezone`
  - `language_region`
  - Any other brand details needed

### 3. Get User Package/Limits
- Module: HTTP - Make a Request (to your app) OR Airtable lookup
- Get user's subscription plan and content limits
- Example limits:
  - **Creator:** 10 posts/month (8 LinkedIn auto-posts, 2 blog deliverables)
  - **Growth:** Higher limits
  - **Pro/Scale:** Even higher limits

### 4. Parse Strategy JSON
- Module: JSON - Parse JSON
- Parse `{{1.strategy_json}}` or `{{2.fields.strategy_json}}`
- Extract:
  - Content pillars
  - Posting cadence
  - Content mix percentages
  - Voice guidelines
  - Hashtag buckets
  - Platform preferences

### 5. Generate Content
- Module: OpenAI (ChatGPT)
- Use strategy JSON + brand_type to generate content
- **Important:** Use `brand_type` to adjust prompts:
  - **Personal brands:** More first-person, personal stories, expertise sharing
  - **Company brands:** More brand-focused, product/service oriented
- Generate content for each platform in `platforms_requested`
- Respect package limits (don't generate more than allowed)

### 6. Create Content Queue Records
- Module: Airtable - Create Records (in batch)
- Table: ContentQueue
- For each generated content item, create a record with:
  - `brand_profile_id`: Link to BrandProfiles
  - `user_id`: User ID
  - `platform`: Platform name (LinkedIn, X, Blog, etc.)
  - `post_title`: Title/subject
  - `post_content`: Full content text
  - `scheduled_date`: Calculated based on cadence
  - `status`: "Needs Approval"
  - `content_type`: "post", "article", etc.
  - Any other required fields

### 7. Optional: Update Brand Profile Status
- Module: Airtable - Update a Record
- Table: BrandProfiles
- Update `status` to "Content Ready" (optional)

## Example Payload (for testing)

```json
{
  "brand_profile_id": "recSrgM0FSPu6uZfZ",
  "user_id": "959656d4-b1c2-4d21-bd46-f89f3f41bb0f",
  "person_urn": "urn:li:person:ABC123",
  "brand_type": "personal",
  "strategy_json": "{\"brand_understanding\":{\"summary\":\"...\"},\"pillars\":[...],\"cadence\":{\"LinkedIn\":\"3 times a week\"}}",
  "strategy_summary": "📌 Expert in AI-driven digital marketing...",
  "triggered_at": "2025-11-17T10:05:18.754Z"
}
```

## Notes

- The `brand_type` field is critical for AI to generate appropriate content tone and style
- `strategy_json` contains the full structured strategy (use for detailed content generation)
- `strategy_summary` is human-readable (use for quick reference)
- Content should respect the user's package limits
- All generated content should be created in ContentQueue with status "Needs Approval"

