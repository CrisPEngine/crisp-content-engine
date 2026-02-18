# Meta Publishing – Enable Everything for Screen Recording

Use this **single checklist** to get the full flow (connect → approve → publish) running before you start recording. Complete each section in order.

---

## 1. Environment variables to set (Vercel – Production)

Set these in **Vercel → Your Project → Settings → Environment Variables**. Use **Production** (and optionally Preview). After adding/editing, trigger a **Redeploy** so changes apply.

### 1.1 Feature flags (turn Meta publishing ON)

| Variable | Value | Notes |
|----------|--------|--------|
| `META_PUBLISHING_ENABLED` | `true` | Server: OAuth, worker, queue, API routes |
| `NEXT_PUBLIC_META_PUBLISHING_ENABLED` | `true` | Client: Connections card, approval UI |

### 1.2 Meta app credentials

| Variable | Value | Where to get it |
|----------|--------|------------------|
| `META_APP_ID` | *(e.g. 123456789)* | Meta for Developers → Your App → Settings → Basic → App ID |
| `META_APP_SECRET` | *(e.g. abc123...)* | Same → App Secret (Show) |
| `META_REDIRECT_URI` | `https://app.crispdigital.io/api/meta/oauth/callback` | CRISP publishing callback only; must be in Meta app Valid OAuth Redirect URIs (Section 3) |
| `META_LFB_CONFIG_ID` | *(e.g. 1617282746065433)* | Facebook Login for Business configuration ID from Meta app; added to authorize URL so Meta uses supported permissions |

### 1.3 Meta token encryption

| Variable | Value | How to generate |
|----------|--------|------------------|
| `META_TOKEN_ENCRYPTION_KEY` | *(32-byte base64 string)* | Run: `openssl rand -base64 32` |

### 1.4 Cron (publish worker)

| Variable | Value | Notes |
|----------|--------|--------|
| `CRON_SECRET` | *(random secret string)* | Run: `openssl rand -hex 32` — same value used in cron-job.org (Section 4) |

### 1.5 App URL (callbacks / data deletion)

| Variable | Value |
|----------|--------|
| `NEXT_PUBLIC_APP_URL` | `https://app.crispdigital.io` |

*(If you use a different production domain, use that domain for `META_REDIRECT_URI`, `NEXT_PUBLIC_APP_URL`, and all Meta app URLs below.)*

### 1.6 Copy-paste template (fill in and add to Vercel)

Use this block as a reference. Replace placeholders with your real values, then add each line in Vercel (or use bulk paste if your dashboard supports it).

```env
# --- Meta publishing: enable for recording ---
META_PUBLISHING_ENABLED=true
NEXT_PUBLIC_META_PUBLISHING_ENABLED=true

# --- Meta app (from Meta for Developers → Settings → Basic) ---
META_APP_ID=YOUR_APP_ID
META_APP_SECRET=YOUR_APP_SECRET
META_REDIRECT_URI=https://app.crispdigital.io/api/meta/oauth/callback
# --- Facebook Login for Business config ID (from Meta app; use if you see "app needs at least one supported permission") ---
META_LFB_CONFIG_ID=YOUR_LFB_CONFIG_ID

# --- Generate: openssl rand -base64 32 ---
META_TOKEN_ENCRYPTION_KEY=YOUR_BASE64_KEY

# --- Generate: openssl rand -hex 32 (use same in cron-job.org) ---
CRON_SECRET=YOUR_CRON_SECRET

# --- App URL ---
NEXT_PUBLIC_APP_URL=https://app.crispdigital.io
```

After saving all variables: **Redeploy** the latest deployment so the new env (especially `NEXT_PUBLIC_*`) is baked in.

---

## 2. Supabase: migration applied

The Meta flow needs the Phase 1 tables and RLS.

- [ ] **Migration run**: `009_meta_publishing_phase1.sql` has been executed in your **production** Supabase project.

**How to apply (if not done):**

1. Supabase Dashboard → Your Project → **SQL Editor**
2. Open `supabase/migrations/009_meta_publishing_phase1.sql` locally and copy its full contents
3. Paste into SQL Editor → **Run**
4. Confirm no errors

**Quick check:**

```sql
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
AND table_name IN ('meta_connections', 'meta_pages', 'meta_instagram_accounts', 'publish_jobs');
```

Expected: 4 rows.

---

## 3. Meta app configuration (developers.facebook.com)

In **Meta for Developers → Your App**:

### 3.1 Facebook Login → Settings

- [ ] **Valid OAuth Redirect URIs** includes **both** (two separate entries):
  - **CRISP publishing:** `https://app.crispdigital.io/api/meta/oauth/callback` (Connect Meta flow)
  - **Supabase auth:** `https://glqippdvtnydugejronn.supabase.co/auth/v1/callback` (Sign in with Facebook)
- [ ] **Client OAuth Login**: enabled  
- [ ] **Web OAuth Login**: enabled  

### 3.2 Settings → Basic

