# Make Automation Setup Guide

This document outlines the Make automation webhooks and integrations needed for the CrisP Content Engine.

## Overview

Make automations handle:
1. **Onboarding** - Site scraping and strategy generation
2. **Strategy Review** - Strategy approval workflow
3. **Content Generation** - AI content creation
4. **Content Publishing** - Publishing to social platforms
5. **Usage Tracking** - Post count tracking

## Webhook Endpoints

### 1. Onboarding Webhook

**Trigger:** When a new brand profile is created

**Endpoint:** `MAKE_ONBOARDING_WEBHOOK_URL`

**Payload Sent:**
```json
{
  "brand_profile_id": "recXXXXXXXXXXXXXX",
  "user_id": "uuid-here",
  "client_name": "Brand Name",
  "website": "https://example.com"
}
```

**Make Scenario Should:**
1. Receive webhook trigger
2. Fetch brand profile from Airtable using `brand_profile_id`
3. Scrape website (if provided) using web scraping module
4. Analyze brand data and generate strategy
5. Update Airtable record:
   - Set `status` to "Strategy Ready"
   - Add `strategy_content` field with generated strategy
   - Set `scraped_text` with website content
   - Set `brand_context` with summary

**Environment Variable:**
- `MAKE_ONBOARDING_WEBHOOK_URL` - Your Make webhook URL
- `MAKE_API_KEY` (optional) - For webhook authentication

---

### 2. Strategy Generation Webhook (Initial + Monthly)

**Trigger:** Shared webhook for both onboarding and monthly strategy refreshes

**Endpoint:** `MAKE_STRATEGY_WEBHOOK_URL`

**Payload Sent (Initial strategy):**
```json
{
  "mode": "initial",
  "brand_profile_id": "recXXXXXXXXXXXXXX",
  "user_id": "uuid-here",
  "brand": { "name": "Brand", "website": "https://example.com" },
  "audience": "Primary audience notes",
  "value_props": "Unique value",
  "offers": "Key offers",
  "brand_goals": "Monthly goals",
  "platforms_requested": ["LinkedIn", "X"],
  "urls_to_scrape": ["https://example.com"],
  "assets": [{ "url": "https://.../logo.png", "type": "image/png" }],
  "strategy_context": {
    "submitted_at": "2025-01-15T10:00:00Z"
  }
}
```

**Payload Sent (Monthly update):**
```json
{
  "mode": "monthly_update",
  "strategy_update_id": "recUpdate123",
  "brand_profile_id": "recXXXXXXXXXXXXXX",
  "user_id": "uuid-here",
  "monthly": {
    "objective": "Launch v2 beta",
    "themes_focus": "AI assistant, async workflows",
    "key_dates": "Demo day 12 Feb, webinar 20 Feb",
    "feedback_notes": "Leads loved testimonial posts, keep that tone",
    "content_preferences": "CTA for new waitlist",
    "monthly_cycle_start": "2025-02-01T00:00:00.000Z",
    "cycle_label": "February 2025",
    "attachments": ["https://res.cloudinary.com/.../campaign.pdf"]
  }
}
```

**Make Scenario Should:**

Route A — **Initial strategy (mode omitted or `initial`):**
1. Fetch BrandProfiles record and any referenced assets/URLs
2. Scrape websites, summarise text
3. Generate strategy JSON via OpenAI/Claude
4. Update BrandProfiles:
   - `status` → "Strategy Ready"
   - `strategy_payload`, `strategy_summary`, `strategy_meta`
5. POST callback to `/api/strategy/webhook` with mode `initial`

Route B — **Monthly update (mode = `monthly_update`):**
1. Fetch StrategyUpdates record and linked BrandProfiles row
2. Fetch latest approved strategy + ContentQueue history to avoid duplicates
3. Generate refreshed calendar using monthly instructions
4. Update StrategyUpdates:
   - `status` → "Completed"
   - `processed_at` (ISO)
   - `result_payload` (full JSON)
5. Upsert new entries in `ContentQueue` (or equivalent) and re-link to brand
6. POST callback to `/api/strategy/webhook` with mode `monthly_update`

Both flows can reuse the same scraping and AI modules—branch with a Router immediately after the webhook trigger using `{{1.mode}}`.

---

### 3. Content Publishing Webhook

**Trigger:** When content is approved and ready to publish

**Endpoint:** `MAKE_CONTENT_PUBLISH_WEBHOOK_URL` (to be created)

