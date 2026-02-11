# Meta Publishing - Production Deployment Guide

**Last Updated**: February 3, 2026  
**Build Status**: ✅ All TypeScript errors fixed  
**Ready to Deploy**: Yes

---

## 📋 Pre-Deployment Checklist

- [ ] Supabase migration applied
- [ ] Environment variables configured
- [ ] Meta app created and configured
- [ ] Cron job configured on cron-job.org
- [ ] Feature flags set (OFF initially)
- [ ] Code pushed to GitHub
- [ ] Vercel deployment successful

---

## 1️⃣ Supabase Database Migration

### Apply the Migration

**File to run**: `supabase/migrations/009_meta_publishing_phase1.sql`

### Via Supabase Dashboard (Recommended for Production)

1. Go to **Supabase Dashboard** → Your Project → **SQL Editor**
2. Copy the entire contents of `supabase/migrations/009_meta_publishing_phase1.sql`
3. Paste into the SQL editor
4. Click **Run**
5. Verify success (should see "Success. No rows returned")

### Via Supabase CLI (Alternative)

```bash
# From your project root
supabase db push

# Or run the specific migration
supabase migration up
```

### What the Migration Creates

**4 New Tables:**
- `meta_connections` - User OAuth tokens (encrypted)
- `meta_pages` - Facebook Pages with encrypted page tokens
- `meta_instagram_accounts` - Instagram Business accounts
- `publish_jobs` - Publishing queue

**Security:**
- Row Level Security (RLS) policies on all tables
- Service role has full access (for worker)
- Authenticated users can only view their own data

**Indexes:**
- Partial unique indexes to enforce one selected page/IG per user
- Unique index for job idempotency
- Optimized indexes for worker queries (including retries)

### Verify Migration Success

Run this query in Supabase SQL Editor:

```sql
-- Check tables exist
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('meta_connections', 'meta_pages', 'meta_instagram_accounts', 'publish_jobs');

-- Should return 4 rows
```

---

## 2️⃣ Environment Variables

### Add to Vercel Environment Variables

Go to **Vercel Dashboard** → Your Project → **Settings** → **Environment Variables**

### Required Variables

```bash
# ==================================
# Meta Publishing - Feature Flags
# ==================================
# Start with these OFF (false) until Meta app is approved
META_PUBLISHING_ENABLED=false
NEXT_PUBLIC_META_PUBLISHING_ENABLED=false

# ==================================
# Meta App Credentials
# ==================================
# Get these from Meta for Developers Dashboard
META_APP_ID=your_meta_app_id_here
META_APP_SECRET=your_meta_app_secret_here
META_REDIRECT_URI=https://app.crispdigital.io/api/meta/oauth/callback

# ==================================
# Meta Token Encryption
# ==================================
# Generate a 32-byte encryption key for Meta tokens
# Command: openssl rand -base64 32
META_TOKEN_ENCRYPTION_KEY=your_32_byte_base64_key_here

# ==================================
# Cron Secret (for publish worker)
# ==================================
# Generate a random secret for cron job authentication
# Command: openssl rand -hex 32
CRON_SECRET=your_random_cron_secret_here

# ==================================
# App URL (for data deletion callback)
# ==================================
NEXT_PUBLIC_APP_URL=https://app.crispdigital.io
```

### Generate Encryption Keys

Run these commands in Terminal:

```bash
# Meta token encryption key (32 bytes)
openssl rand -base64 32

# Cron secret (64 hex characters)
openssl rand -hex 32
```

Copy the output and use as the environment variable values.

### Environment Variable Scope

Set these for:
- ✅ **Production**
- ✅ **Preview** (optional, for testing)
- ✅ **Development** (also add to local `.env.local`)

---

## 3️⃣ Meta App Setup

### Create Meta App

