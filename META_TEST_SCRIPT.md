# Meta (Instagram/Facebook) – Test Script

Use this script to verify **Connect Meta**, **ID resolution**, and **publishing** end-to-end. Ensure Meta publishing is enabled and env is set (see [META_ENABLE_EVERYTHING_CHECKLIST.md](./META_ENABLE_EVERYTHING_CHECKLIST.md)) before running.

---

## Prerequisites

- [ ] **Env (Vercel / .env.local):**  
  `META_PUBLISHING_ENABLED=true`, `NEXT_PUBLIC_META_PUBLISHING_ENABLED=true`,  
  `META_APP_ID`, `META_APP_SECRET`, `META_REDIRECT_URI`, `META_TOKEN_ENCRYPTION_KEY`,  
  and optionally `META_LFB_CONFIG_ID`.
- [ ] **Meta app:** Valid OAuth Redirect URIs include  
  `https://app.crispdigital.io/api/meta/oauth/callback` (and Supabase callback if you use Sign in with Facebook).
- [ ] **Cron:** Worker URL `https://app.crispdigital.io/api/publish/meta-due` with `Authorization: Bearer YOUR_CRON_SECRET` (e.g. every 1–2 min for testing).
- [ ] **Test user:** Has at least one **Facebook Page** and an **Instagram Business account** linked to that Page.

---

## 1. Connect Meta (OAuth + ID resolution)

**Goal:** Confirm the “Connect Instagram/Facebook” flow, token exchange, and that we fetch Pages + IG and store tokens.

| Step | Action | Expected |
|------|--------|----------|
| 1.1 | Sign in to the app. | Session active. |
| 1.2 | Go to **Connections**. | Page loads; **Meta (Facebook & Instagram)** card is visible. |
| 1.3 | Click **Connect Instagram/Facebook**. | Redirect to Facebook/Meta OAuth consent. |
| 1.4 | Grant permissions (Pages + Instagram). | Redirect back to `/connections?connected=meta`. |
| 1.5 | On Connections, check Meta card. | Shows “Connected”; optionally shows Facebook Page and Instagram account. |
| 1.6 | If multiple Pages/IG: use **Select page** / **Select Instagram** (if present). | Selected Page and IG are stored for publishing. |

**Backend checks (optional):**

- OAuth start: `GET /api/meta/oauth/start` (while logged in) → redirects to Meta with scopes:  
  `business_management`, `pages_show_list`, `pages_read_engagement`, `pages_manage_posts`, `instagram_basic`, `instagram_content_publish`.
- Callback: Exchanges code → long-lived token; fetches Pages; for each Page with token, fetches connected IG via Graph; stores `meta_connections`, `meta_pages` (page_id, token), `meta_instagram_accounts` (ig_user_id, connected_page_id).

---

## 2. Resolve IDs (already done in callback)

**Goal:** Confirm we have page_id, ig_user_id, and token stored.

| Step | Action | Expected |
|------|--------|----------|
| 2.1 | After connect, open **Connections**. | Meta card shows connected Page name and/or Instagram handle. |
| 2.2 | (Optional) In Supabase: `meta_pages` has `user_id`, `page_id`, `page_name`, `page_access_token_encrypted`; `meta_instagram_accounts` has `ig_user_id`, `ig_username`, `connected_page_id`. | IDs and encrypted token present. |

Publishing uses: **Facebook** → page_id + Page token; **Instagram** → ig_user_id + Page token (same token as the linked Page).

---

## 3. Publishing constraints (Instagram)

**Goal:** Confirm Instagram publish uses a **public** image URL and the two-step flow (media → media_publish).

- **Image URL:** `image_url` sent to `/{ig_user_id}/media` must be **publicly accessible** (no auth, no robots blocking). Use a public HTTPS URL (e.g. Cloudinary, your CDN).
- **Flow:**  
  1) `POST /{ig_user_id}/media` with `image_url` + `caption` → get `id` (container).  
  2) `POST /{ig_user_id}/media_publish` with `creation_id` = that `id`.  
- **Videos:** Require the video publish flow (stricter/slower); this script focuses on image posts.

---

## 4. Create content and queue a Meta publish job