**Payload Sent:**
```json
{
  "content_id": "recXXXXXXXXXXXXXX",
  "brand_profile_id": "recXXXXXXXXXXXXXX",
  "platform": "LinkedIn",
  "content": "Post content here...",
  "scheduled_date": "2025-01-15T10:00:00Z",
  "user_id": "uuid-here"
}
```

**Make Scenario Should:**
1. Publish to platform (LinkedIn, X, Instagram, Facebook, Buffer)
2. Update content record:
   - Set `status` to "Published"
   - Set `published_at` timestamp
   - Store `published_url` if available
3. Call usage increment API:
   - `POST /api/usage/increment`
   - Body: `{ userId, count: 1 }`
   - Header: `x-api-key: MAKE_API_KEY`

---

### 5. Usage Increment API

**Endpoint:** `/api/usage/increment` (already exists)

**Method:** POST

**Headers:**
- `Content-Type: application/json`
- `x-api-key: MAKE_API_KEY` (optional, for authentication)

**Body:**
```json
{
  "userId": "uuid-here",
  "count": 1
}
```

**Response:**
```json
{
  "ok": true
}
```

---

## Airtable Table Structure

### BrandProfiles Table

**Key Fields:**
- `client_name` (Single line text)
- `status` (Single select) - Options: Active, New Brief, Strategy Ready, Strategy Approved, Needs Image, Needs Approval, Ready To Publish, Scheduled, Published, Error, Needs Strategy, Needs Copy, Approved, Failed, Needs Review
- `strategy_content` (Long text) - Generated strategy
- `strategy_approval` (Checkbox)
- `user_id` (Single line text) - Supabase user ID
- `platforms_requested` (Multiple select)
- `created_time` (Automatic) - Created timestamp
- `last_modified_time` (Automatic) - Last modified timestamp

### StrategyUpdates Table

**Fields:**
- `brand_profile_id` (Link to BrandProfiles)
- `user_id` (Single line text)
- `status` (Single select) – Pending, Generating, Completed, Needs Follow-up
- `cycle_label` (Single line text)
- `monthly_cycle_start` (Date)
- `objective` (Long text)
- `themes_focus` (Long text)
- `key_dates` (Long text)
- `feedback_notes` (Long text)
- `content_preferences` (Long text)
- `attachments` (Attachment)
- `result_payload` (Long text)
- `processed_at` (Date)
- `created_time` / `last_modified_time` (automatic)

### ContentQueue Table

**Suggested Fields:**
- `title` (Single line text)
- `content` (Long text)
- `platform` (Single select) - LinkedIn, X, Instagram, Facebook, Blog, Medium
- `status` (Single select) - Needs Approval, Approved, Scheduled, Published, Failed
- `scheduled_date` (Date)
- `published_at` (Date)
- `published_url` (URL)
- `brand_profile_id` (Link to BrandProfiles)
- `user_id` (Single line text)

---

## Environment Variables (Vercel)

Add these to your Vercel project settings:

### Required:
```
MAKE_ONBOARDING_WEBHOOK_URL=https://hook.make.com/your-webhook-id
MAKE_STRATEGY_WEBHOOK_URL=https://hook.make.com/your-shared-strategy-webhook
MAKE_STRATEGY_WEBHOOK_SECRET=optional-shared-secret
MAKE_CALLBACK_SECRET=shared-secret-from-make
MAKE_STRATEGY_COMPLETED_WEBHOOK_URL=https://app.crispdigital.io/api/strategy/webhook
MAKE_API_KEY=optional-key-for-auth

AIRTABLE_BASE_ID=appXXXXXXXXXXXXXX
AIRTABLE_BRANDPROFILES_TABLE=tblBrandProfiles
AIRTABLE_STRATEGYUPDATES_TABLE=tblLA25egvUOUc9zT
AIRTABLE_CONTENTQUEUE_TABLE=tblContentQueue
```

### Optional (for authentication):
```
MAKE_API_KEY=your-api-key-here
```

### Strategy Generation & Callback

```
MAKE_STRATEGY_WEBHOOK_URL=https://hook.make.com/...
MAKE_STRATEGY_WEBHOOK_SECRET=optional-shared-secret
MAKE_CALLBACK_SECRET=shared-secret-from-make
MAKE_STRATEGY_COMPLETED_WEBHOOK_URL=https://your-domain.com/api/strategy/webhook
```

### Content Generation & Publishing:
```
MAKE_CONTENT_GENERATION_WEBHOOK_URL=https://hook.make.com/...
MAKE_CONTENT_REGENERATE_WEBHOOK_URL=https://hook.make.com/...
MAKE_CONTENT_PUBLISH_WEBHOOK_URL=https://hook.make.com/...
```

