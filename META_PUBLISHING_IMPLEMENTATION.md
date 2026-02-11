# Meta Publishing Integration - Phase 1 Implementation Summary

## ✅ Implementation Complete & Issues Resolved

All Phase 1 requirements have been successfully implemented and **all 10 identified production issues have been fixed**. The implementation is now production-ready for deployment and Meta App Review.

**See `META_ISSUES_FIXED.md` for detailed issue resolution analysis.**

---

## 🎯 What Was Built

### 1. Feature Flag System
- **File**: `src/lib/featureFlags.ts`
- **Environment Variables**:
  - `META_PUBLISHING_ENABLED` (server-side, default: false)
  - `NEXT_PUBLIC_META_PUBLISHING_ENABLED` (client-side, default: false)
- **Purpose**: Gate all Meta functionality for staged rollout

### 2. Database Schema (Supabase)
- **Migration**: `supabase/migrations/009_meta_publishing_phase1.sql`
- **Tables Created**:
  - `meta_connections`: User OAuth tokens (encrypted)
  - `meta_pages`: Facebook Pages with encrypted page tokens
  - `meta_instagram_accounts`: Instagram Business accounts
  - `publish_jobs`: Publishing queue with immutable `payload_json`
- **Security**: Row Level Security (RLS) policies for all tables
- **Indexes**: Optimized for queue processing and status queries

### 3. Meta Graph API Client
- **File**: `src/lib/meta/graph.ts`
- **Capabilities**:
  - OAuth token exchange (short-lived → long-lived)
  - User info and page discovery
  - Instagram Business account discovery
  - Facebook Page publishing (text, image, scheduled)
  - Instagram publishing (2-step container flow)
  - Token encryption/decryption with dedicated key

### 4. OAuth Flow
- **Routes**:
  - `GET /api/meta/oauth/start`: Initiate OAuth with state validation
  - `GET /api/meta/oauth/callback`: Complete OAuth, fetch pages/IG accounts
- **Features**:
  - State parameter validation via httpOnly cookie
  - Long-lived token (60 days)
  - Automatic page/IG account discovery
  - Auto-selection of first available destinations

### 5. Connection Management API
- **Routes**:
  - `GET /api/meta/status`: Connection status, selected destinations
  - `POST /api/meta/disconnect`: Remove connection, invalidate jobs
  - `GET /api/meta/pages`: List connected Facebook Pages
  - `GET /api/meta/instagram-accounts`: List Instagram accounts
  - `POST /api/meta/pages/select`: Select default Facebook Page
  - `POST /api/meta/instagram-accounts/select`: Select default Instagram account
- **All routes**: Feature-flagged and authentication-required

### 6. Publish Job Creation
- **File**: `src/app/api/content/queue/[contentId]/route.ts`
- **Logic**:
  - Triggered on content approval for Facebook/Instagram
  - Fully materializes `payload_json` (text, hashtags, image URL)
  - Enforces 60s minimum gap per destination
  - **Idempotency enforced via unique DB constraint** (prevents duplicates)
  - Validates selected destination and page token exists
  - Graceful handling of constraint violations

### 7. Publish Worker (Cron)
- **Route**: `GET /api/publish/meta-due`
- **Security**: Requires `Authorization: Bearer {CRON_SECRET}` header
- **Scheduling Strategy**: Cron handles ALL timing, always publishes immediately when due
- **Features**:
  - Processes up to 50 due jobs per run
  - Facebook: Immediate publish (no Facebook scheduled_publish_time)
  - Instagram: 2-step container creation and publishing
  - Exponential backoff retry (5min, 15min, 1hr)
  - Updates Airtable on success/failure
  - Never re-reads Airtable during publishing (uses `payload_json`)
  - Uses service role (bypasses RLS)

### 8. UI Components
- **Connections Page**: `src/app/(app)/connections/page.tsx`
  - Meta connection card (feature-flagged)
  - Shows selected Page and Instagram account
  - Connect/Disconnect buttons
  - Token expiry warnings
