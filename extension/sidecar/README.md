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

1. Select text on any supported page (optional but recommended).
2. Click the Sidecar toolbar icon to open the side panel.
3. Click **Refresh page context** to capture selection, URL, and title (only runs on your click).
4. Choose brand, message type, objective, CTA strength, relationship stage.
4. **Generate draft** → review → **Copy draft** (paste manually on the platform).
5. Optionally **Save opportunity**, **Save contact**, or **Create content idea**.

## Host permissions

Default manifest allows `localhost:3000` and `https://app.crispdigital.io`. For another API host, add it to `host_permissions` in `manifest.config.ts` and rebuild.

## Not included

- Chrome Web Store packaging
- Auto-insert into composers
- Auto-send / auto-post
- Background tab monitoring
