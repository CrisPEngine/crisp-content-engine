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
```

Optional:

```bash
SIDECAR_SAVE_CONTACTS_ENABLED=true   # default on unless false
SIDECAR_CONTENT_IDEAS_ENABLED=true     # default on unless false
SIDECAR_BRAND_ALLOWLIST=Premium Die-Cast,Folian,CrisP Digital,CRISP Content Engine,ABL International
NEXT_PUBLIC_ENABLE_SIDECAR=true        # client flag only (future UI)
```

Extension: set **CCE API URL** and **Bearer token** (`SIDECAR_API_SECRET`) in Sidecar settings.

**Brands:** `/api/sidecar/brands` lists all Airtable BrandProfiles unless `SIDECAR_BRAND_ALLOWLIST` is set (optional, case-insensitive). `SIDECAR_OWNER_USER_ID` is for Supabase writes only unless `SIDECAR_FILTER_BRANDS_BY_USER_ID=true`. Response includes `meta.emptyReason` when the list is empty.

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

- Minimal permissions: `storage`, `sidePanel`, `activeTab`, `scripting`
- Page context captured only when panel opens / user clicks Refresh
- No background monitoring
- API keys never shipped in the extension
