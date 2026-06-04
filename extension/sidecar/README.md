# CRISP Sidecar Chrome Extension

Manifest V3 side panel extension for personal outreach drafting.

## Prerequisites

1. CCE running with Sidecar API enabled (see [docs/SIDECAR.md](../../docs/SIDECAR.md)).
2. `SIDECAR_API_SECRET` and `SIDECAR_OWNER_USER_ID` configured on the server.

## Build

```bash
cd extension/sidecar
npm install
npm run build
```

Or from repo root:

```bash
npm run build:sidecar
```

For tab-target debug in the side panel (`import.meta.env.DEV`), use a development build:

```bash
cd extension/sidecar && npm run build:dev
```

Output: `extension/sidecar/dist/`

## Load in Chrome (local only)

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. **Load unpacked** → select `extension/sidecar/dist`
4. Open extension **Settings** (gear) → set API URL (e.g. `http://localhost:3000`) and Bearer token

## Usage

1. Open Sidecar — first run shows **Set up CRISP Sidecar** (API URL + Bearer token).
2. Click **Save**, then **Test connection** (loads brands only after success).
3. Open X, LinkedIn, or another supported site in a normal tab (not `app.crispdigital.io`).
4. Click that tab once so Sidecar remembers it, then open the Sidecar side panel.
5. Click **Refresh page context** to capture selection, URL, and title (only on your click). If capture fails, use **Paste page URL manually**.
6. Choose brand, message type, objective, CTA strength, relationship stage.
4. **Generate draft** → review → **Copy draft** (paste manually on the platform).
5. Optionally **Save opportunity**, **Save contact**, or **Create content idea**.

## Host permissions

- **API:** `localhost:3000`, `127.0.0.1:3000`, `https://app.crispdigital.io` (Sidecar API calls only).
- **Page context:** `https://x.com/*`, `twitter.com`, `linkedin.com`, `reddit.com`, `facebook.com`, `instagram.com`, `youtube.com`, `bsky.app`, `threads.net` (see `src/lib/supportedPlatforms.ts`). `app.crispdigital.io` is API-only and is never used as reply context.

After changing permissions, run `npm run build:sidecar`, **remove** the old unpacked extension in Chrome, then **Load unpacked** on `extension/sidecar/dist` again (Chrome does not always refresh `host_permissions` on a simple Reload).

## Not included

- Chrome Web Store packaging
- Auto-insert into composers
- Auto-send / auto-post
- Background tab monitoring
