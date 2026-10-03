# CCE Native Migration Roadmap

**Goal:** Move from `CCE + Airtable + Make` to `CCE Core + Supabase/Postgres + Native Workflow + Native Publishers` without breaking production.

**Rule:** Dual-run. Never cut a CRITICAL Make or Airtable dependency until the native path has processed real brands for a full content cycle.

Related: [CCE_ARCHITECTURE_AUDIT.md](./CCE_ARCHITECTURE_AUDIT.md), [CCE_INTELLIGENCE_UPGRADE.md](./CCE_INTELLIGENCE_UPGRADE.md).

---

## Current state

| Concern | Today | Native successor (now exists) |
|---|---|---|
| Identity / billing | Supabase | Unchanged |
| Brands | Airtable BrandProfiles | `brand_brains` mapped by `airtable_brand_id` |
| Strategy JSON | Airtable | `brand_strategies` (+ campaigns, channels) |
| Content queue | Airtable ContentQueue | `content_memory` + `content_drafts` |
| Briefs | Airtable StrategyUpdates | `native_content_briefs` |
| Generation worker | Make | `workflow_jobs` + intelligence pipeline |
| Sidecar / Idea Engine LLM | In-process OpenAI | Central `src/lib/ai` roles |
| LinkedIn / Meta publish | Native cron | Keep; later enqueue via `workflow_jobs` |
| Analytics | Not ingested | `performance_snapshots` (empty until connectors) |

---

## Dependency order

Do these in order. Skipping ahead reintroduces dual-source bugs.

### 0. Foundation (done tonight)

- Audit
- Central AI
- Intelligence tables + services
- Sidecar on roles
- Do **not** remove Make/Airtable

### 1. Turn on the database

- Apply `supabase/migrations/023_intelligence_foundation.sql`
- Confirm RLS with two test users / two brands
- Watch `ai_usage_logs` after one Sidecar draft

### 2. Dual-write memory (low risk)

On ContentQueue **approve** and **publish**, write/update `content_memory` (Airtable ID in `airtable_content_id`).  
Reads still come from Airtable. Native retrieval starts to see real history.

### 3. Seed Brand Brain from Airtable

One-way sync: BrandProfiles fields → `brand_brains` identity/voice/guardrails.  
Operators edit Brain in `/intelligence` without losing Airtable as source of record yet.

### 4. Analytics connector

Implement LinkedIn (then Meta) snapshot pull into `performance_snapshots`.  
Only then enable “which hooks perform” answers — still observational.

### 5. Opt-in native generate

Feature flag: `NATIVE_INTELLIGENCE_GENERATE_ENABLED`.  
For flagged brands: intent → brief → draft → review, then **write Airtable ContentQueue** so approval/publish stay unchanged.

Keep Make Quick Generate as default.

### 6. Migrate one Make job that is not generation

Good first candidate: a reminder email currently triggered by Make, **or** generation progress logging.  
Use `workflow_jobs` + existing cron secret. Leave strategy/content Make scenarios up.

### 7. Idea Engine is already native

When `IDEA_ENGINE_NATIVE_ENABLED=true`, retire `MAKE_IDEA_ENGINE_SERIES_WEBHOOK_URL` in production config. Routes already 410 the legacy webhooks.

### 8. Strategy generation last among generators

Strategy Make is CRITICAL and writes Airtable `strategy_json`.  
Native strategy exists, but product UI still edits Airtable. Dual-write native strategy on Airtable save, then flip reads brand-by-brand.

### 9. ContentQueue read cutover

Once memory dual-write has 100% of new posts and a backfill of recent published/scheduled items:

- Approval/schedule UIs read Supabase
- Airtable becomes a sync target or archive

Do **not** delete Airtable bases until a rollback window (30+ days) has passed.

### 10. Make content generation cutover

Only after step 5 has run in production for selected brands:

- Route Growth/Pro generate to native pipeline
- Keep Make regenerate as rollback for one cycle
- Then Creator, then Starter

### 11. Publishers onto `workflow_jobs`

LinkedIn/Meta due crons already native. Wrap them as job types for retries/visibility. Do not put publishing back into Make (`MAKE_CONTENT_PUBLISH_WEBHOOK_URL` is already unused).

### 12. MCP / Telegram

`dispatchIntelligenceAction` is the single business API. Add transports (MCP, Telegram) that call it with the same authz rules as the web app (user/brand ownership). Do not fork prompt logic.

---

## Classification reminder (do not cut early)

**Never cut in phase 2–5:**

- Airtable BrandProfiles, ContentQueue, StrategyUpdates
- Make strategy + multi-channel content webhooks + their callbacks

**Safe to leave forever as connectors:**

- Airtable as an optional export
- Make as a customer-specific integration

---

## Rollback

Every phase is additive until the explicit read cutover.

- Feature flags default off
- Airtable/Make paths remain compiled and tested (`regressionContracts.test.ts`)
- If native generate misbehaves, turn the flag off; queue/publish is still Airtable + cron

---

## Suggested timeline (not a promise)

| Window | Outcome |
|---|---|
| This week | Apply migration; Sidecar model fallback watch |
| Next cycle | Dual-write memory + Brand Brain seed |
| Next | LinkedIn analytics snapshots |
| Later | Opt-in native generate → Airtable queue |
| Last | Read cutover + retire Make generators |
