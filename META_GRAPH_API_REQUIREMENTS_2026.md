# Meta Graph API Requirements for 2026

## Overview
This document outlines the current (2026) Meta Graph API requirements for publishing content to Facebook Pages and Instagram, including permissions, app review requirements, token management, and scheduling capabilities.

---

## Canonical Documentation URLs

### Facebook Pages API
- **Page Feed Endpoint**: https://developers.facebook.com/docs/graph-api/reference/page/feed/
- **Page Scheduled Posts**: https://developers.facebook.com/docs/graph-api/reference/page/scheduled_posts/
- **Posts API Overview**: https://developers.facebook.com/docs/pages-api/posts/
- **Pages API Getting Started**: https://developers.facebook.com/docs/pages-api/getting-started/

### Instagram Graph API
- **Content Publishing Guide**: https://developers.facebook.com/docs/instagram-platform/content-publishing/
- **IG User Media Publish**: https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-user/media_publish/
- **IG Container Reference**: https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-container/
- **Instagram API with Facebook Login**: https://developers.facebook.com/docs/instagram-platform/instagram-api-with-facebook-login/content-publishing/

### Permissions & App Review
- **App Review Overview**: https://developers.facebook.com/docs/resp-plat-initiatives/individual-processes/app-review/
- **App Review Submission Guide**: https://developers.facebook.com/docs/resp-plat-initiatives/individual-processes/app-review/submission-guide/
- **App Review FAQs**: https://developers.facebook.com/docs/resp-plat-initiatives/individual-processes/app-review/AR-FAQs/
- **Data Use Checkup**: https://developers.facebook.com/docs/development/maintaining-data-access/data-use-checkup/
- **Permissions Reference**: https://developers.facebook.com/docs/permissions/reference/

### Token Management
- **Access Tokens Overview**: https://developers.facebook.com/docs/facebook-login/guides/access-tokens/
- **Long-Lived Tokens**: https://developers.facebook.com/docs/facebook-login/guides/access-tokens/get-long-lived/
- **Page Access Tokens**: https://developers.facebook.com/docs/business-sdk/common-scenarios/token-switch/
- **System User Tokens**: https://developers.facebook.com/docs/marketing-api/system-users/guides/api-calls/

---

## Recommended Permission Set for Phase 1

### Facebook Pages Publishing
**Required Permissions:**
- `pages_manage_posts` - Create and manage posts on Pages
- `pages_read_engagement` - Read Page engagement data
- `pages_show_list` - Show list of Pages user manages
- `pages_read_user_content` - Read user content on Pages (for reading feed)

**Optional but Recommended:**
- `pages_manage_engagement` - Manage comments and engagement
- `publish_video` - Required if publishing video content

**Page Tasks Required:**
- `CREATE_CONTENT` - User must be able to perform this task on the Page

### Instagram Content Publishing
**Required Permissions:**
- `instagram_basic` - Basic Instagram account information
- `instagram_content_publish` - Publish content to Instagram

**If using Facebook Login (recommended for Pages integration):**
- Uses Facebook Page access token
- Requires Standard or Advanced Access levels
- Host: `graph.facebook.com` and `rupload.facebook.com` (for resumable video uploads)

**If using Instagram Login:**
- Uses Instagram User access token
- Host: `graph.instagram.com`

**Additional Requirements:**
- Instagram professional account connected to a Facebook Page
- Page Publishing Authorization (PPA) may be required
- Business roles: `CREATE_CONTENT`, `MANAGE`, or `MODERATE` tasks on the Page

---

## Key Gotchas for App Review

### 1. App Review Requirements
**When Required:**
- App Review is **mandatory** if your app will be used by anyone without a role on the app or in the associated Business
- If app is only used by team members with app roles, App Review is **not required**

**Critical Submission Requirements:**
- ✅ App must be **publicly accessible** OR you must provide test access instructions
- ✅ **1024x1024 app icon** required
- ✅ **At least one successful API call** using each requested permission within 30 days of submission
- ✅ **High-resolution screen recordings (1080p or better)** demonstrating how each permission and feature is used
- ✅ **English UI language** or captions/tooltips explaining functionality
- ✅ Screen recordings must show **users granting permissions**