---

## Make Scenario Setup Steps

### 1. Onboarding Scenario

1. **Webhook Trigger**
   - Create a webhook module
   - Copy the webhook URL to `MAKE_ONBOARDING_WEBHOOK_URL`
   - Set method to POST
   - Accept JSON payload

2. **Airtable - Get Record**
   - Get brand profile using `brand_profile_id` from webhook
   - Table: BrandProfiles

3. **Web Scraping** (if website provided)
   - Use HTTP module or web scraping tool
   - Scrape website content
   - Extract text, meta tags, etc.

4. **AI Content Generation**
   - Use OpenAI, Claude, or other AI module
   - Prompt: Generate content strategy based on brand profile
   - Input: Brand data, audience, value props, etc.

5. **Airtable - Update Record**
   - Update BrandProfiles record
   - Set `status` to "Strategy Ready"
   - Add `strategy_content` with generated strategy
   - Add `scraped_text` with website content
   - Add `brand_context` with summary

### 2. Strategy Scenario (shared webhook)

1. **Webhook Trigger**
   - Module: Custom Webhook (`MAKE_STRATEGY_WEBHOOK_URL`)
   - Receives both onboarding and monthly update payloads

2. **Router**
   - Route A filter: `{{1.mode}}` is empty OR equals `initial`
   - Route B filter: `{{1.mode}} = "monthly_update"`

3. **Route A modules (initial)**
   - Airtable: Get BrandProfiles record
   - (Optional) HTTP scrape + summarise
   - AI: Generate strategy JSON
   - Airtable: Update BrandProfiles (`status = Strategy Ready`, store JSON)
   - HTTP: POST to `/api/strategy/webhook` with mode `initial`

4. **Route B modules (monthly update)**
   - Airtable: Get StrategyUpdates record
   - Airtable: Get linked BrandProfiles + recent content (ContentQueue)
   - AI: Generate updated calendar referencing historic posts to avoid duplicates
   - Airtable: Update StrategyUpdates (`status = Completed`, `processed_at`, `result_payload`)
   - Airtable: Create/Update ContentQueue entries for new posts
   - HTTP: POST to `/api/strategy/webhook` with mode `monthly_update`

### 3. Content Generation Scenario

**Trigger:** When strategy is approved (`/api/strategy/[id]/approve`)

**Endpoint:** `MAKE_CONTENT_GENERATION_WEBHOOK_URL`

**Payload Received:**
```json
{
  "brand_profile_id": "recXXXXXXXXXXXXXX",
  "user_id": "uuid-here",
  "person_urn": "urn:li:person:123456",
  "triggered_at": "2025-01-15T10:00:00Z"
}
```

**Make Scenario Should:**
1. **Airtable - Get Brand Profile**
   - Fetch BrandProfiles record using `brand_profile_id`
   - Get approved strategy content
   - Get user's plan/package limits

2. **AI Content Generation**
   - Generate content based on:
     - Approved strategy
     - User's package limits (e.g., Creator: 10 posts/month, 8 LinkedIn + 2 blog)
     - Platform preferences
     - Brand voice and guidelines
   - Create multiple content items (posts/articles)

3. **Airtable - Create Content Queue Records**
   - Create ContentQueue records for each generated item
   - Set `status` to "Needs Approval"
   - Set `scheduled_date` based on content calendar
   - Link to `brand_profile_id` and `user_id`

4. **Status Update**
   - Update BrandProfiles `status` to "Content Ready" (optional)

**Note:** Content generation should respect package limits:
- **Creator:** 10 posts/month (8 LinkedIn auto-posts, 2 blog deliverables)
- **Growth+:** Higher limits as defined in entitlements

---

### 4. Content Regeneration Scenario

**Trigger:** When content is rejected (`/api/content/queue/[contentId]` with `action: "reject"`)

**Endpoint:** `MAKE_CONTENT_REGENERATE_WEBHOOK_URL`

**Payload Received:**
```json
{
  "content_id": "recRejected123",
  "brand_profile_id": "recXXXXXXXXXXXXXX",
  "user_id": "uuid-here",
  "rejection_feedback": "Too promotional, needs more value",
  "rejected_at": "2025-01-15T10:00:00Z"
}
```

**Make Scenario Should:**
1. **Airtable - Get Content Record**
   - Fetch ContentQueue record using `content_id`
   - Get original content details
   - Get rejection feedback

