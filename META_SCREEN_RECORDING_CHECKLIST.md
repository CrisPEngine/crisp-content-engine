# Meta App Review – Screen Recording Checklist

Use this to enable the app and record a demo that shows correct use of `instagram_content_publish` (and related Meta publishing).

---

## 1. Enable the feature in the app

### Environment variables (Vercel or local)

Set these so the Meta publishing flow is visible and working:

| Variable | Value | Where |
|----------|--------|--------|
| `META_PUBLISHING_ENABLED` | `true` | Server (API routes, cron) |
| `NEXT_PUBLIC_META_PUBLISHING_ENABLED` | `true` | Client (UI) |

Ensure these are already set (from Meta App setup):

- `META_APP_ID`
- `META_APP_SECRET`
- `META_REDIRECT_URI` (e.g. `https://app.crispdigital.io/api/meta/oauth/callback`)
- `META_TOKEN_ENCRYPTION_KEY`
- `CRON_SECRET` (needed to trigger the publish worker for the demo)

After changing env vars, redeploy (Vercel) or restart the dev server so the flags take effect.

---

## 2. What the recording should show

Meta expects to see:

1. **Login with Facebook** – User signs in and grants access.
2. **Select Instagram Business account** – User chooses the connected Page/IG they manage.
3. **Content created/approved in your app** – Content is prepared and explicitly approved in CRISP.
4. **Publish to Instagram** – The approved post is published to the user’s Instagram Business main feed (organic, no ads).

So the flow in the recording should be: **Connect Meta → Select Page + IG → Approve content (Instagram) → Post appears on Instagram**.

---

## 3. Recording steps (in order)

### A. Before you start recording

- Use an **Instagram Business account** linked to a **Facebook Page** (required for the API).
- Have at least one piece of content that is **Ready To Publish** for **Instagram** and includes an **image** (Instagram feed posts require an image).
- If you don’t have such content, create and approve content for Instagram (with image) via your normal flow first.

### B. Record the following

1. **Connections**
   - Go to **Connections**.
   - Confirm the **Meta (Facebook & Instagram)** card is visible (only if `NEXT_PUBLIC_META_PUBLISHING_ENABLED=true`).
   - Click **Connect** → complete **Facebook Login** and grant permissions.
   - When returned to the app, **select the Facebook Page** and **Instagram Business account** you’ll use for the demo.

2. **Content approval**
   - Go to the **Content / Approval** screen.
   - Find an item that is **Ready To Publish** for **Instagram** and has an image.
   - Show the post content and image briefly, then click **Approve** (or equivalent) to publish.
   - The UI should reflect that the post was queued/sent (e.g. “Published” or “Scheduled”/“Queued” depending on your copy).

3. **Trigger the publish worker (so the post goes live during the demo)**

   The app publishes via a cron job that calls the Meta worker. To make the post appear **during** the recording, trigger the worker once right after approval:

   - **Option 1 – Browser (same session)**  
     Open a new tab and call:
     ```text
     https://app.crispdigital.io/api/publish/meta-due
     ```
     With header:
     ```text
     Authorization: Bearer YOUR_CRON_SECRET
     ```
     (Use a simple extension that adds the header, or run a one-off request from DevTools.)

   - **Option 2 – Terminal**
     ```bash
     curl -H "Authorization: Bearer YOUR_CRON_SECRET" \
       "https://app.crispdigital.io/api/publish/meta-due"
     ```
     Replace `YOUR_CRON_SECRET` with your actual `CRON_SECRET` env value.

   - **Option 3 – Cron**  
     If cron runs every 1–2 minutes, you can approve in step 2, then wait for the next run and show the Instagram feed once the post appears.

4. **Proof on Instagram**
   - Open **Instagram** (app or web) for the **same Business account**.
   - Show the **main feed** and the **new post** that was just published from CRISP.

---

## 4. Checklist before submitting

- [ ] `META_PUBLISHING_ENABLED=true` and `NEXT_PUBLIC_META_PUBLISHING_ENABLED=true` are set and the app has been restarted/redeployed.
- [ ] Meta app credentials and `CRON_SECRET` are set.
- [ ] Recording shows: **Facebook Login → select Page + IG → approve Instagram content (with image) → trigger worker (or wait for cron) → post visible on Instagram feed**.
- [ ] No personal Instagram accounts; only the connected **Instagram Business** account is used.
- [ ] Post is **organic** (no ads) and user **explicitly approved** the content before publish.

---

## 5. If the Meta card or approval options don’t show

- Confirm **both** flags are `true`:  
  `META_PUBLISHING_ENABLED` and `NEXT_PUBLIC_META_PUBLISHING_ENABLED`.
- Redeploy or restart so the new env is loaded (especially for `NEXT_PUBLIC_*`).
- Hard refresh the app (e.g. Ctrl+Shift+R / Cmd+Shift+R).
- Check the browser console and network tab for 404s on `/api/meta/*` (would indicate server flag off or wrong domain).

---

## 6. Quick reference – what you need “on” for the recording

| What | Enable |
|------|--------|
| Meta connection and UI | `META_PUBLISHING_ENABLED=true` and `NEXT_PUBLIC_META_PUBLISHING_ENABLED=true` |
| OAuth and API | Same flags + `META_APP_ID`, `META_APP_SECRET`, `META_REDIRECT_URI`, `META_TOKEN_ENCRYPTION_KEY` |
| Actually publishing the post during the demo | Call `GET /api/publish/meta-due` with `Authorization: Bearer {CRON_SECRET}` after approval, or wait for cron |

Once this is done, you have everything enabled in the app to successfully create the screen recording for the permission/feature Meta asked about.