**⚠️ Critical:** Any requested permission or feature **lacking a screen recording will not be approved**

### 2. Business Verification
- **Separate process** from App Review
- May be required depending on your app's nature
- Required documentation:
  - Legal business name, address, phone
  - Utility bills, licenses, certificates of formation
- **One-time process** per Business Manager entity
- Verification typically takes a few days (depends on documentation quality)

### 3. Data Use Checkup (DUC)
- **Annual assessment** required for apps with:
  - Apps published live with a use case
  - Apps with advanced access to any permissions or features
  - Apps in Live mode (not required in Development mode)
- **Not required** for apps with only Standard Access
- Must certify compliance with Meta Platform Terms and Developer Policies
- Must answer questions about data handling practices
- Must provide testing instructions

**Timeline:** DUC is separate from App Review - App Review is initial approval, DUC is ongoing annual verification

### 4. Testing Requirements
- Meta **will test your app** to verify it actually uses requested permissions
- If Meta cannot test your app, **entire submission will be rejected**
- If Meta can test but cannot verify specific permission usage, **that permission will not be approved**

### 5. Timeline Expectations
- App Review process may take **several weeks**
- Permission review may require **several weeks**
- Plan for **4-8 weeks** total timeline for App Review approval

### 6. Page Publishing Authorization (PPA)
- May be required for Pages connected to Instagram accounts
- Must be completed before Instagram publishing will work
- Check PPA status before attempting to publish

---

## Token Management & Best Practices

### Token Types

**1. User Access Tokens**
- Short-lived (expire in hours)
- Can be exchanged for long-lived tokens (60 days)
- Required for initial authentication

**2. Page Access Tokens**
- **Valid for only 1 hour** when obtained directly
- Can be obtained via System User tokens for longer-term access
- Required for all Page API operations

**3. Long-Lived User Access Tokens**
- Last approximately **60 days**
- Exchange short-lived token via `GET oauth/access_token` endpoint
- Native mobile apps using Facebook SDKs automatically get long-lived tokens that refresh daily

**4. System User Access Tokens**
- **Non-expiring** (higher security risk if leaked) OR
- **Expiring** (60 days, recommended for security)
- Designed for automated, unattended operations
- Can be used to programmatically retrieve Page access tokens via `/me/accounts` endpoint

### Token Exchange Flow

**For Page Access Tokens via System User:**
```
1. Use System User token with pages_read_engagement permission
2. GET /me/accounts?access_token=SYSTEM_USER_TOKEN
3. Response includes page access tokens for each accessible page
4. Page access tokens valid for 1 hour
```

**For Long-Lived Tokens:**
```
1. Exchange short-lived User token:
   GET /oauth/access_token?
     grant_type=fb_exchange_token&
     client_id={app-id}&
     client_secret={app-secret}&
     fb_exchange_token={short-lived-token}
2. Returns long-lived token (60 days)
```

### Best Practices
- Use **System User tokens** for automated/background operations
- Use **expiring System User tokens** (60 days) to limit leaked token risk
- Implement **token refresh logic** before expiration
- Store tokens securely (encrypted, not in code)
- Use **Page access tokens** for Page-specific operations
- Monitor token expiration and refresh proactively

---

## Scheduling Support

### Facebook Pages Scheduling

**✅ Fully Supported via Graph API**

**Endpoint:** `POST /{page-id}/feed`

**Parameters:**
- `published`: Set to `false` for scheduled posts
- `scheduled_publish_time`: UNIX timestamp or ISO 8601 string
  - **Format options:**
    - UNIX timestamp in seconds (e.g., `1530432000`)
    - ISO 8601 timestamp string (e.g., `2018-09-01T10:15:30+01:00`)
    - String parsable by PHP's strtotime() (e.g., `+2 weeks`, `tomorrow`)

