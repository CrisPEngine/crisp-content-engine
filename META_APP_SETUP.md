# Meta App Setup for CRISP Content Engine

This document is the **single reference** for configuring the Meta (Facebook) app so CRISP Content Engine can publish to Facebook Pages and Instagram Business accounts. Complete every section and use the checklists to confirm all use cases are covered.

---

## Overview

- **Flow**: CRISP uses **Facebook Login** only. Users sign in with Facebook; CRISP then discovers their **Facebook Pages** and **Instagram Business accounts** linked to those Pages. No separate "Instagram Login" or "embed URL" is used.
- **Products to configure**: **Facebook Login for Business** (and any Instagram-related permissions requested via that product). Do **not** set up "Business Login for Instagram" or "embed URL"—they are not used by CRISP.
- **App type**: **Business**.

---

## 1. Create the app

| Step | Action |
|------|--------|
| 1.1 | Go to [Meta for Developers](https://developers.facebook.com/apps/) and sign in. |
| 1.2 | Click **Create App**. |
| 1.3 | Select **Business** as the app type. |
| 1.4 | Fill in: **App Name** (e.g. "CRISP Content Engine"), **App Contact Email**, **Business Account** (select or create). |
| 1.5 | Create the app. |

---

## 2. Add and configure Facebook Login

| Step | Action |
|------|--------|
| 2.1 | In the app dashboard, find **Facebook Login** (or **Facebook Login for Business**) and click **Set Up**. |
| 2.2 | Choose **Web** as the platform if prompted. |
| 2.3 | Go to **Facebook Login → Settings** (or **Use cases → Customize → Facebook Login for Business → Settings**). |

### Valid OAuth Redirect URIs

Add **exactly** this URI (no trailing slash, correct domain):

```
https://app.crispdigital.io/api/meta/oauth/callback
```

If you use a different production domain, use that domain instead (e.g. `https://yourdomain.com/api/meta/oauth/callback`). The value must match the `META_REDIRECT_URI` environment variable in CRISP.

### Client OAuth settings

- Enable **Client OAuth Login**.
- Enable **Web OAuth Login**.

Save changes.

---

## 3. App settings (Settings → Basic)

Configure these in **Meta for Developers → Your App → Settings → Basic**:

| Field | Value | Required |
|-------|--------|----------|
| **App Domains** | `app.crispdigital.io` (or your production domain) | Yes |
| **Privacy Policy URL** | `https://app.crispdigital.io/privacy` (must be live and describe data use) | Yes |
| **Terms of Service URL** | `https://app.crispdigital.io/terms` (recommended) | Recommended |
| **Data Deletion Request URL** | `https://app.crispdigital.io/api/meta/data-deletion` | Yes |
| **App Icon** | 1024×1024 PNG (recommended for App Review) | Recommended for review |

Notes:

- Data Deletion Request URL must point at CRISP's data-deletion endpoint so Meta can send deletion callbacks. CRISP implements this at `/api/meta/data-deletion`.
- Do **not** add a trailing slash to URLs.

---

## 4. Permissions to request (for App Review)

CRISP needs the following permissions. Request them in **App Review → Permissions and Features** when you are ready to submit.

| Permission | Purpose in CRISP |
|------------|-------------------|
| **business_management** | **Forced by Meta's use case** ("Manage everything on your Page" / "Manage messaging and content on Instagram"). Required to grant access to managed assets (Pages and connected Instagram accounts) for publishing. Not removable once use case is selected. |
| **pages_show_list** | List the user's Facebook Pages so they can choose which Page to publish to. |
| **pages_read_engagement** | Read Page details to verify publishing permissions and show Page info in the app. |
| **pages_manage_posts** | Publish content to the user's Facebook Page on their behalf. |
| **instagram_basic** | Access Instagram Business account information so we can show and use the connected account for publishing. |
| **instagram_content_publish** | Publish content to the user's Instagram Business account on their behalf. |

**Note**: `business_management` is not strictly required by the Graph API endpoints we use, but Meta's new "Use cases" configuration flow forces it when you select "Manage everything on your Page" and "Manage messaging and content on Instagram." It cannot be removed once those use cases are selected.

### Suggested justification text (for Meta)

Use these when submitting each permission:

- **business_management**: "Required by Meta's selected business publishing use case to allow a business to grant our app access to managed assets (Pages and connected Instagram Business accounts) for publishing. We do not access ad accounts or perform Business Manager administration beyond enabling Page and Instagram publishing."
- **pages_show_list**: "List user's Facebook Pages to allow them to select which Page to publish content to."
- **pages_read_engagement**: "Read Facebook Page details to verify publishing permissions and display Page information to the user."
- **pages_manage_posts**: "Publish scheduled social media content directly to the user's Facebook Page on their behalf."
- **instagram_basic**: "Access Instagram Business account information to enable content publishing and display account details."
- **instagram_content_publish**: "Publish scheduled social media content directly to the user's Instagram Business account on their behalf."

---

## 5. What not to set up (CRISP does not use these)

| Item | Why CRISP doesn't use it |
|------|---------------------------|
| **Business Login for Instagram** | CRISP uses **Facebook Login** and discovers Instagram Business accounts via the connected Facebook Page. A separate Instagram login is not used. |
| **Embed URL** | That URL is for the Instagram Login product. CRISP only uses the Facebook OAuth redirect URI above. |
| **Instagram Basic Display** | For personal Instagram accounts and different use cases. CRISP uses the **Instagram Graph API with Facebook Login** for Business accounts linked to a Page. |

You can leave these unconfigured in the Meta app.

---

## 6. Credentials and environment variables

From **Settings → Basic**:

- **App ID** → set as `META_APP_ID` in your environment.
- **App Secret** (Show) → set as `META_APP_SECRET` in your environment. Keep this secret; server-side only.

CRISP expects these Meta-related environment variables (see also [META_DEPLOYMENT_GUIDE.md](./META_DEPLOYMENT_GUIDE.md)):

| Variable | Description |
|----------|-------------|
| `META_PUBLISHING_ENABLED` | Server-side feature flag; set to `true` only when Meta app is approved and you want publishing on. |
| `NEXT_PUBLIC_META_PUBLISHING_ENABLED` | Client-side feature flag; controls whether Meta connection and publishing UI are shown. |
| `META_APP_ID` | Meta app ID from Settings → Basic. |
| `META_APP_SECRET` | Meta app secret from Settings → Basic. |
| `META_REDIRECT_URI` | Must match the redirect URI in the Meta app (e.g. `https://app.crispdigital.io/api/meta/oauth/callback`). |
| `META_TOKEN_ENCRYPTION_KEY` | 32-byte key (e.g. base64) for encrypting tokens; generate with `openssl rand -base64 32`. |
| `CRON_SECRET` | Secret used to authenticate the cron job that calls `/api/publish/meta-due`. |
| `NEXT_PUBLIC_APP_URL` | App base URL (e.g. `https://app.crispdigital.io`); used for callbacks and data deletion. |

---

## 7. Use cases checklist (ensure all are covered)

Use this to confirm the Meta app and CRISP are set up for every supported flow.

### Connection and discovery

- [ ] User can start "Connect Meta" from CRISP (Connections page).
- [ ] User is redirected to **Facebook** login (not Instagram).
- [ ] After login, user is redirected back to CRISP at `META_REDIRECT_URI`.
- [ ] CRISP discovers the user's Facebook Pages.
- [ ] CRISP discovers Instagram Business accounts linked to those Pages (no separate Instagram login).
- [ ] User can select **one** Facebook Page and **one** Instagram account as publishing destinations.
- [ ] User can disconnect Meta; connection and related data are removed and pending jobs are invalidated.

### Publishing

- [ ] Approving **Facebook** content in CRISP creates a publish job and the cron worker can publish to the selected Page.
- [ ] Approving **Instagram** content in CRISP creates a publish job and the cron worker can publish to the selected Instagram Business account (image + caption).
- [ ] Publishing uses only the stored job payload (no re-read from Airtable at publish time).
- [ ] Success/failure is reflected in CRISP (e.g. Airtable status, published URL or error).

### Compliance and safety

- [ ] Privacy Policy URL is live and linked in the app.
- [ ] Data Deletion Request URL points to CRISP's `/api/meta/data-deletion` endpoint and responds correctly to Meta's signed requests.
- [ ] Meta access tokens are encrypted at rest (CRISP uses `META_TOKEN_ENCRYPTION_KEY`); tokens and Meta IDs are not written to Airtable.
- [ ] Feature flags keep Meta publishing off until the Meta app is approved and you enable it.

### Infrastructure

- [ ] Supabase migration for Meta (e.g. `009_meta_publishing_phase1.sql`) has been applied.
- [ ] Cron job is configured to call `GET https://app.crispdigital.io/api/publish/meta-due` with `Authorization: Bearer {CRON_SECRET}` on the desired schedule (e.g. every 5 minutes).

---

## 8. App Review preparation (before submitting)

Complete these before submitting for App Review:

- [ ] **Internal testing**: All items in the use cases checklist above pass with the feature flag enabled for your test environment.
- [ ] **Privacy Policy**: Live at the URL set in the app and describes how you use Facebook/Instagram data.
- [ ] **Data deletion**: `/api/meta/data-deletion` is deployed and tested (Meta sends a signed request; CRISP deletes user data and returns the required response).
- [ ] **Business Verification**: Completed in Meta Business Manager if required for your app type or permissions.
- [ ] **Screen recording**: 2–3 minutes showing:
  - User connecting Meta account (Facebook OAuth).
  - User selecting a Facebook Page and an Instagram account.
  - User approving and publishing **Facebook** content; post visible on the Page.
  - User approving and publishing **Instagram** content; post visible on the Instagram account.
  - (Optional) User disconnecting account and/or data deletion flow.
- [ ] **Test user** (if Meta asks): A test Facebook user with a Page and a connected Instagram Business account, and instructions so reviewers can log in and test the flow.
- [ ] **App icon**: 1024×1024 PNG uploaded in Settings → Basic.

### After approval

- [ ] Set the Meta app to **Live** in Settings → Basic.
- [ ] Enable `META_PUBLISHING_ENABLED` and `NEXT_PUBLIC_META_PUBLISHING_ENABLED` in production only when you are ready to launch the feature to users.

---

## 9. Quick reference URLs (CRISP production)

| Purpose | URL |
|---------|-----|
| OAuth redirect (must match in Meta app) | `https://app.crispdigital.io/api/meta/oauth/callback` |
| Data Deletion Request (Meta callback) | `https://app.crispdigital.io/api/meta/data-deletion` |
| Publish worker (cron) | `https://app.crispdigital.io/api/publish/meta-due` |
| Privacy Policy | `https://app.crispdigital.io/privacy` |

If your production domain is different, replace `app.crispdigital.io` with your domain everywhere (app settings, env vars, and cron job).

---

## 10. Related documentation

- **Deployment and env vars**: [META_DEPLOYMENT_GUIDE.md](./META_DEPLOYMENT_GUIDE.md)
- **Implementation details**: [META_PUBLISHING_IMPLEMENTATION.md](./META_PUBLISHING_IMPLEMENTATION.md)
- **Public docs**: [Content Engine docs – Publishing (Meta)](/docs/publishing/meta)
