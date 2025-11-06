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
   - Set `status` to "Strategy Ready (Awaiting Approval)"
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
- `status` (Single select) - Options: Active, New Brief, Strategy Ready (Awaiting Approval), Strategy Approved, Needs Image, Needs Approval, Ready To Publish, Scheduled, Published, Error, Needs Strategy, Needs Copy, Approved, Failed, Needs Review
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
   - Set `status` to "Strategy Ready (Awaiting Approval)"
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

