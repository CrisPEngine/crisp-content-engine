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

CCE requests:

| Scope | Purpose |
|-------|---------|
| `threads_basic` | Profile + OAuth |
| `threads_content_publish` | Publish posts and replies after human approval |
| `threads_manage_replies` | Create reply containers (`reply_to_id`) |
| `threads_keyword_search` | Resolve public post URLs to media ids (required for other accounts’ posts) |
| `threads_read_replies` | Read reply metadata where the API exposes it |

**Chris — Meta dashboard**

1. **App Dashboard → Threads API → Permissions** — add each permission above to the app.
2. **Development mode** — add Folian / brand testers under **App roles** so OAuth succeeds before App Review.
3. **Production** — submit **Advanced Access** for `threads_manage_replies` and `threads_keyword_search` (and keep `threads_content_publish` approved).

**Chris — reconnect in CCE**

1. **Connections** → brand → **Disconnect Threads** (if connected with old scopes).
2. **Connect Threads** again and accept all requested permissions.

**App Review checklist (Advanced Access)**

- [ ] Screencast: agent drafts a reply via MCP → owner opens **Approvals** → **Approve & post** → reply appears on Threads.
- [ ] Screencast: **Reject** on the same flow (no post created).
- [ ] Explain: agents **never** post without owner approval; CCE stores an immutable fingerprint of the approved text + target media id.
- [ ] Explain: keyword search is used only to resolve a public post URL to a media id for replies the brand chooses to join.
- [ ] Test user: Folian Threads account connected in Connections.

**Ready-to-submit use case (paste into App Review)**

> Crisp Content Engine (CCE) helps brand owners manage social content. Authorized AI agents may **draft** a text reply to a **public** Threads post from another creator when the brand owner wants to join a conversation. The agent submits the draft to CCE; the **account owner must approve** the exact reply on CCE’s approval page. Only after approval does CCE call the official Threads API (`reply_to_id`) to publish from the brand’s connected Threads profile. Keyword search is used to map a threads.net post URL to the target media id. Agents cannot publish without human approval. Typical volume is low (under 30 approved replies per day per account).

### 5. Testers

1. **App roles** → add Instagram/Threads test users (the Folian Threads account owner).
2. App mode **Development**: only testers can complete OAuth until App Review.

### 6. Diagnostics

Before App Review, verify access:

```bash
npx tsx scripts/diagnose-threads-reply-access.ts "https://www.threads.net/@handle/post/SHORTCODE"
```

Or via MCP: `cce_diagnose_threads_reply_access` with optional `targetUrl`.

## Vercel environment variables

Set on the **crisp-content-engine** project (never commit secrets):

| Variable | Description |
|----------|-------------|
| `THREADS_APP_ID` | Threads App ID from Meta console |
| `THREADS_APP_SECRET` | Threads App Secret |
| `THREADS_OAUTH_REDIRECT_URI` | Optional override; default is `{NEXT_PUBLIC_SITE_URL}/api/connections/threads/callback` |
| `NEXT_PUBLIC_SITE_URL` | `https://app.crispdigital.io` |
| `THREADS_PUBLISHING_ENABLED` | Set `false` to disable worker (default: enabled when `THREADS_APP_ID` is set) |
| `THREADS_REPLIES_DAILY_CAP` | Max approved replies per UTC day per account (default `30`) |
| `THREADS_REPLIES_ADMIN_DAILY_CAP` | Cap for `profiles.is_admin` super admins (default `100`; dedupe still enforced) |
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
5. Run: `npx tsx scripts/diagnose-threads-reply-access.ts` → `hasReplyScopes: true`.

Do not publish real posts during automated acceptance unless explicitly testing the approval flow.