**Goal:** Have at least one item that can be published to Facebook or Instagram (Instagram needs an image).

| Step | Action | Expected |
|------|--------|----------|
| 4.1 | Create or use existing content that is **Ready To Publish** for **Facebook** and/or **Instagram**. | Record in Airtable/Content Queue with status ready for publish. |
| 4.2 | For **Instagram:** Ensure the item has an **image** (e.g. `image_reference_url` or equivalent) pointing to a **public** HTTPS URL. | So worker can pass `imageUrl` to Graph API. |
| 4.3 | In the app, go to **Content / Approval** (or your approval UI). | List shows content; Meta-connected channels available. |
| 4.4 | Approve the item for **Facebook** and/or **Instagram**. | App creates row(s) in `publish_jobs` with `platform`, `target_id` (page_id or ig_user_id), `payload_json` (text, imageUrl), `scheduled_time`, `status=queued`. |

---

## 5. Run the publish worker (cron or manual)

**Goal:** Process queued Meta jobs and verify no errors.

**Option A – Cron (production):**  
Wait for the next cron run (e.g. 1–2 min). Check logs or DB for job status.

**Option B – Manual trigger (testing):**

```bash
# Replace YOUR_CRON_SECRET with your real CRON_SECRET
curl -s -H "Authorization: Bearer YOUR_CRON_SECRET" \
  "https://app.crispdigital.io/api/publish/meta-due"
```

**Expected response:**  
`{"ok":true,"processed":1,...}` or `{"ok":true,"processed":0}` if no due jobs.

**If you get:**

- `404` → Meta publishing disabled (check feature flags).
- `401` → Wrong or missing `CRON_SECRET`.
- `500` → Check server logs (token, Graph API errors, missing image URL, etc.).

---

## 6. Verify on Facebook and Instagram

| Step | Action | Expected |
|------|--------|----------|
| 6.1 | Open the **Facebook Page** (and linked **Instagram** account) used in Connections. | - |
| 6.2 | Check feed for the new post. | New post appears with correct text and image (Instagram: image required). |
| 6.3 | In app: **Content / Published** or Airtable: status = Published, optional published_url. | Record shows published. |

---

## 7. Quick reference – core functionality checklist

| # | Item | Status |
|---|------|--------|
| 5 | **Connect Meta flow** | Button “Connect Instagram/Facebook” → Meta OAuth with scopes: instagram_basic, instagram_content_publish, pages_show_list, pages_read_engagement, pages_manage_posts, business_management. Callback exchanges code for token. |
| 6 | **Resolve IDs** | Fetch Pages → for each Page with token, fetch connected IG → store page_id, ig_user_id, access token (encrypted) and expiry. |
| 7 | **Publishing** | Instagram: image_url must be public → POST /{ig_user_id}/media then POST /{ig_user_id}/media_publish. Facebook: feed or photo post with Page token. |

---

## 8. Optional – LinkedIn and general app flow

| Step | Action | Expected |
|------|--------|----------|
| 8.1 | **Connections:** Connect **LinkedIn** (personal or business). | LinkedIn card shows connected. |
| 8.2 | **Content / Generate (or equivalent):** Create a piece of content. | Content appears in queue/approval. |
| 8.3 | **Content / Approval:** Approve for LinkedIn and/or Meta. | publish_jobs created for each channel. |
| 8.4 | **Cron / manual:** Trigger `meta-due` and LinkedIn worker (if applicable). | Jobs processed; posts appear on channels. |

---

## Troubleshooting

- **“No Facebook Pages found”** → User must have at least one Page with CREATE_CONTENT/MANAGE/MODERATE.
- **“Instagram requires an image”** → Job must have `payload_json.imageUrl` and URL must be public.
- **Instagram container error (e.g. “URL not accessible”)** → Image URL must be HTTPS, no auth, no blocking robots.
- **Token / decrypt errors** → Check `META_TOKEN_ENCRYPTION_KEY` (or fallback) and that it did not change after storing tokens.

Use this script together with [META_ENABLE_EVERYTHING_CHECKLIST.md](./META_ENABLE_EVERYTHING_CHECKLIST.md) for full setup and recording.
