# Publishing Status and Requirements

**Date:** 2026-01-21  
**Status:** LinkedIn ✅ | X/Meta ⏳ Needs Buffer Integration

---

## Current Publishing Infrastructure

### ✅ LinkedIn (Fully Implemented)

**Publishing Method:** Direct API integration (native)

**How it works:**
1. User approves content → Status changes to `"Ready To Publish"`
2. **Cron job** runs `/api/publish/linkedin-due` every 5-10 minutes
3. Job queries Airtable for LinkedIn content that's due (scheduled_time ≤ now or null)
4. For each post:
   - Gets LinkedIn OAuth connection from Supabase `social_connections` table
   - Refreshes token if expired (automatic)
   - Publishes directly to **LinkedIn UGC API** (`POST /v2/ugcPosts`)
   - Updates Airtable: `status="Published"`, `published_at`, `published_url`
   - Increments usage counter

**Requirements:**
- ✅ LinkedIn OAuth connection (already working)
- ✅ `social_connections` table with encrypted tokens
- ✅ Publishing library: `src/lib/linkedin/publish.ts`
- ✅ Scheduled job: `src/app/api/publish/linkedin-due/route.ts`
- ✅ Cron job configured (Vercel cron or external)

**Connection types:**
- `member` - Personal LinkedIn profile (person_urn)
- `organization` - Company page (organization_urn)

Both are supported and brand-assignable.

---

## ⏳ X (Twitter) - Needs Buffer Integration

**Current Status:** Export-only

**Why Buffer?**
- X API v2 requires **elevated access** ($100/month minimum for write access)
- Free tier is **read-only** (cannot publish tweets)
- **Buffer** provides an affordable intermediary with X publishing included

**What's needed:**

### 1. Buffer Account & Connection
- Sign up for Buffer (Business plan or higher recommended for multi-channel)
- Connect your X account(s) to Buffer
- Get Buffer API credentials

### 2. Buffer OAuth Integration
Similar to LinkedIn OAuth, we need:
- **Provider**: `buffer` in `social_connections` table
- **OAuth flow**: `/api/connections/buffer/authorize` + `/api/connections/buffer/callback`
- **Scopes**: Buffer API access
- **Token storage**: Encrypted in Supabase `social_connections`

### 3. Buffer Profile Assignment
Buffer uses "profiles" (one per connected social account):
- User connects Buffer account via OAuth
- App fetches user's Buffer profiles (GET `/profiles.json`)
- User assigns which Buffer X profile to use for each brand
- Store `buffer_profile_id` in connection metadata or brand settings

### 4. Publishing Endpoint
Create: `src/app/api/publish/x-due/route.ts`
- Query Airtable for X content (status="Ready To Publish", scheduled_time ≤ now)
- For each post:
  - Get Buffer connection for user/brand
  - Call **Buffer API**: `POST /updates/create.json`
  - Payload:
    ```json
    {
      "text": "Tweet text with hashtags",
      "profile_ids": ["buffer_profile_id"],
      "scheduled_at": "2026-01-21T12:00:00Z", // or null for immediate
      "shorten": false
    }
    ```
  - Update Airtable on success/failure

### 5. Cron Job
Add to `vercel.json` or external cron:
```json
{
  "path": "/api/publish/x-due",
  "schedule": "*/5 * * * *"
}
```

### 6. X Thread Handling
**V1 Limitation:** X threads are **export-only** (no Buffer API support for threads).

**Workaround:**
- App generates threads and shows them in approval queue
- User manually copies and posts as thread on X
- Buffer doesn't support creating threads via API yet

**Future:** If Buffer adds thread API support, update `src/app/api/publish/x-due/route.ts` to handle `post_type="thread"`.

---

## ⏳ Instagram & Facebook (Meta) - Needs Buffer Integration

**Current Status:** Export-only