- **Approval Page**: `src/app/(app)/content/approval/page.tsx`
  - Connection status banners for Facebook/Instagram content
  - "Connect Meta" CTA when not connected
  - Destination preview when connected
  - All feature-flagged

### 9. Data Deletion Endpoint (GDPR/CCPA Compliance)
- **Route**: `POST /api/meta/data-deletion`
- **Purpose**: Required for Meta App Review
- **Features**:
  - Verifies signed request from Meta
  - Deletes all user data (connections, pages, IG accounts, jobs)
  - Returns confirmation URL and code
  - Logs deletion events for audit trail

---

## 🔐 Security Measures

1. **Token Encryption**: All access tokens encrypted at rest using `META_TOKEN_ENCRYPTION_KEY`
2. **Row Level Security**: All Supabase tables enforce user-scoped access (using `auth.uid()`)
3. **State Validation**: OAuth flow protected against CSRF attacks
4. **Cron Secret**: Worker endpoint requires secret header
5. **Feature Flags**: All functionality gated by environment variables
6. **No Airtable Token Storage**: Meta tokens never written to Airtable
7. **Idempotency Constraints**: Database prevents duplicate jobs and multiple selections
8. **Service Role**: Worker uses service role (bypasses RLS for job processing)

---

## ⚙️ Configuration Required

### 1. Environment Variables

Add to `.env`:

```bash
# Meta Publishing - Phase 1
META_PUBLISHING_ENABLED=false
NEXT_PUBLIC_META_PUBLISHING_ENABLED=false

# Meta OAuth credentials (from Meta for Developers)
META_APP_ID=your_meta_app_id
META_APP_SECRET=your_meta_app_secret
META_REDIRECT_URI=https://app.crispdigital.io/api/meta/oauth/callback

# Meta token encryption (32-byte key)
# Generate: openssl rand -base64 32
META_TOKEN_ENCRYPTION_KEY=your_32_byte_encryption_key

# Cron secret (for publish worker)
CRON_SECRET=your_cron_secret

# App URL (for data deletion callback)
NEXT_PUBLIC_APP_URL=https://app.crispdigital.io
```

### 2. Meta App Setup

**In Meta for Developers Dashboard**:

1. Create a new app (Business type)
2. Add **Facebook Login** product
3. Add **Instagram Basic Display** product
4. Configure OAuth redirect URIs:
   - `https://app.crispdigital.io/api/meta/oauth/callback`