2. **Airtable - Get Brand Profile**
   - Fetch BrandProfiles to get strategy and guidelines

3. **AI Content Regeneration**
   - Regenerate content incorporating:
     - Rejection feedback
     - Original requirements
     - Strategy guidelines
   - Ensure it still fits within package limits

4. **Airtable - Update Content Queue**
   - Update the rejected content record OR create new replacement
   - Set `status` to "Needs Approval"
   - Add `revision_notes` with feedback incorporation

**Important:** Regeneration should not exceed package limits. If user has already used their quota, show appropriate message.

---

### 5. Content Publishing Scenario

**Trigger:** When content is approved (`/api/content/queue/[contentId]` with `action: "approve"`)

**Endpoint:** `MAKE_CONTENT_PUBLISH_WEBHOOK_URL` (optional - can be triggered directly from Make polling)

**Payload Received (if webhook used):**
```json
{
  "content_id": "recApproved123",
  "brand_profile_id": "recXXXXXXXXXXXXXX",
  "user_id": "uuid-here",
  "platform": "LinkedIn",
  "content": "Post content here...",
  "scheduled_date": "2025-01-20T10:00:00Z",
  "person_urn": "urn:li:person:123456"
}
```

**Make Scenario Should:**
1. **Get LinkedIn Credentials**
   - HTTP: GET `/api/social/linkedin/credentials`
   - Headers: `x-api-key: MAKE_API_KEY`
   - Returns: `accessToken`, `personUrn`, `expiresAt`

2. **Platform Publishing**
   - **LinkedIn:** Use LinkedIn Marketing API
     - POST to `https://api.linkedin.com/v2/ugcPosts`
     - Include access token, person URN, content
   - **Other platforms:** Use respective APIs
     - X (Twitter) API
     - Instagram API
     - Facebook API
     - Buffer API (for multi-platform)

3. **Airtable - Update Record**
   - Update ContentQueue record
   - Set `status` to "Published"
   - Set `published_at` timestamp
   - Store `published_url` from platform response

4. **Usage Tracking**
   - HTTP module: POST to `/api/usage/increment`
   - Headers: `x-api-key: MAKE_API_KEY` (if configured)
   - Body: `{ userId, count: 1 }`

**Note:** Publishing should respect scheduled dates. If `scheduled_date` is in the future, use a scheduler or delay execution.

---

## Social Media Account Connections

### When to Connect

**Recommended Flow:**
1. User completes onboarding → Brand profile created
2. AI generates strategy → User reviews and approves
3. **After strategy approval** → Prompt user to connect social accounts
4. User connects accounts → Content generation begins
5. Content is created → User approves → Content is published

### OAuth Implementation

For each platform, you'll need:

1. **OAuth App Setup** (in platform developer console)
2. **OAuth Flow:**
   - Redirect to platform OAuth URL
   - Handle callback
   - Store access tokens securely
   - Link to user account

3. **Storage:**
   - Store in Airtable `SocialConnections` table
   - Or in Supabase `social_connections` table
   - Fields: `platform`, `access_token`, `refresh_token`, `account_name`, `user_id`

### Platform-Specific Notes

- **LinkedIn:** Requires OAuth 2.0, API access
- **X (Twitter):** Requires OAuth 1.0a or 2.0, API v2
- **Instagram:** Requires Facebook Graph API (Instagram Business Account)
- **Facebook:** Requires Facebook Graph API
- **Buffer:** Uses Buffer API with OAuth

---

## Next Steps

1. **Create Make Scenarios:**
   - Onboarding webhook scenario
   - Strategy approval scenario
   - Content generation scenario
   - Content publishing scenario

2. **Set Up Webhook URLs:**
   - Copy webhook URLs from Make
   - Add to Vercel environment variables

3. **Test Integration:**
   - Submit onboarding form
   - Verify webhook is triggered
   - Check Airtable record is updated

4. **Implement OAuth:**
   - Set up OAuth apps for each platform
   - Create connection pages
   - Store tokens securely

5. **Create Content Table:**
   - Add ContentPosts table to Airtable
   - Set up fields and relationships

---

## Testing Checklist

- [ ] Onboarding webhook receives payload
- [ ] Airtable record is created correctly
- [ ] Strategy is generated and saved
- [ ] Status updates correctly
- [ ] Content generation triggers
- [ ] Content publishing works
- [ ] Usage tracking increments correctly
- [ ] Social connections are stored
- [ ] OAuth flows work for each platform

---

## Support