- [ ] **App Domains**: `app.crispdigital.io` (or your production domain)
- [ ] **Privacy Policy URL**: `https://www.crispdigital.io/privacy-policy` (or your live policy URL)
- [ ] **Terms of Service URL**: `https://www.crispdigital.io/terms-of-service` (recommended)
- [ ] **Data Deletion Request URL**: `https://app.crispdigital.io/api/meta/data-deletion`
- [ ] **App Icon**: 1024×1024 PNG (recommended for review)

*(No trailing slashes on URLs.)*

### 3.3 App mode

- [ ] App is in **Live** mode (or you are using a test app with permissions approved for your test user).

### 3.4 Permissions (App Review)

For the screen recording you need the permissions that are already approved (you mentioned verification approval). Ensure these are approved and not removed:

- [ ] `business_management`
- [ ] `pages_show_list`
- [ ] `pages_read_engagement`
- [ ] `pages_manage_posts`
- [ ] `instagram_basic`
- [ ] `instagram_content_publish`

---

## 4. Cron job (cron-job.org) – so posts actually publish

The app only **queues** jobs when the user approves; the **worker** at `/api/publish/meta-due` performs the actual publish. For the recording, the cron must be running so the post goes live (or you trigger the worker manually).

- [ ] **Cron job created** on [cron-job.org](https://cron-job.org):
  - **URL**: `https://app.crispdigital.io/api/publish/meta-due`
  - **Method**: GET
  - **Header**: `Authorization: Bearer YOUR_CRON_SECRET` (same value as `CRON_SECRET` in Vercel)
  - **Schedule**: Every **1 minute** (for recording) or every 5 minutes
  - **Job enabled**: Yes

**Test the worker:**

```bash
curl -H "Authorization: Bearer YOUR_CRON_SECRET" \
  "https://app.crispdigital.io/api/publish/meta-due"
```

Expected: `{"ok":true,"processed":0}` or `{"ok":true,"processed":1,...}`.  
If you get `404` or `401`, fix the feature flag and `CRON_SECRET`.

---

## 5. Content and test account

- [ ] **Test user** has a **Facebook Page** and an **Instagram Business account** linked to that Page (required for Instagram publishing).
- [ ] At least one content item in CRISP that is **Ready To Publish** for **Instagram** and includes an **image** (Instagram feed requires an image; field used: `image_reference_url` / image from your content flow).
- [ ] If needed, create and approve such content via your normal flow before the recording.

---

## 6. Pre-recording verification

Run through this once with the app and cron enabled:

1. **Connections**
   - Open **Connections**. The **Meta (Facebook & Instagram)** card is visible.
   - Click **Connect** → complete Facebook Login → redirect back to CRISP.
   - Select **one Facebook Page** and **one Instagram account**. Save.

2. **Approval**
   - Open **Content / Approval**.
   - Find an item that is **Ready To Publish** for **Instagram** and has an image.
   - Click **Approve** (or your publish CTA). UI should show queued/success.

3. **Publish**
   - Wait up to 1–2 minutes (if cron runs every 1 min) or trigger the worker manually:
     ```bash
     curl -H "Authorization: Bearer YOUR_CRON_SECRET" \
       "https://app.crispdigital.io/api/publish/meta-due"
     ```
   - Open the **Instagram** app or web for the same Business account and confirm the **new post** appears on the feed.

If any step fails, use the checklist above to fix (env vars, migration, Meta app settings, cron, or content).

---

## 7. Full list of requirements (summary)

| # | Requirement | Where |
|---|-------------|--------|
| 1 | `META_PUBLISHING_ENABLED=true` | Vercel env |
| 2 | `NEXT_PUBLIC_META_PUBLISHING_ENABLED=true` | Vercel env |
| 3 | `META_APP_ID` | Vercel env (from Meta app) |
| 4 | `META_APP_SECRET` | Vercel env (from Meta app) |
| 5 | `META_REDIRECT_URI` = `https://app.crispdigital.io/api/meta/oauth/callback` | Vercel env + Meta app redirect URI |
| 6 | `META_TOKEN_ENCRYPTION_KEY` (32-byte base64) | Vercel env |
| 7 | `CRON_SECRET` (same as cron-job.org header) | Vercel env + cron-job.org |
| 8 | `NEXT_PUBLIC_APP_URL` = `https://app.crispdigital.io` | Vercel env |
| 9 | Migration `009_meta_publishing_phase1.sql` applied | Supabase production |
| 10 | Meta app: redirect URI, App Domains, Privacy Policy, Data Deletion URL, permissions | Meta for Developers |
| 11 | Cron job: GET `.../api/publish/meta-due` with `Authorization: Bearer CRON_SECRET` | cron-job.org |
| 12 | Redeploy after env changes | Vercel |
| 13 | Test user with Page + Instagram Business + content with image | Your app + Meta account |

---

## 8. Push settings “in one go”

You **cannot** push env vars via git (they are secret). You can:

1. **Vercel**: Add or update all variables from **Section 1** (and Section 1.6 template) in one sitting, then click **Redeploy**.
2. **Meta app**: Complete **Section 3** in one sitting (redirect URI, domains, URLs, permissions).
3. **Cron**: Create the job once with the same `CRON_SECRET` (**Section 4**).
4. **Supabase**: Run the migration once if not already done (**Section 2**).

After that, the full flow is enabled and you can run the pre-recording verification (Section 6) and then start the screen recording.