**Constraints:**
- Scheduled time must be **between 10 minutes and 75 days** from API request time
- Use [read-after-write](https://developers.facebook.com/docs/graph-api/advanced#read-after-write) to verify `scheduled_publish_time` matches expectations

**Example Request:**
```bash
POST /v24.0/{page-id}/feed
{
  "message": "Scheduled post content",
  "published": false,
  "scheduled_publish_time": 1704067200
}
```

**Retrieving Scheduled Posts:**
- Use `GET /{page-id}/scheduled_posts` endpoint
- Requires Page Access Token
- Supported for New Page Experience pages

### Instagram Scheduling

**❌ NOT Supported via Graph API**

**Current Status:**
- Instagram Graph API **does not support native scheduling**
- `scheduled_publish_time` parameter returns error: `"(#3) User must be on whitelist"`
- Scheduling appears to be restricted to whitelisted partners only
- No official documentation for Instagram scheduling via Graph API
- Meta has not announced public roadmap for Instagram scheduling parity

**Workarounds:**
1. **Client-Side Scheduling**: Implement your own scheduling logic and call publish endpoint at scheduled time
2. **Meta Business Suite**: Use Meta Business Suite for Instagram content scheduling (manual/UI-based)
3. **Queue System**: Build internal queue system that publishes at scheduled times

**Publishing Flow (Immediate Only):**
```
1. Create media container (upload media to Meta servers)
   POST /{ig-user-id}/media?upload_type=resumable
   
2. Publish container
   POST /{ig-user-id}/media_publish?creation_id={container-id}
```

**Rate Limits:**
- Instagram professional accounts can only publish **50 posts within a 24-hour moving period**

---

## Implementation Recommendations

### Phase 1 Approach

**For Facebook Pages:**
1. ✅ Use Graph API with `scheduled_publish_time` parameter
2. ✅ Implement proper token management (System User → Page Access Token)
3. ✅ Handle token refresh before expiration
4. ✅ Use read-after-write to verify scheduled times

**For Instagram:**
1. ⚠️ Implement client-side scheduling (queue + cron/job scheduler)
2. ⚠️ Monitor rate limits (50 posts per 24 hours)
3. ⚠️ Handle immediate publishing only via API
4. ⚠️ Consider Meta Business Suite integration for advanced scheduling needs

### App Review Preparation

**Before Submission:**
1. Complete app development and ensure ready for testing
2. Create 1024x1024 app icon
3. Make successful API calls with each permission (within 30 days)
4. Record 1080p+ screen recordings showing:
   - User granting permissions
   - Each permission/feature in use
   - Complete user flow
5. Ensure English UI or provide captions
6. Prepare test access instructions if app not publicly accessible

**During Review:**
- Respond promptly to Meta's questions
- Be available for clarification
- Monitor submission status regularly

**After Approval:**
- Complete Data Use Checkup annually
- Monitor for permission changes/deprecations
- Keep app compliant with Meta Platform Terms

---

## Summary

### Facebook Pages
- ✅ Full scheduling support via `scheduled_publish_time`
- ✅ Well-documented API
- ✅ Requires `pages_manage_posts` permission
- ✅ Uses Page Access Tokens

### Instagram
- ❌ No native scheduling support
- ✅ Immediate publishing works (create container + publish)
- ✅ Requires `instagram_content_publish` permission
- ⚠️ Requires client-side scheduling implementation
- ⚠️ 50 posts per 24-hour rate limit

### App Review
- ⚠️ Required for public apps
- ⚠️ Screen recordings mandatory for each permission
- ⚠️ 4-8 week timeline typical
- ⚠️ Business verification may be required separately
- ⚠️ Annual Data Use Checkup required

### Tokens
- ✅ System User tokens recommended for automation
- ✅ Long-lived tokens last 60 days
- ✅ Page access tokens valid 1 hour (refresh via System User)
- ⚠️ Implement robust token refresh logic

---

## Additional Resources

- **Meta Business Help**: https://www.facebook.com/business/help
- **Graph API Explorer**: https://developers.facebook.com/tools/explorer/
- **API Versioning**: https://developers.facebook.com/docs/graph-api/guides/versioning
- **Rate Limiting**: https://developers.facebook.com/docs/graph-api/overview/rate-limiting

---

*Last Updated: February 2026*
*Graph API Version: v24.0*