**Why Buffer?**
- Meta API requires **Instagram Business** or **Creator** accounts (not personal)
- Meta API has complex requirements (Graph API, app review, permissions)
- **Buffer** simplifies this with one connection for both Instagram + Facebook

**What's needed:**

### Same as X (above), but:

1. **Buffer profiles**: User assigns which Buffer Instagram/Facebook profiles to use
2. **Publishing endpoints**:
   - `src/app/api/publish/instagram-due/route.ts`
   - `src/app/api/publish/facebook-due/route.ts`
3. **Buffer API**: Same `POST /updates/create.json` endpoint
   - Specify the Instagram or Facebook `profile_id`
4. **Image handling**: Buffer supports image URLs in payload:
   ```json
   {
     "text": "Caption with hashtags",
     "profile_ids": ["instagram_profile_id"],
     "media": {
       "photo": "https://your-cdn.com/image.jpg"
     },
     "scheduled_at": "2026-01-21T12:00:00Z"
   }
   ```

---

## 📝 Blog - Export-Only (By Design)

**Current Status:** Export-only

**Why:**
- No standard API for blog platforms (WordPress, Medium, Ghost, Webflow, etc.)
- Each platform has different APIs and requirements
- Most users prefer manual control over blog publishing

**User experience:**
1. App generates long-form blog content
2. User copies content from approval queue
3. User pastes into their blog platform manually
4. Status remains "Needs Approval" (not published via app)

**Future:** Could add WordPress API integration, Medium API, etc. as optional add-ons.

---

## Implementation Roadmap: Buffer Integration

### Phase 1: Buffer OAuth Connection (Required First)

**Files to create:**
1. `src/app/api/connections/buffer/authorize/route.ts` - Initiates OAuth flow
2. `src/app/api/connections/buffer/callback/route.ts` - Handles OAuth callback
3. `src/lib/buffer/client.ts` - Buffer API client library

**Database:**
- `social_connections` table already supports multiple providers
- Add `provider='buffer'` rows
- Store access_token (encrypted), refresh_token, expires_at
- Store buffer_profile_id in metadata or connection_type

**UI:**
- Add Buffer connection card to `/connections` page
- Show connected Buffer profiles (X, Instagram, Facebook)
- Allow brand assignment per profile

### Phase 2: Publishing Endpoints

**Files to create:**
1. `src/app/api/publish/x-due/route.ts`
2. `src/app/api/publish/instagram-due/route.ts`
3. `src/app/api/publish/facebook-due/route.ts`

**Pattern (same as LinkedIn):**
- Query Airtable for due content (platform + status + scheduled_time)
- Get Buffer connection for user/brand
- Call Buffer API to create update
- Update Airtable status (Published/Failed)
- Increment usage

### Phase 3: Cron Jobs

Add to `vercel.json`:
```json
{
  "crons": [
    {
      "path": "/api/publish/linkedin-due",
      "schedule": "*/5 * * * *"
    },
    {
      "path": "/api/publish/x-due",
      "schedule": "*/5 * * * *"
    },
    {
      "path": "/api/publish/instagram-due",
      "schedule": "*/5 * * * *"
    },
    {
      "path": "/api/publish/facebook-due",
      "schedule": "*/5 * * * *"
    }
  ]
}
```

Or use external cron service for more frequent runs (every 1-2 minutes).

---

## Buffer API Reference

### Authentication
- **OAuth 2.0** flow (similar to LinkedIn)
- **Scopes**: Full access to manage updates
- **Token storage**: Encrypted in Supabase (same as LinkedIn)

### Key Endpoints

#### 1. Get User Info
```
GET https://api.bufferapp.com/1/user.json?access_token={token}
```

#### 2. Get Profiles (Connected Social Accounts)
```
GET https://api.bufferapp.com/1/profiles.json?access_token={token}
```

Response:
```json
[
  {
    "id": "buffer_profile_id",
    "service": "twitter", // or "instagram", "facebook"
    "service_username": "@username",
    "formatted_service": "Twitter",
    "avatar": "https://..."
  }
]
```