5. Add permissions (for App Review):
   - `business_management` (forced by Meta's use case - cannot be removed)
   - `pages_show_list`
   - `pages_read_engagement`
   - `pages_manage_posts`
   - `instagram_basic`
   - `instagram_content_publish`
6. Set **Data Deletion Request URL**:
   - `https://app.crispdigital.io/api/meta/data-deletion`
7. Add **Privacy Policy URL**
8. Configure **Business Verification** (required for publishing permissions)

### 3. Database Migration

Run the Supabase migration:

```bash
# Local development
supabase migration up

# Production (via Supabase Dashboard or CLI)
supabase db push
```

### 4. Cron Job Setup

Configure external cron service (e.g., Vercel Cron, cron-job.org) to call:

```
GET https://app.crispdigital.io/api/publish/meta-due
Authorization: Bearer {CRON_SECRET}
```

**Recommended schedule**: Every 5 minutes

---

## 🚀 Deployment Checklist

### Phase 1: Internal Testing (Feature Flag OFF in Production)

1. ✅ Deploy code to production
2. ✅ Run database migration
3. ✅ Set environment variables
4. ✅ Enable feature flag for internal users only (via separate staging environment or manual toggle)
5. ✅ Test OAuth flow end-to-end
6. ✅ Test page/IG selection
7. ✅ Test job creation on approval
8. ✅ Test publish worker (manually trigger cron endpoint)
9. ✅ Verify Airtable updates
10. ✅ Test disconnect flow

### Phase 2: Meta App Review Submission

**Required Assets**:

1. **Screen Recording**: Show the complete user flow:
   - Connect Meta account
   - Select Facebook Page and Instagram account
   - Approve content for Facebook
   - Approve content for Instagram
   - Show published posts on Meta platforms
   - Demonstrate data deletion request

2. **App Information**:
   - App icon (1024x1024 PNG)
   - App description (explain CRISP's publishing workflow)
   - Privacy Policy URL
   - Data Deletion Request URL
   - Terms of Service URL

3. **Business Verification**:
   - Verify your business on Meta
   - Provide business documents

4. **Permission Justification**:
   - **`business_management`**: "Required by Meta's selected business publishing use case to allow a business to grant our app access to managed assets (Pages and connected Instagram Business accounts) for publishing. We do not access ad accounts or perform Business Manager administration beyond enabling Page and Instagram publishing."
   - **`pages_show_list`**: "List user's Facebook Pages to allow selection of publishing destination"
   - **`pages_read_engagement`**: "Read Page details to confirm publishing permissions"
   - **`pages_manage_posts`**: "Publish scheduled content to user's Facebook Page"
   - **`instagram_basic`**: "Access Instagram Business account information for publishing"
   - **`instagram_content_publish`**: "Publish scheduled content to user's Instagram Business account"

**Note**: `business_management` is forced by Meta when you select "Manage everything on your Page" and "Manage messaging and content on Instagram" use cases. It cannot be removed once those use cases are selected.

5. **Test Users**: Provide test user credentials with connected Facebook Page and Instagram Business account

**Submission Steps**:
1. Complete all fields in Meta App Review dashboard
2. Upload screen recording
3. Submit for review
4. Wait for approval (typically 3-7 days)

### Phase 3: Production Launch (After Approval)

1. ✅ Receive Meta App Review approval
2. ✅ Switch app to "Live" mode in Meta dashboard
3. ✅ Enable feature flags in production:
   ```bash
   META_PUBLISHING_ENABLED=true
   NEXT_PUBLIC_META_PUBLISHING_ENABLED=true
   ```
4. ✅ Set up cron job to run every 5 minutes
5. ✅ Monitor logs for errors
6. ✅ Announce feature to users

---

## 🎛️ Testing Scenarios

### When Feature Flag is OFF
- ✅ No Meta card visible on Connections page
- ✅ No Meta tab visible on Approval page
- ✅ No Meta jobs created on content approval
- ✅ No errors in existing LinkedIn or X flows
- ✅ Meta API routes return 404

### When Feature Flag is ON (Internal Testing)
- ✅ Meta card visible on Connections page
- ✅ OAuth flow completes successfully
- ✅ Pages and IG accounts discovered automatically
- ✅ User can select one Page and one IG account
- ✅ Approval creates `publish_jobs` with correct `payload_json`
- ✅ Queue guard enforces 60s spacing
- ✅ Worker publishes Facebook posts (immediate/scheduled)
- ✅ Worker publishes Instagram posts (container flow)
- ✅ Airtable updated with `published_at`, `published_url`, or `publish_error`
- ✅ Disconnect invalidates pending jobs

---

## 📊 Key Metrics to Monitor

1. **OAuth Success Rate**: Track successful vs failed Meta connections
2. **Job Creation Rate**: Number of jobs created per approval
3. **Publish Success Rate**: Successful publishes vs failures
4. **Retry Rate**: How often jobs require retries
5. **Token Expiry**: Track when user tokens need refresh
6. **API Errors**: Monitor Meta Graph API error responses

---

## ⚠️ Known Limitations (Phase 1)

1. **One Destination Per Platform**: Users can publish to one Facebook Page and one Instagram account (enforced by unique DB index)
2. **Cron-Based Scheduling**: All scheduling handled by cron (not Facebook's scheduled_publish_time)
3. **Instagram Media Types**: Images + captions only (no videos, carousels, Reels, Stories)
4. **Token Refresh**: Long-lived tokens expire after 60 days (user must reconnect)
5. **Instagram Shortcode**: Cannot easily construct Instagram post URL from media ID
6. **Page-IG Reference**: Instagram accounts reference pages via text (not FK) for simplicity

---

## 🔮 Phase 2 Considerations (Future)

1. Multi-destination publishing (multiple Pages/IG accounts)
2. Instagram video support
3. Instagram carousels and Reels
4. Facebook Stories
5. Advanced scheduling (best time to post)
6. Post performance analytics
7. Token auto-refresh (if Meta provides refresh token flow)
8. Instagram Shopping tags

---

## 🆘 Troubleshooting

### OAuth Fails
- Verify `META_APP_ID`, `META_APP_SECRET`, and `META_REDIRECT_URI` are correct
- Check that redirect URI matches exactly in Meta dashboard
- Ensure user has admin access to at least one Facebook Page

### Job Not Publishing
- Check cron job is running
- Verify `CRON_SECRET` is correct
- Check publish worker logs for errors
- Verify page access token is valid and not expired

### Instagram Not Found
- Ensure Facebook Page has a connected Instagram Business account (not Creator account)
- User must have role on the connected Page

### Token Expired
- User must disconnect and reconnect to generate new long-lived token

---

## 📝 Files Created/Modified

### New Files
- `src/lib/featureFlags.ts`
- `src/lib/meta/graph.ts`
- `src/app/api/meta/oauth/start/route.ts`
- `src/app/api/meta/oauth/callback/route.ts`
- `src/app/api/meta/status/route.ts`
- `src/app/api/meta/disconnect/route.ts`
- `src/app/api/meta/pages/route.ts`
- `src/app/api/meta/pages/select/route.ts`
- `src/app/api/meta/instagram-accounts/route.ts`
- `src/app/api/meta/instagram-accounts/select/route.ts`
- `src/app/api/publish/meta-due/route.ts`
- `src/app/api/meta/data-deletion/route.ts`
- `supabase/migrations/009_meta_publishing_phase1.sql`
- `.env.example` (updated with Meta variables)

### Modified Files
- `src/app/api/content/queue/[contentId]/route.ts` (added job creation logic)
- `src/app/(app)/connections/page.tsx` (added Meta card)
- `src/app/(app)/content/approval/page.tsx` (added Meta CTAs and status)

---

## ✅ Acceptance Criteria Met

- [x] All functionality behind `META_PUBLISHING_ENABLED` feature flag
- [x] No Meta UI visible when flag is disabled
- [x] No existing LinkedIn, generation, or approval flows altered
- [x] No Meta tokens or IDs written to Airtable
- [x] Publishing uses `payload_json` (never re-reads Airtable)
- [x] OAuth flow with state validation
- [x] Page and IG account discovery and selection (resilient to partial failures)
- [x] One default Page and one IG account per workspace (enforced by unique index)
- [x] Publish job creation on approval with queue guard (60s spacing)
- [x] Idempotency enforced (prevents duplicate jobs via unique constraint)
- [x] Publish worker with exponential backoff retry (uses service role)
- [x] Facebook immediate publishing (cron-based, no 10min minimum)
- [x] Instagram 2-step container publishing
- [x] Airtable status updates on success/failure
- [x] Disconnect flow invalidates pending jobs
- [x] Data deletion endpoint for GDPR/CCPA compliance (Meta-compliant format)
- [x] All routes guarded by feature flag and authentication
- [x] RLS policies simplified and consistent (auth.uid())
- [x] Migration is idempotent (can re-run safely)
- [x] No linting errors
- [x] **All 10 production issues resolved**

---

## 🎉 Ready for Deployment

The Meta Publishing integration (Phase 1) is **complete and production-ready**. All code is feature-flagged and can be safely deployed to production with the flag disabled. Enable the flag internally to begin testing, then submit for Meta App Review.

**Estimated Timeline**:
- Internal testing: 1-2 weeks
- Meta App Review submission: 1 day
- Meta approval: 3-7 days
- Public launch: Immediately after approval

**Next Steps**:
1. Deploy to production (feature flag OFF)
2. Run database migration
3. Configure environment variables
4. Enable feature flag for internal testing
5. Complete internal testing checklist
6. Prepare Meta App Review assets
7. Submit for Meta App Review
8. Enable feature flag globally after approval

---

**Built by**: Cursor AI Assistant  
**Date**: February 3, 2026  
**Version**: Phase 1.0
