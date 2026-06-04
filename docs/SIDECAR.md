# CRISP Sidecar

Personal MVP: Chrome side panel + CCE API for drafting replies, DMs, and outreach in brand voice. **Manual copy only** — no auto-posting, no scraping, no Make integration.

## Enable (disabled by default)

Server:

```bash
SIDECAR_API_ENABLED=true
SIDECAR_API_SECRET=<long-random-secret>
SIDECAR_OWNER_USER_ID=<your-supabase-auth-uuid>
OPENAI_API_KEY=<key>
LLM_PROVIDER=openai
SIDECAR_LLM_MODEL=gpt-4o-mini
# Field-ID keyed Airtable responses (returnFieldsByFieldId=true)
AIRTABLE_BRANDPROFILES_CLIENT_NAME_FIELD_ID=fld9i3rA29NuS0Mjn
AIRTABLE_BRANDPROFILES_USER_ID_FIELD_ID=fld70rABHKmGpVHFM
```

Optional:

```bash
SIDECAR_SAVE_CONTACTS_ENABLED=true   # default on unless false
SIDECAR_CONTENT_IDEAS_ENABLED=true     # default on unless false
# Required when BrandProfiles has no user_id column (see Brand access below)
SIDECAR_BRAND_ALLOWLIST=Premium Die-Cast,Folian,CrisP Digital
NEXT_PUBLIC_ENABLE_SIDECAR=true        # client flag only (future UI)
```

Extension: set **CCE API URL** and **Bearer token** (`SIDECAR_API_SECRET`) in Sidecar settings.

### Brand access (server-enforced)

Sidecar uses the same ownership model as the main app (`/api/brands`): Airtable **BrandProfiles** field `user_id` = Supabase auth UUID.

| Mode | When | What the API returns |
|------|------|----------------------|
| `user_id` | `user_id` exists on BrandProfiles (default) | Only rows where `{user_id} = SIDECAR_OWNER_USER_ID` |
| `allowlist_only` | `user_id` missing **and** `SIDECAR_BRAND_ALLOWLIST` set | Only `client_name` values on the allowlist (trimmed, case-insensitive) |
| Error `sidecar_brand_access_not_configured` (503) | `user_id` missing **and** no allowlist | Safe failure — never lists the full table |

Implementation: [`src/lib/sidecar/brandAccess.ts`](../src/lib/sidecar/brandAccess.ts). Every route that touches a brand calls `resolveBrandProfile()` or `listSidecarBrands()` — the extension cannot widen access.

- **GET `/api/sidecar/brands`** — filtered list; `meta.accessMode`, `meta.userFilterActive`, `meta.allowlistActive`, `meta.emptyReason`
- **POST `/api/sidecar/draft`**, **opportunity**, **contact**, **content-idea** — `brandId` / `brand` resolved only within permitted profiles; otherwise `sidecar_brand_forbidden`, `sidecar_brand_not_allowed`, or `sidecar_brand_not_found`

Optional: `SIDECAR_BRAND_USER_ID_FIELD=false` forces allowlist-only (skips `user_id` probe). `SIDECAR_BRAND_ALLOWLIST` only narrows `user_id` mode when `SIDECAR_BRAND_ALLOWLIST_ENFORCE=true`.

**Field-ID mapping:** Sidecar lists BrandProfiles with `returnFieldsByFieldId=true`. Set both field IDs on the server (not in the extension):

| Env | Example (this base) | Resolves |
|-----|---------------------|----------|
| `AIRTABLE_BRANDPROFILES_CLIENT_NAME_FIELD_ID` | `fld9i3rA29NuS0Mjn` | `client_name` |
| `AIRTABLE_BRANDPROFILES_USER_ID_FIELD_ID` | `fld70rABHKmGpVHFM` | `user_id` |

[`readBrandProfileRecord()`](../src/lib/airtable/readBrandProfileRecord.ts) checks env field IDs first, then field names, then heuristics (UUIDs and `user_id` are never used as `client_name`). If rows match `user_id` but names stay empty, `meta.emptyReason` explains missing/wrong field IDs.

Airtable PAT stays server-side. Do not rely on Airtable UI permissions or extension-side filtering.

**Generate draft (`POST /api/sidecar/draft`):**

- **Airtable:** `AIRTABLE_BRANDPROFILES_TABLE` only — loads voice fields for the selected `brandId` (or `brand` name). Missing optional columns do not break the request (falls back to full record fetch). ContentQueue / `generated_from` are not used.
- **Supabase:** `sidecar_usage_events` logging only; failures are non-blocking.
- **LLM:** Server-side `OPENAI_API_KEY` + `LLM_PROVIDER=openai` + optional `SIDECAR_LLM_MODEL` (default `gpt-4o-mini`). This is separate from Make automations; CCE does not route Sidecar drafts through Make.
- **Extension payload:** sends `brandId`, enums exactly as in `/api/sidecar/config` (e.g. `Public reply`, `Community value`, `First interaction`).

**Extension page context:** Manifest `host_permissions` include X, LinkedIn, Reddit, Facebook, Instagram, YouTube, Bluesky, and Threads (see `extension/sidecar/src/lib/supportedPlatforms.ts`) plus API hosts only for `app.crispdigital.io` / localhost. The service worker remembers `lastReadableTabId` for supported platforms only; `app.crispdigital.io` is never reply context. After permission changes, remove and re-load the unpacked extension in Chrome (Reload alone may not update site access).

## Supabase migration

Apply manually when ready (not automated):

```bash
# From project root, using your Supabase workflow
supabase db push
# or run supabase/migrations/017_sidecar.sql in the SQL editor
```

Tables: `sidecar_engagement_opportunities`, `sidecar_contacts`, `sidecar_voice_examples`, `sidecar_usage_events`.

## Airtable

- **Reads:** `BrandProfiles` (existing)
- **Writes:** `ContentQueue` with `generated_from=sidecar` (ensure field exists or remove from payload if your base differs)

## API routes

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/sidecar/config` | Enums, flags, limits |
| GET | `/api/sidecar/brands` | Allowed brands |
| POST | `/api/sidecar/draft` | Generate draft (LLM abstraction) |
| POST | `/api/sidecar/opportunity` | Save to Supabase |
| POST | `/api/sidecar/contact` | Save/update contact |
| POST | `/api/sidecar/content-idea` | Create ContentQueue row |

Auth: `Authorization: Bearer <SIDECAR_API_SECRET>` on every route (GET and POST). Returns **404** when `SIDECAR_API_ENABLED` is not `true`.

CORS `Access-Control-Allow-Origin` is set only for `chrome-extension://*` origins, plus optional `SIDECAR_CORS_ALLOWED_ORIGINS` (comma-separated). Other origins are not reflected.

## LLM abstraction

- [`src/lib/llm/`](../src/lib/llm/) — provider interface (`openai` MVP; `anthropic` / `gemini` stubs for later BYO keys)
- Sidecar draft route calls `completeStructuredJson()` — never OpenAI directly

## Chrome extension

See [extension/sidecar/README.md](../extension/sidecar/README.md).

## Security

- Bearer `SIDECAR_API_SECRET` + `SIDECAR_OWNER_USER_ID` (personal MVP; not multi-tenant yet)
- **BrandProfiles visibility enforced on the server** (see Brand access above)
- Minimal permissions: `storage`, `sidePanel`, `activeTab`, `scripting`
- Page context captured only when panel opens / user clicks Refresh
- No background monitoring
- Airtable PAT and OpenAI keys never shipped in the extension
