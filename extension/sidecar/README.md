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

Output: `extension/sidecar/dist/`

## Load in Chrome (local only)

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. **Load unpacked** → select `extension/sidecar/dist`
4. Open extension **Settings** (gear) → set API URL (e.g. `http://localhost:3000`) and Bearer token

## Usage

1. Open Sidecar — first run shows **Set up CRISP Sidecar** (API URL + Bearer token).
2. Click **Save**, then **Test connection** (loads brands only after success).
3. Open a normal website tab (not `chrome://` pages).
4. Click the Sidecar toolbar icon on that tab (grants `activeTab` for scripting).
5. Click **Refresh page context** to capture selection, URL, and title (only on your click).
6. Choose brand, message type, objective, CTA strength, relationship stage.
4. **Generate draft** → review → **Copy draft** (paste manually on the platform).
5. Optionally **Save opportunity**, **Save contact**, or **Create content idea**.

## Host permissions

Default manifest allows `localhost:3000` and `https://app.crispdigital.io`. For another API host, add it to `host_permissions` in `manifest.config.ts` and rebuild.

## Not included

- Chrome Web Store packaging
- Auto-insert into composers
- Auto-send / auto-post
- Background tab monitoring