#### 3. Create Update (Publish or Schedule)
```
POST https://api.bufferapp.com/1/updates/create.json
```

Payload:
```json
{
  "text": "Tweet text or caption",
  "profile_ids": ["buffer_profile_id"],
  "scheduled_at": "2026-01-21T12:00:00Z", // Optional - null/omit for immediate
  "media": {
    "photo": "https://image-url.com/image.jpg" // Optional
  },
  "shorten": false
}
```

Response:
```json
{
  "success": true,
  "updates": [
    {
      "id": "buffer_update_id",
      "status": "buffer",
      "due_at": 1706961600
    }
  ]
}
```

#### 4. Get Update Status
```
GET https://api.bufferapp.com/1/updates/{update_id}.json?access_token={token}
```

---

## What You Need To Do Now

### For X, Instagram, Facebook Publishing:

1. **Sign up for Buffer** (if you don't have an account)
   - Business plan recommended ($60-$120/month depending on profiles)
   - Connect your X, Instagram, and Facebook accounts in Buffer

2. **Get Buffer API credentials**
   - Go to Buffer Dashboard → Settings → Developers
   - Create a new OAuth app
   - Get Client ID and Client Secret
   - Set redirect URL: `https://app.crispdigital.io/api/connections/buffer/callback`

3. **Add environment variables**
   ```bash
   BUFFER_CLIENT_ID=your_buffer_client_id
   BUFFER_CLIENT_SECRET=your_buffer_client_secret
   ```

4. **Request Buffer OAuth implementation**
   - I can build the OAuth flow (similar to LinkedIn)
   - Add Buffer connection to `/connections` page
   - Store encrypted tokens in Supabase
   - Map Buffer profiles to brands

5. **Request publishing endpoints**
   - I can build X/Instagram/Facebook publishing cron jobs
   - Follow same pattern as LinkedIn
   - Use Buffer API instead of native APIs

---

## Alternative: Third-Party Publishing Services

If you don't want to use Buffer, alternatives include:

### 1. **Hootsuite** (similar to Buffer)
- Supports X, Instagram, Facebook, LinkedIn
- Has API for programmatic publishing
- More expensive ($99+/month)

### 2. **Direct API Integration** (complex)
- **X API**: Requires elevated access ($100/month minimum for write)
- **Meta API**: Requires Business/Creator account, app review, complex setup
- **More work** to maintain, refresh tokens, handle errors

### 3. **Manual Copy/Paste** (current state)
- Free, but manual
- App generates content, user copies to each platform
- No automation

---

## Recommendation

**Use Buffer for X/Instagram/Facebook** because:
1. ✅ Much cheaper than X elevated API ($60-120/month vs $100+/month for X alone)
2. ✅ Covers all three platforms in one integration
3. ✅ Same OAuth pattern as LinkedIn (I can build this quickly)
4. ✅ Handles token refresh, rate limits, errors automatically
5. ✅ Scheduling built-in (Buffer queues posts for you)
6. ✅ No complex app review processes (Meta API pain)

**Steps:**
1. Get Buffer account + API credentials (you do this)
2. I build Buffer OAuth flow + publishing endpoints (30-60 min work)
3. You connect Buffer, assign profiles to brands
4. Publishing works automatically for X/Instagram/Facebook

---

## Summary

| Platform | Publishing Method | Status | Requirements |
|----------|------------------|--------|--------------|
| **LinkedIn** | Native API (direct) | ✅ Live | OAuth connection (working) |
| **X** | Buffer API | ⏳ Needs setup | Buffer OAuth + profiles |
| **Instagram** | Buffer API | ⏳ Needs setup | Buffer OAuth + profiles |
| **Facebook** | Buffer API | ⏳ Needs setup | Buffer OAuth + profiles |
| **Blog** | Manual export | ✅ By design | Copy/paste to blog platform |

**Next action:** Get Buffer API credentials, then I'll build the integration.
