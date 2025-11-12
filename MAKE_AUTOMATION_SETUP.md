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

### 2. Strategy Approval Webhook

**Trigger:** When user approves strategy

**Endpoint:** `MAKE_STRATEGY_APPROVED_WEBHOOK_URL` (to be created)

**Payload Sent:**
```json
{
  "brand_profile_id": "recXXXXXXXXXXXXXX",
  "user_id": "uuid-here",
  "strategy_approved": true,
  "approved_at": "2025-01-15T10:00:00Z"
}
```

**Make Scenario Should:**
1. Receive webhook trigger
2. Update Airtable record:
   - Set `status` to "Strategy Approved"
   - Set `strategy_approval` to `true`
   - Set `strategy_approved_at` timestamp
3. Begin content generation workflow:
   - Generate initial content batch
   - Create content records in Airtable
   - Set content `status` to "Needs Approval"

---

### 3. Content Generation Webhook

**Trigger:** When content needs to be generated

**Endpoint:** `MAKE_CONTENT_GENERATION_WEBHOOK_URL` (to be created)

**Payload Sent:**
```json
{
  "brand_profile_id": "recXXXXXXXXXXXXXX",
  "content_count": 10,
  "platforms": ["LinkedIn", "X"],
  "content_type": "posts"
}
```

**Make Scenario Should:**
1. Fetch brand profile and strategy from Airtable
2. Generate content using AI (OpenAI, Claude, etc.)
3. Create content records in Airtable:
   - `title`, `content`, `platform`, `scheduled_date`
   - Set `status` to "Needs Approval"
   - Link to `brand_profile_id`

---

### 4. Content Publishing Webhook

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

### ContentPosts Table (to be created)

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

### Future Webhooks (to be created):
```
MAKE_STRATEGY_APPROVED_WEBHOOK_URL=https://hook.make.com/...
MAKE_CONTENT_GENERATION_WEBHOOK_URL=https://hook.make.com/...
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

### 2. Strategy Approval Scenario

1. **Webhook Trigger** (to be created)
   - Receive approval notification
   - Get `brand_profile_id` from payload

2. **Airtable - Update Record**
   - Update BrandProfiles record
   - Set `status` to "Strategy Approved"
   - Set `strategy_approval` to `true`

3. **Trigger Content Generation**
   - Call content generation webhook
   - Or start content generation workflow

### 3. Content Publishing Scenario

1. **Webhook Trigger** (to be created)
   - Receive content to publish
   - Get platform, content, scheduled_date

2. **Platform Publishing**
   - Use platform-specific modules:
     - LinkedIn API
     - X (Twitter) API
     - Instagram API
     - Facebook API
     - Buffer API

3. **Airtable - Update Record**
   - Update ContentPosts record
   - Set `status` to "Published"
   - Set `published_at` timestamp
   - Store `published_url`

4. **Usage Tracking**
   - HTTP module: POST to `/api/usage/increment`
   - Include `x-api-key` header if configured
   - Body: `{ userId, count: 1 }`

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
- `/api/connections/linkedin/authorize` sends the member to the LinkedIn consent screen (scopes: `r_liteprofile`, `w_member_social`, `openid`, `profile`, `email`).
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