1. Go to [Meta for Developers](https://developers.facebook.com/apps/)
2. Click **Create App**
3. Choose **Business** type
4. Fill in:
   - **App Name**: "CRISP Content Engine" (or similar)
   - **App Contact Email**: Your support email
   - **Business Account**: Select or create one

### Add Products

**Add these products to your app:**

1. **Facebook Login for Business**
   - Click **Set Up** on the Facebook Login product
   
2. **Instagram Basic Display** (if available)
   - Click **Set Up** on Instagram product

### Configure OAuth Settings

**In Facebook Login → Settings:**

1. **Valid OAuth Redirect URIs**: Add exactly:
   ```
   https://app.crispdigital.io/api/meta/oauth/callback
   ```

2. **Client OAuth Settings**:
   - ✅ Enable **Client OAuth Login**
   - ✅ Enable **Web OAuth Login**

### Configure App Settings

**In Settings → Basic:**

1. **App Domains**: Add `app.crispdigital.io`

2. **Privacy Policy URL**: `https://app.crispdigital.io/privacy` (must exist)

3. **Terms of Service URL**: `https://app.crispdigital.io/terms` (optional but recommended)

4. **Data Deletion Request URL**: 
   ```
   https://app.crispdigital.io/api/meta/data-deletion
   ```

5. **App Icon**: Upload 1024x1024 PNG (optional but recommended for review)

### Copy App Credentials

**In Settings → Basic:**

1. Copy **App ID** → Use as `META_APP_ID`
2. Click **Show** on **App Secret** → Copy and use as `META_APP_SECRET`

### App Review Preparation (Don't Submit Yet!)

**Permissions to Request:**
- `business_management` (forced by Meta's use case - cannot be removed)
- `pages_show_list`
- `pages_read_engagement`
- `pages_manage_posts`
- `instagram_basic`
- `instagram_content_publish`

**Note**: `business_management` is forced by Meta when you select "Manage everything on your Page" and "Manage messaging and content on Instagram" use cases. It cannot be removed once those use cases are selected.

**Don't submit for review until:**
- ✅ Internal testing is complete
- ✅ Feature works end-to-end in production (with flag enabled for your test account)
- ✅ Screen recording prepared showing the full flow
- ✅ Privacy policy and data deletion endpoints live

---

## 4️⃣ Cron Job Setup (cron-job.org)

Since Vercel doesn't run your cron jobs, use **cron-job.org** or similar.

### Configure on cron-job.org

1. Go to [cron-job.org](https://cron-job.org) and sign up/login

2. **Create New Cron Job**:
   - **Title**: "CRISP Meta Publishing Worker"
   - **URL**: `https://app.crispdigital.io/api/publish/meta-due`
   - **Schedule**: 
     - ✅ Every **5 minutes** (recommended)
     - Or every **1 minute** if you want faster publishing
   - **Request Method**: **GET**
   - **Request Headers**: Add header:
     ```
     Authorization: Bearer YOUR_CRON_SECRET_HERE
     ```
     (Use the same `CRON_SECRET` value from env vars)

3. **Enable Notifications** (optional):
   - ✅ Email on failure
   - Set threshold: notify if job fails 3 times in a row

4. **Save and Enable**

### Verify Cron Job Works

After deployment, check:

```bash
# Manual test (replace with your actual CRON_SECRET)
curl -H "Authorization: Bearer YOUR_CRON_SECRET" \
  https://app.crispdigital.io/api/publish/meta-due
```

Expected response:
```json
{"ok": true, "processed": 0}
```
(or `{"ok": true, "results": {...}}` if jobs were processed)

---

## 5️⃣ Deployment Steps

### Step 1: Push Code to GitHub

```bash
cd /Users/chrispascoe/Projects/crisp-content-engine

# Check what changed
git status

# Add all changes
git add .

# Commit
git commit -m "feat: Meta publishing integration Phase 1 (feature-flagged)"

# Push
git push
```

### Step 2: Vercel Auto-Deploy

Vercel should automatically deploy when you push to `main`. Monitor the deployment:

1. Go to **Vercel Dashboard** → Your Project → **Deployments**
2. Wait for build to complete (~2-3 minutes)
3. Check build logs for errors

### Step 3: Apply Supabase Migration

**In Supabase Dashboard:**

1. Go to **SQL Editor**
2. Run the migration SQL (from Step 1 above)
3. Verify all 4 tables exist

### Step 4: Configure Environment Variables

**In Vercel Dashboard:**

1. Settings → Environment Variables
2. Add all variables from Section 2 above
3. **Important**: Set feature flags to `false` initially:
   ```
   META_PUBLISHING_ENABLED=false
   NEXT_PUBLIC_META_PUBLISHING_ENABLED=false
   ```

4. Click **Save**
5. **Redeploy** (Vercel → Deployments → latest → "..." → Redeploy)

### Step 5: Set Up Cron Job

Configure on cron-job.org (from Step 4 above)

---

## 6️⃣ Internal Testing (Before App Review)

### Enable Feature Flag for Testing

**In Vercel:**

1. Environment Variables → Edit `META_PUBLISHING_ENABLED`
2. Change to: `true`
3. Edit `NEXT_PUBLIC_META_PUBLISHING_ENABLED` → `true`
4. **Redeploy**

**Or create a separate Preview deployment** for testing with flags enabled.

### Test Checklist

- [ ] Meta card appears on `/connections`
- [ ] Click "Connect Meta Account" → OAuth flow works
- [ ] After OAuth: redirected back, pages/IG accounts discovered
- [ ] Status page shows connected account and selected destinations
- [ ] Select different page/IG account works
- [ ] Generate Facebook content → appears in approval queue
- [ ] Generate Instagram content → appears in approval queue
- [ ] Approve Facebook content → `publish_jobs` row created
- [ ] Approve Instagram content → `publish_jobs` row created
- [ ] Wait for cron (max 5 min) → job processes successfully
- [ ] Check Facebook Page → post appeared
- [ ] Check Instagram → post appeared
- [ ] Airtable status updated to "Published"
- [ ] Disconnect Meta → connection removed, pending jobs marked failed
- [ ] Reconnect → pages/IG rediscovered correctly

### If Testing Fails

Check:
- Vercel deployment logs (Function Logs)
- Supabase logs (Database → Logs)
- Cron job execution logs (cron-job.org dashboard)
- Browser console for frontend errors

---

## 7️⃣ Meta App Review Submission

### Prerequisites

- ✅ Internal testing complete (all tests passed)
- ✅ Privacy policy live at `https://app.crispdigital.io/privacy`
- ✅ Data deletion endpoint live and tested
- ✅ Business Verification completed

### Required Assets

**1. Screen Recording** (~2-3 minutes):
   - Show connecting Meta account (OAuth flow)
   - Show selecting Facebook Page and Instagram account
   - Show approving Facebook content
   - Show Facebook post appearing on Page
   - Show approving Instagram content
   - Show Instagram post appearing on account
   - Show disconnecting account
   - (Optional) Show data deletion request flow

**2. Permission Justifications**:

```
pages_show_list:
"List user's Facebook Pages to allow them to select which Page to publish content to."

pages_read_engagement:
"Read Facebook Page details to verify publishing permissions and display Page information to the user."

pages_manage_posts:
"Publish scheduled social media content directly to the user's Facebook Page on their behalf."

instagram_basic:
"Access Instagram Business account information to enable content publishing and display account details."

instagram_content_publish:
"Publish scheduled social media content directly to the user's Instagram Business account on their behalf."
```

**3. Test User** (if Meta requests):
   - Create a test Facebook account
   - Create a test Facebook Page (admin access)
   - Connect a test Instagram Business account
   - Share credentials with Meta reviewers

### Submission Process

1. **Meta Dashboard** → Your App → **App Review** → **Permissions and Features**
2. Request the 5 permissions listed above
3. For each permission, provide:
   - Justification (use text above)
   - Upload screen recording
4. Submit for review
5. **Estimated approval time**: 3-7 days

### After Approval

1. Switch app to **Live** mode (Settings → Basic → App Mode)
2. Keep feature flags **OFF** in production until ready to announce
3. Enable flags when ready to launch publicly

---

## 8️⃣ Production Launch (After Meta Approval)

### Enable Feature Flags Globally

**In Vercel:**

1. Environment Variables
2. Edit `META_PUBLISHING_ENABLED` → `true`
3. Edit `NEXT_PUBLIC_META_PUBLISHING_ENABLED` → `true`
4. **Redeploy**

### Monitor Initial Launch

**Watch for:**
- OAuth connection success rate
- Job creation rate
- Publish success rate
- Cron job execution (every 5 minutes)
- Error rates in Vercel/Supabase logs

**Key Metrics Dashboard** (optional):
- Number of Meta connections
- Jobs queued vs published vs failed
- Average time from approval to publish
- Token expiry events

---

## 🔧 Complete Environment Variable Reference

### Production .env (Vercel)

```bash
# ==========================================
# Supabase
# ==========================================
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# ==========================================
# Meta Publishing (Phase 1)
# ==========================================
# Feature flags (set to false initially)
META_PUBLISHING_ENABLED=false
NEXT_PUBLIC_META_PUBLISHING_ENABLED=false

# Meta app credentials (from Meta for Developers)
META_APP_ID=your_meta_app_id
META_APP_SECRET=your_meta_app_secret
META_REDIRECT_URI=https://app.crispdigital.io/api/meta/oauth/callback

# Meta token encryption (generate: openssl rand -base64 32)
META_TOKEN_ENCRYPTION_KEY=your_32_byte_base64_key

# ==========================================
# Cron Jobs
# ==========================================
# Cron secret (generate: openssl rand -hex 32)
CRON_SECRET=your_cron_secret_here

# ==========================================
# App Configuration
# ==========================================
NEXT_PUBLIC_APP_URL=https://app.crispdigital.io
NEXT_PUBLIC_SITE_URL=https://app.crispdigital.io

# ==========================================
# Airtable (existing)
# ==========================================
AIRTABLE_PAT=your_airtable_pat
AIRTABLE_BASE_ID=your_base_id
AIRTABLE_CONTENTQUEUE_TABLE=tblContentQueue
AIRTABLE_BRANDPROFILES_TABLE=tblBrandProfiles

# ==========================================
# Other existing env vars...
# ==========================================
# (Keep all your existing LinkedIn, Cloudinary, etc. vars)
```

---

## 📡 Cron Job Configuration (cron-job.org)

### Job Details

| Setting | Value |
|---------|-------|
| **URL** | `https://app.crispdigital.io/api/publish/meta-due` |
| **Method** | GET |
| **Schedule** | Every 5 minutes (`*/5 * * * *`) |
| **Timeout** | 30 seconds |
| **Retries** | 0 (endpoint handles its own retries) |

### Headers

```
Authorization: Bearer YOUR_CRON_SECRET_HERE
```

### Expected Responses

**Success (no jobs)**:
```json
{"ok": true, "processed": 0}
```

**Success (with jobs)**:
```json
{
  "ok": true,
  "results": {
    "processed": 5,
    "published": 4,
    "retrying": 1,
    "failed": 0,
    "skipped": 0
  }
}
```

**Error (feature disabled)**:
```json
{"error": "Meta publishing is disabled"}
```
(This is normal if `META_PUBLISHING_ENABLED=false`)

---

## 🚨 Troubleshooting

### Build Fails on Vercel

**Check:**
- TypeScript errors (build logs)
- Missing environment variables (check Vercel settings)
- Supabase tables exist (migration applied?)

### OAuth Flow Fails

**Common issues:**
- `META_REDIRECT_URI` doesn't match exactly in Meta dashboard
- `META_APP_ID` or `META_APP_SECRET` incorrect
- User doesn't have admin access to any Facebook Page
- Meta app is in "Development" mode but testing with non-test user

### Jobs Not Publishing

**Check:**
1. Cron job is enabled and running on cron-job.org
2. `CRON_SECRET` matches between Vercel env vars and cron-job.org header
3. Feature flag `META_PUBLISHING_ENABLED=true`
4. Supabase `publish_jobs` table has rows with `status='queued'` and `scheduled_time <= now`
5. Page access token exists and is valid

**Debug:**
```sql
-- Check pending jobs
SELECT id, platform, status, scheduled_time, next_attempt_at, error_message
FROM publish_jobs
WHERE status IN ('queued', 'retrying')
ORDER BY scheduled_time;
```

### Tokens Expired

**Symptom**: Job fails with "Page access token not found" or "Invalid OAuth token"

**Fix**: User must disconnect and reconnect their Meta account (tokens expire after 60 days)

---

## 📊 Monitoring Queries

### Check Job Queue Health

```sql
-- Jobs by status
SELECT status, COUNT(*) as count
FROM publish_jobs
GROUP BY status;

-- Upcoming jobs (next hour)
SELECT platform, scheduled_time, status, attempts, error_message
FROM publish_jobs
WHERE scheduled_time <= NOW() + INTERVAL '1 hour'
ORDER BY scheduled_time;

-- Failed jobs
SELECT user_id, platform, error_message, attempts, created_at
FROM publish_jobs
WHERE status = 'failed'
ORDER BY created_at DESC
LIMIT 20;
```

### Check Meta Connections

```sql
-- Active connections
SELECT user_id, facebook_user_id, token_expires_at
FROM meta_connections
WHERE token_expires_at > NOW();

-- Expiring soon (within 7 days)
SELECT user_id, facebook_user_id, token_expires_at
FROM meta_connections
WHERE token_expires_at <= NOW() + INTERVAL '7 days'
  AND token_expires_at > NOW();
```

---

## ✅ Final Pre-Launch Checklist

**Before enabling feature flags globally:**

- [ ] Supabase migration applied successfully
- [ ] All environment variables set in Vercel
- [ ] Meta app created with all settings configured
- [ ] Cron job running on cron-job.org (every 5 minutes)
- [ ] Code deployed to Vercel successfully
- [ ] Internal testing completed with feature flags ON
- [ ] At least one successful Facebook publish tested
- [ ] At least one successful Instagram publish tested
- [ ] Data deletion endpoint tested and working
- [ ] Meta App Review submitted
- [ ] Meta App Review **approved** ✅
- [ ] Meta app switched to "Live" mode
- [ ] Ready to enable feature flags globally

---

## 🎯 Quick Start Commands

```bash
# 1. Generate encryption keys
openssl rand -base64 32  # For META_TOKEN_ENCRYPTION_KEY
openssl rand -hex 32     # For CRON_SECRET

# 2. Deploy to production
git add .
git commit -m "feat: Meta publishing Phase 1"
git push

# 3. Apply migration (Supabase Dashboard SQL Editor)
# Copy contents of: supabase/migrations/009_meta_publishing_phase1.sql
# Paste and run

# 4. Test cron endpoint manually
curl -H "Authorization: Bearer YOUR_CRON_SECRET" \
  https://app.crispdigital.io/api/publish/meta-due
```

---

**Status**: Ready for deployment ✅  
**Next Action**: Apply migration, configure env vars, deploy to Vercel