For Make-specific questions, refer to:
- [Make Documentation](https://www.make.com/en/help)
- [Make Community](https://community.make.com/)

For API integration questions, check:
- Platform API documentation (LinkedIn, X, Instagram, Facebook)
- Buffer API documentation

# LinkedIn Publishing

We support publishing directly to LinkedIn using LinkedIn's "Share on LinkedIn" product [[docs](https://learn.microsoft.com/en-gb/linkedin/consumer/integrations/self-serve/share-on-linkedin)].

## LinkedIn OAuth Setup

1. In the LinkedIn Developer Portal, add the **Share on LinkedIn** product to the CrisP Digital application. This grants the `w_member_social` scope required to create posts.
2. Configure the OAuth callback: `https://app.crispdigital.io/api/connections/linkedin/callback`.
3. Capture the client credentials and add them to Vercel:

```
LINKEDIN_CLIENT_ID=your-app-client-id
LINKEDIN_CLIENT_SECRET=your-app-client-secret
LINKEDIN_REDIRECT_URI=https://app.crispdigital.io/api/connections/linkedin/callback
LINKEDIN_ENCRYPTION_KEY=base64-encoded-32-byte-secret
```

Generate the encryption key once, e.g. `openssl rand -base64 32`.

## Database (Supabase)

Create the table that stores encrypted connection data:

```sql
create table if not exists public.social_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null,
  access_token text,
  refresh_token text,
  expires_at timestamptz,
  person_urn text,
  account_name text,
  account_avatar text,
  metadata jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (user_id, provider)
);
```

RLS can remain disabled for this table because all access flows through server-side service role queries.

## App Flow

- The `/connections` page now lets members connect or disconnect their LinkedIn account.
- `/api/connections/linkedin/authorize` sends the member to the LinkedIn consent screen (scopes: `w_member_social`, `openid`, `profile`, `email`). Note: `r_liteprofile` is deprecated and has been removed.
- `/api/connections/linkedin/callback` exchanges the code, encrypts tokens, fetches the member URN, and stores account metadata.
- `/api/connections/linkedin/status` returns connection status for the signed-in member.
- `/api/connections/linkedin/disconnect` removes stored tokens.
- `/api/social/linkedin/credentials` is a secure automation endpoint that returns a fresh access token + person URN when Make provides `x-api-key: MAKE_API_KEY`.

## Make Scenario Steps

1. **Fetch LinkedIn credentials**
   - HTTP module → `GET https://app.crispdigital.io/api/social/linkedin/credentials?userId={{user_id}}`
   - Headers: `x-api-key: {{MAKE_API_KEY}}`
   - Response includes `accessToken`, `personUrn`, `accountName`, `expiresAt`.

2. **Optional: Upload images** (if your post includes creatives)
   - Register asset: `POST https://api.linkedin.com/v2/assets?action=registerUpload`
   - Upload binary to returned `uploadUrl`.

3. **Create the share**
   - `POST https://api.linkedin.com/v2/ugcPosts`
   - Headers: `Authorization: Bearer {{accessToken}}`, `X-Restli-Protocol-Version: 2.0.0`, `Content-Type: application/json`
   - Body structure:

```json
{
  "author": "{{personUrn}}",
  "lifecycleState": "PUBLISHED",
  "specificContent": {
    "com.linkedin.ugc.ShareContent": {
      "shareCommentary": { "text": "Post copy" },
      "shareMediaCategory": "ARTICLE",
      "media": [
        {
          "status": "READY",
          "originalUrl": "https://app.crispdigital.io/blog/...",
          "title": { "text": "Title" },
          "description": { "text": "Description" }
        }
      ]
    }
  },
  "visibility": {
    "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC"
  }
}
```

4. **Record success**
   - The response includes the new post URN in the `X-RestLi-Id` header. Update Airtable/Supabase via existing admin routes and call `/api/usage/increment` so entitlements remain accurate.

5. **Error handling**
   - If credentials route returns 401/404, notify the user to reconnect.
   - If LinkedIn returns 401/403, the refresh token might be invalid—ask the user to reconnect.
   - Respect LinkedIn rate limits: 150 requests/member/day, 100k requests/app/day.

## User Checklist

- [ ] Add LinkedIn client credentials and encryption key to Vercel.
- [ ] Run the SQL migration to create `social_connections`.
- [ ] Re-deploy the app (connections page + API routes are live).
- [ ] Connect LinkedIn via `/connections` as a test user.
- [ ] Update Make scenario to fetch credentials and publish using the LinkedIn UGC API.

