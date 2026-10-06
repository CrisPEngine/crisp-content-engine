# Threads API setup (CCE Meta Developer app)

Use the **same Meta Developer app** as CCE (Crisp Content Engine). Add the **Threads** use case / **Access the Threads API** product. Do not reuse Instagram Login app credentials for Threads OAuth unless Meta shows the same App ID for both products.

## Manual configuration (required before OAuth)

### 1. Meta Developer Console

1. Open [Meta for Developers](https://developers.facebook.com/) → **My Apps** → select the **CCE** app.
2. **Add product** (or **Use cases**) → enable **Threads API** / **Access the Threads API**.
3. Open **Threads API** → **Settings** (or **Basic** under the Threads app settings).
4. Note the **Threads App ID** and **Threads App Secret** (may match the main app ID/secret when Threads is added to the same app—copy what the console displays for Threads OAuth).

### 2. OAuth redirect URI

Under **Threads API** → **Settings** → **OAuth Redirect URIs**, add exactly:

`https://app.crispdigital.io/api/connections/threads/callback`

For local testing only (optional):

`http://localhost:3000/api/connections/threads/callback`

### 3. Deauthorize & data deletion callbacks

Under app **Settings** → **Advanced** (or Threads-specific compliance fields if shown):

| Callback | URL |
|----------|-----|
| Deauthorize | `https://app.crispdigital.io/api/meta/threads/deauthorize` |
| Data deletion | `https://app.crispdigital.io/api/meta/threads/data-deletion` |

(Data deletion status page: `/data-deletion-status?provider=threads`.)

### 4. Permissions (scopes)

Request only:

- `threads_basic`
- `threads_content_publish`

Do **not** add insights, manage replies, or other scopes unless a future feature requires them.

### 5. Testers

1. **App roles** → add Instagram/Threads test users (the Folian Threads account owner).
2. App mode **Development**: only testers can complete OAuth until App Review.

### 6. App Review

For production users outside testers, submit **Threads API** permissions for review with a screencast of: Connections → Connect Threads → approve content → scheduled publish (no live publish required in review if policy allows demo on test account).

## Vercel environment variables

Set on the **crisp-content-engine** project (never commit secrets):

| Variable | Description |
|----------|-------------|
| `THREADS_APP_ID` | Threads App ID from Meta console |
| `THREADS_APP_SECRET` | Threads App Secret |
| `THREADS_OAUTH_REDIRECT_URI` | Optional override; default is `{NEXT_PUBLIC_SITE_URL}/api/connections/threads/callback` |
| `NEXT_PUBLIC_SITE_URL` | `https://app.crispdigital.io` |
| `THREADS_PUBLISHING_ENABLED` | Set `false` to disable worker (default: enabled when `THREADS_APP_ID` is set) |
| `CRON_SECRET` | Same as Meta/LinkedIn workers |

Optional client flag:

| `NEXT_PUBLIC_THREADS_PUBLISHING_ENABLED` | Set `false` to hide client hints |

## Cron worker (cron-job.org)

CCE uses **cron-job.org** for all scheduled jobs (Vercel Hobby does not support frequent crons). Create a job on [cron-job.org](https://cron-job.org):

| Setting | Value |
|---------|--------|
| **URL** | `https://app.crispdigital.io/api/publish/threads-due` |
| **Schedule** | Every 5 minutes (`*/5 * * * *`) |
| **HTTP method** | GET or POST |
| **Request header** | `Authorization: Bearer {CRON_SECRET}` (same value as the Vercel env var) |

Manual test:

```bash
curl -s -H "Authorization: Bearer YOUR_CRON_SECRET" \
  "https://app.crispdigital.io/api/publish/threads-due"
```

## Acceptance OAuth (Folian)

1. In CCE: **Connections** → brand **Folian** → **Connect Threads**.
2. Complete Meta OAuth with the **Folian Threads** account (not Instagram `@folian.app` unless that is the same identity).
3. Confirm redirect: `/connections?brand=<folian-uuid>&connected=threads&account=<handle>&assigned=1`.
4. Run: `npx tsx scripts/verify-folian-threads-resolution.ts` → `ok: true` with API-returned handle.

Do not publish real posts during automated acceptance.
