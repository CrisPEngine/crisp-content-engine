# CCE State of the Union — 3 October 2026

Audit only. No migrations applied, no deploys, no production writes, no Make/Airtable removal.

Evidence is from the working tree at the time of the audit, `git` history, unit tests, `tsc`, a scoped lint, and **read-only** Supabase REST probes against the project configured in local `.env.local`. That database is not proven to be the same environment Vercel serves, because this machine’s Vercel login does not include a CrisP Content Engine project.

---

## Executive summary

**Where CCE is today:** a production content app whose live user journeys still run through **Airtable as the system of record** and **Make as the generator for strategy and Quick Generate**. Native LinkedIn and Meta publishing workers exist and are cron-driven against the Airtable queue. Native Idea Engine code is on `main` and has been exercised (10 runs in the inspected database), but those runs are **failed or stuck in `generating`**. None of the latest 10 reached `review` or `confirmed`.

**How intelligent it is:** the Intelligence Foundation (Brand Brain, strategy records, themes, briefs, memory, review, experiments, jobs, `/intelligence`, `/api/intelligence/actions`) is **real code with tests**, and the **schema is already present** on the inspected Supabase project. Every intelligence table probed has **zero rows**. The feature is **not committed** and is **not on `origin/main`**, so a GitHub deploy of `main` does not ship it. It is not the path a normal user hits for generation, approval, or publishing.

**Make dependence:** **high for the primary product loop** (strategy generation, monthly updates, Quick Generate, starter/creator content, regenerate, previews). Idea Engine can bypass Make only when `IDEA_ENGINE_NATIVE_ENABLED=true`. Publishing does not depend on Make.

**Airtable dependence:** **critical**. Brands, content queue, approval, and the publish crons still read/write Airtable. Supabase holds auth, usage, Idea Engine drafts, Sidecar, and (empty) intelligence tables. Intelligence is keyed by `airtable_brand_id`; it does not replace BrandProfiles.

**Can CCE safely manage Folian content today?** **NO.** Folian-style behaviour exists only as an in-memory unit test with a fake writer. There is no populated Brand Brain, no closed performance loop, and the production generator is still Make (plus a native Idea Engine that is not completing in the inspected data).

**Single biggest missing capability:** a **closed loop that is actually on the user path** — persisted brand/strategy context → native draft → approval in the queue users already use → publish → metrics → the next brief. The intelligence pipeline sketches that loop beside the product, not inside it.

**Next five engineering steps:**

1. Commit and ship only after Idea Engine runs reach `review` in production (unstick `generating`, confirm execute worker + `CRON_SECRET`).
2. Put Brand Brain on the real Idea Engine and Sidecar prompts using data users can edit, and prove one brand change changes output.
3. Stop treating intelligence memory as a second CMS: either feed approved Airtable items into it, or make intelligence drafts appear in the existing approval queue.
4. Ingest LinkedIn/Meta outcomes onto the **published queue item**, not only an empty `performance_snapshots` table.
5. Replace Make Quick Generate for one channel (LinkedIn) with the intelligence pipeline behind a flag, with the same approval/publish exit.

---

## 1. Repository truth

| Item | Value |
|---|---|
| Repository | `CrisPEngine/crisp-content-engine` |
| Remote | `git@github.com:CrisPEngine/crisp-content-engine.git` |
| Branch | `main` (tracks `origin/main`) |
| HEAD | `bf1f1a9804e2405892b744dc28b699851688403a` |
| HEAD subject | `idea engine fixes` (2026-06-06 +0400) |
| Other branches | `origin/main` only, plus `origin/vercel/dependencies-for-react-flight-g1low4` (dependency bot). **No intelligence feature branch.** |

Working tree classification: **`main` plus a large uncommitted intelligence overlay**. It is not a separate staging branch. Committed `main` is the Idea Engine native-migration line. Intelligence is local-only until committed.

Recent committed history (Idea Engine, then Sidecar):

- `bf1f1a9` idea engine fixes
- `961810c` single channel for idea gen
- `c9d502e` single idea gen limitation
- `5f5620f` signle idea timeout fix
- `d912489` idea engine fixes
- `f80f31f` inhousing single idea engine from Make
- `1a508a4` sidecar client linking

### Uncommitted (intelligence and wiring)

Modified: `docs/README.md`, `docs/SIDECAR.md`, `src/lib/idea-engine/config.ts`, `src/lib/llm/index.ts`, `src/lib/llm/providers/openai.ts`, `src/lib/nav.ts`, `src/lib/sidecar/draft.ts`, `src/lib/sidecar/promptBuilder.ts`.

Untracked: `src/lib/ai/`, `src/lib/intelligence/`, `src/lib/publishing/`, `src/app/(app)/intelligence/`, `src/app/api/intelligence/`, `supabase/migrations/023_intelligence_foundation.sql`, `supabase/migrations/024_intelligence_operations.sql`, docs `CCE_ARCHITECTURE_AUDIT.md`, `CCE_INTELLIGENCE_UPGRADE.md`, `CCE_NATIVE_MIGRATION_ROADMAP.md`, Sidecar brand-brain test.

**Committed `main` does not contain** `completeWithRole`, Brand Brain, or `/intelligence`. On `HEAD`, Sidecar calls `completeStructuredJson` directly. Idea Engine model resolution on `HEAD` is `IDEA_ENGINE_LLM_MODEL || 'gpt-4o'`. The working tree changes Idea Engine to `resolveModelForRole('WRITING')` (default `gpt-5.6`) and Sidecar to role `SIDECAR`. Those changes are **not deployed via git**.

### Deployment

Vercel CLI is authenticated to team `abl-internationals-projects`. Projects there are `folian-site`, `abl`, `folian-studio`, `folian-config`, `premiumdiecast`. **No CCE project.** There is no `.vercel/project.json` in this repo. **Deployed SHA: unverified.** If production tracks GitHub `main`, it is `bf1f1a9` and does not include the intelligence source.

---

## 2. Build and test health

| Check | Result |
|---|---|
| `npm test` (`vitest run`) | **38 files, 171 tests, 171 passed, 0 failed, 0 skipped** |
| `npx tsc --noEmit` | **Clean** (exit 0) |
| ESLint on `src/lib/ai`, `src/lib/intelligence`, `src/lib/publishing`, intelligence app routes | **0 errors, 2 warnings** (unused type imports in article publishers) |
| Production `next build` | **Not re-run in this audit** (previous session build of Idea Engine work succeeded; intelligence overlay has not had a fresh production build in this pass) |

Previously cited “164 passing” is stale. Current working tree is **171 passing**, including intelligence and AI-role tests. Those tests use in-memory stores and mocked or stubbed models. They do not prove a live OpenAI call or a populated database.

---

## 3. Database

### Local migrations

Tracked through `022_idea_engine_generation_stage.sql` (22 files in git).

Untracked:

- `023_intelligence_foundation.sql` — Brand Brain, strategy, campaigns, channel strategies, themes, theme plans, content memory, native briefs, drafts, edit learnings, performance snapshots, experiments/variants/results, learnings, scores, workflow jobs, `ai_usage_logs`, `airtable_entity_map`. RLS enabled. Owner policies are `user_id = auth.uid()` for all.
- `024_intelligence_operations.sql` — `content_memory.external_post_id/url`, `intelligence_action_logs` with owner SELECT policy.

Server intelligence access uses the **service role** (`getSupabaseService()`), which bypasses RLS. Isolation is application-level `.eq('user_id', userId)` in `supabaseStore.ts` (present on the reads inspected). A missed filter would be a cross-tenant bug; RLS would not save service-role calls.

### Remote database (read-only, `.env.local` project)

| Object | HTTP | Rows |
|---|---|---|
| `brand_brains`, `brand_strategies`, `content_themes`, `content_memory`, `native_content_briefs`, `content_drafts`, `user_edit_learnings`, `performance_snapshots`, `content_experiments`, `workflow_jobs`, `ai_usage_logs`, `intelligence_action_logs` | 200 (tables exist) | **0** |
| `idea_engine_runs.generation_stage` | 200 (column exists; migration 022 applied) | — |
| `idea_engine_runs` | 200 | **10** |

Latest 10 Idea Engine runs (status only):

- 1 `failed` with `generation_stage=failed` (new lifecycle code has written at least once)
- 3 `failed` with `generation_stage` null
- 6 `generating` with `generation_stage` null

**No `review`, `review_with_errors`, or `confirmed` in that window.** Native generation has not been completing in this database. Stuck `generating` rows predate stage tracking or never entered the execute worker.

Local `.env.local` has `IDEA_ENGINE_NATIVE_ENABLED`, `LLM_PROVIDER`, `IDEA_ENGINE_LLM_MODEL`, `SIDECAR_LLM_MODEL`, and `AI_MODEL_*` **unset**. Production Vercel values were not readable from this machine.

---

## 4. AI model map

There is **one HTTP implementation**: `src/lib/llm/providers/openai.ts` → `POST https://api.openai.com/v1/chat/completions` with `response_format: json_object`. Anthropic and Gemini are enum placeholders; `getLlmProvider` throws if selected. No xAI/Grok client.

### Working tree (not on `origin/main`)

| Capability | Role | Preferred (code default) | Fallbacks | Provider | Config | Call site | Structured | Retry | Timeout | Logging | Used by product? |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Sidecar draft | `SIDECAR` | `gpt-5.6` | `gpt-5`, `gpt-4o` | OpenAI only | `AI_MODEL_SIDECAR`, else legacy `SIDECAR_LLM_MODEL` if not `gpt-4o-mini`, else default | `sidecar/draft.ts` → `completeWithRole` | JSON object | 1 retry if `LlmError.retryable`, then next candidate | role 60s | `[ai]` + best-effort `ai_usage_logs` | **Only in working tree.** `HEAD` calls `completeStructuredJson` with `resolveSidecarLlmModel()` default **`gpt-4o-mini`** |
| Intelligence writing | `WRITING` | `gpt-5.6` | `gpt-5`, `gpt-4o` | OpenAI | `AI_MODEL_WRITING` or `IDEA_ENGINE_LLM_MODEL` | `intelligence/pipeline.ts` | JSON | same | 90s | same | **Not on user Quick Generate path.** Not committed |
| Intelligence review model pass | `REVIEW` | `gpt-5` | `gpt-4o` | OpenAI | `AI_MODEL_REVIEW` | same pipeline, failure swallowed | JSON | same | 60s | same | Pipeline only |
| Strategy role | `STRATEGY` | `gpt-5.6` | `gpt-5`, `gpt-4o` | OpenAI | `AI_MODEL_STRATEGY` | role exists; theme plans are **deterministic templates**, not this role | — | — | — | — | **Not called by strategy UI** (strategy UI still hits Make) |
| Research / extraction / classification / fast | roles exist | mini or `gpt-5` | `gpt-4o` | OpenAI | `AI_MODEL_<ROLE>` | **no production call site found** | — | — | — | — | Unused |
| Idea Engine | **bypasses `completeWithRole`** | Working tree: `IDEA_ENGINE_LLM_MODEL` or WRITING default `gpt-5.6`. **HEAD: `gpt-4o`** | none inside Idea Engine | OpenAI | `idea-engine/config.ts` | `completeWithValidationRepair.ts` → `completeStructuredJson` | Zod + one repair prompt | LLM retry on retryable | 90s `AbortSignal.timeout` | `[IdeaEngine/Lifecycle]`, not `ai_usage_logs` | **Yes, when native flag on.** Remote runs are failing/stuck |
| Quick Generate, strategy, monthly brief, regenerate, preview | **Make** | unknown (inside Make) | n/a | Make scenario | `MAKE_*_WEBHOOK_URL` | `src/app/api/content/generate`, strategy routes, `contentBrief.ts` | Make’s problem | n/a | n/a | webhook logs | **Yes. This is the normal user path** |

### Is central routing enforced?

**No.** Routing exists only for callers of `completeWithRole` (Sidecar in the working tree, intelligence pipeline). Idea Engine, and every Make scenario, do not use it. On committed `main`, Sidecar does not use it either.

### Current-model readiness

1. Roles can be overridden with `AI_MODEL_<ROLE>` and `AI_MODEL_<ROLE>_FALLBACKS` without code edits — **working tree only**.
2. Literal defaults (`gpt-5.6`, `gpt-5`, `gpt-4o`, `gpt-4o-mini`) live in `roles.ts`. `HEAD` Idea Engine hardcodes `gpt-4o`.
3. Providers cannot be changed in practice. `LLM_PROVIDER=anthropic|gemini` selects a missing provider and throws.
4. OpenAI is hard-coded as the only client. Different roles cannot use different providers.
5. No admin or end-user model picker.
6. A new model id can be introduced via env **if OpenAI accepts it** and if the caller uses `completeWithRole`. Reasoning-family names (`gpt-5`, `o1`, `o3`, `o4`) omit temperature. That heuristic will misfire on unrelated model names containing those substrings.
7. `jsonSchemaHint` is not sent to OpenAI; the API only sets `json_object`. Schema enforcement is downstream Zod (Idea Engine) or trusted JSON (intelligence).

### Fallback behaviour (`completeWithRole`)

Falls through to the next candidate when:

- message looks like model-not-found / no access (including some 404s)
- error is `retryable` (429, 5xx, timeout) after one in-candidate retry

Does **not** fall through on non-retryable errors (bad request, invalid JSON, missing key). That is the right split for schema bugs.

Gaps:

- Fallback **reason** is not a first-class field. Logs have `fallback_used` and, on the failed attempt, `error_code`.
- Failure logs hardcode `provider: 'openai'` even if a future provider threw.
- A timeout on `gpt-5.6` silently continues to `gpt-5` then `gpt-4o`. That can hide “this model id is wrong or too slow” behind a cheaper success.
- `ai_usage_logs` has **0 rows** remotely, so either no role-routed call has succeeded against this database, or inserts are failing because the table was empty of traffic. Intelligence code is not on `main`, which explains the empty log.

Idea Engine does not use this fallback ladder.

---

## 5. Sidecar

**Committed path (`HEAD`):** extension → `/api/sidecar/draft` → `completeStructuredJson` → OpenAI. Model from `SIDECAR_LLM_MODEL` / `SIDECAR_OPENAI_MODEL`, default `gpt-4o-mini` in `llm/index.ts` on `HEAD`. Brand context is Airtable BrandProfiles. No Brand Brain table read. Conversational draft, not a tool runner. Persistence is Sidecar tables from migration `017` (not re-audited row-by-row here).

**Working tree:** `draft.ts` calls `completeWithRole('SIDECAR', …)`. `promptBuilder.ts` accepts an optional Brand Brain block. That block is only as good as the caller passing it; Sidecar does not load `brand_brains` by itself in the draft route inspected. Actions: Sidecar does not call `dispatchIntelligenceAction`.

No live Sidecar model call was made in this audit (would spend tokens and is not required to see the call path). **Actual production model: unverified** without Vercel env and logs. Code default on `main` is `gpt-4o-mini`.

---

## 6. Intelligence pipeline vs what users hit

`runContentIntelligencePipeline` (`src/lib/intelligence/pipeline.ts`):

1. Load Brand Brain or throw.
2. Load strategy, themes, memory, learnings, edit learnings.
3. Token-overlap retrieval (`contentMemory.ts`), not embeddings.
4. `buildStructuredBrief` (deterministic assembly).
5. `completeWithRole('WRITING')`.
6. Optional `completeWithRole('REVIEW')`; errors become “no model revision”.
7. Deterministic `reviewDraft` (phrase strip + pattern scores).
8. Persist brief, draft, memory.

Entry points: `POST /api/intelligence/actions` with `draft_content` / `create_brief`, and tests. **Not** `POST /api/content/generate`.

**Normal user:** Content → Generate calls Make (`MAKE_MULTI_CHANNEL_CONTENT_GENERATION_WEBHOOK_URL`, or `MAKE_WEBHOOK_STARTER` on starter). Strategy approve triggers `MAKE_CONTENT_GENERATION_WEBHOOK_URL` or the multi-channel webhook by plan. Idea Engine is a separate screen and, when the native flag is on, uses its own OpenAI prompt builder — **not** this pipeline.

Classification: **functional in unit tests and callable if the uncommitted API is running and a Brand Brain row exists. Not the primary path. Not on `origin/main`. Zero brains in the inspected database, so the pipeline cannot run there today.**

---

## 7. Brand Brain

Schema JSON columns: `identity`, `voice`, `guardrails`, `knowledge`, plus `brand_brain_examples` (good/poor/representative/user_edited). Types cover positioning, audiences, products, competitors, tone, vocabulary, prohibited phrases, claims, examples. There is no separate normalised table per concern; it is document JSON.

Working-tree UI `/intelligence` (nav label “Brand Intelligence”, uncommitted) loads brands from `/api/brands` (Airtable), then reads/writes brain JSON via `/api/intelligence/brain`. Users *could* edit JSON if this UI were deployed and migration were applied. **Remote `brand_brains` count is 0**, so nobody has saved one in this database.

Retrieval: intelligence pipeline and review use the stored JSON. Sidecar on `main` does not. Idea Engine loads **Airtable** brand fields in `loadBrandProfile`, not `brand_brains`. Retrieval is “include the sections the brief builder selects,” not a vector store, and not a dump of every example into every prompt — but it is still prompt stuffing of the selected slices, not selective retrieval over a corpus.

Multi-brand: unique `(user_id, airtable_brand_id)`. Tenant check is `user_id` on service-role queries plus RLS for direct client access.

**Changing brain text and observing a live draft was not demonstrated.** The Folian test does this in memory with a stub model.

---

## 8. Strategy

Two systems:

- **Live:** `/strategy` and monthly updates POST to `MAKE_STRATEGY_WEBHOOK_URL`. Approval lives in the existing strategy flow and then kicks Make content generation. This is how the product answers “what is the brand trying to do?” today — Airtable strategy fields inside the Make payload.
- **Native `brand_strategies`:** CRUD via intelligence store and `/api/intelligence/strategy`. Objectives, audiences, pillars, campaigns, channel strategies are columns. **0 rows.** Not read by Quick Generate or Idea Engine. The intelligence brief *would* include them if a row existed.

CCE cannot yet answer that question from native strategy for a real brand. It can only answer it through the legacy strategy record if Make/Airtable have it.

---

## 9. Themes

`buildThemePlan` is a **template**: fixed channel adaptations, rotating subtopics and hook directions (`problem-led`, `evidence-led`, `objection-led`). It does not call a model. It does not publish, measure coverage, or detect gaps from performance. `execute_theme_plan` can fan those pieces into the intelligence pipeline (one draft per piece) **if a brain exists**. No theme rows remotely. No link from published Airtable items back to `content_themes`.

Status: **partially implemented service, unused in production.**

---

## 10. Content memory

`content_memory` stores topic, hook, argument, CTA, channel, theme, campaign, publication status, body. Retrieval is lexical overlap with thresholds (hook 0.55, argument 0.6, body duplicate 0.72) plus a founder-story density warning. Theme continuation is an explicit flag: same theme is allowed to recur; same hook/argument still warns.

This is a reasonable heuristic, not semantic memory. It only sees rows in `content_memory`. **Published Airtable content is not ingested into it** (0 rows). Generation therefore cannot avoid repeating what the brand already published.

---

## 11. Structured briefs

`buildStructuredBrief` fills objective, audience, channel, content type, funnel, theme, pillar, campaign, angle, hook direction, argument, proof, voice, CTA, guardrails, related memory lines, and learning lines **when those objects exist**. The writer prompt includes `briefToWriterContext(brief)`. That is real consumption by the intelligence writer, not an unused interface.

It is not used by Idea Engine or Make. Several fields will be empty until strategy, theme, memory, and learnings exist. Remote `native_content_briefs`: 0.

---

## 12. Editorial review

Two layers:

- **Deterministic** (`review/prosePatterns.ts`, `brandCompliance.ts`): prohibited phrases, generic openers, “in conclusion”, “key takeaway”, rhetorical-question / triplet / contrast-pattern hits. High-severity issues or pattern threshold can strip phrases. Scores do not hard-reject. Notes say brand voice stays authoritative.
- **Model** (`REVIEW` role): asked to return `{ improvedDraft }` and only fix real issues. **Errors are swallowed.** If the model returns a rewrite, it replaces the draft.

What it does **not** do: factual claim checking against a knowledge base, citation verification, or channel-specific CTA policy beyond brief fields. It can still overwrite voice if the review model ignores its instruction. Tests cover pattern detection; no live review call was made.

---

## 13. Learning from edits

`recordUserEdit` / `analyseEditDiff` store original vs user text and token-level removals/additions, with confidence stepped by `nextConfidence` (candidate → observed → strong → confirmed style ladder in code). `revise_content` action calls this. Future briefs include edit-learning lines via `buildComposableContext`.

Remote `user_edit_learnings`: **0**. Nothing has been learned from a real user. Quick Generate edits in the Airtable queue do not call this.

---

## 14. Performance intelligence

| Source | What exists | Wired to live posts? |
|---|---|---|
| LinkedIn org share statistics + social actions | `ingestion/linkedin.ts` can pull impressions, clicks, reactions, comments, shares and derive CTR/engagement | Only if `sync_linkedin_analytics` runs against a **content_memory** row with an external post id. Table empty |
| Manual `ingest_performance` | Writes `performance_snapshots` | No UI on the main approval screen |
| Meta publishing | Native publisher logs publish responses (migration 012) | Not mapped into intelligence snapshots in the primary cron |
| Baselines | `computeBaseline` / `compareToBaseline` over snapshots | No data |

CCE **cannot** currently answer which hooks, themes, CTAs, or times beat a baseline for a real account. The math exists; the facts do not.

---

## 15. Experiments

`create_experiment` inserts an experiment plus empty control/variant shells and required-control labels (`PRAGMATIC_CONTROLS`). `analyse_experiment` compares primary-metric averages and sets confidence from sample size. It does **not** generate the two posts, schedule them against each other, or pull metrics by itself unless something else calls `attach_experiment_variant` and `collect_experiment_results`.

Remote experiments: **0**. This is an analysis library plus CRUD, not an operating A/B system.

---

## 16. Approval

**Live approval** is Airtable ContentQueue status (including `Needs Approval`), surfaced in the content approval UI and email reminders (`/api/email/content-approval-reminder` filters `{status} = "Needs Approval"`). Idea Engine confirm writes **ready** items into that queue.

**Intelligence approval** sets `content_memory.publication_status` to `approved` / `review` / `scheduled`. It does not create an Airtable queue row. Those drafts never appear in the approval inbox users already have.

---

## 17. Scheduling

Live schedule is `scheduled_time` on Airtable (and Idea Engine item `scheduled_time` copied at confirm). Due publishing is **external cron** (cron-job.org or similar) calling:

- `GET/POST /api/publish/linkedin-due` with `CRON_SECRET`
- `GET /api/publish/meta-due` with bearer `CRON_SECRET`

Retries: `retry-failed`, `retry-auth-failed`. Timezone: brand timezone used when Idea Engine/confirm computes slots; queue workers compare timestamps. There is no general job queue for the live product. `workflow_jobs` is intelligence-only and empty. Native scheduling of intelligence memory does not fire the LinkedIn cron, because that cron reads Airtable.

---

## 18. Publishing map

| Destination | Supported on the live path? | Native? | Make? | Airtable? | Auth | Metrics |
|---|---|---|---|---|---|---|
| LinkedIn | **Yes** (due worker) | Yes, `publishToLinkedIn` | No | Queue is source of “ready” | OAuth connection per brand | Not in intelligence snapshots |
| Facebook / Instagram | **Yes** if `META_PUBLISHING_ENABLED` (default on) | `meta-due` worker | No | Queue | Meta token | Publish response logging, not a learning loop |
| X | Idea Engine can **draft** X | No native publisher found on the due cron | Make if Quick Generate includes X | Queue | — | No |
| Blog | Draft via Idea Engine or Make | No CMS publisher | Make for generation | Queue copy | — | No |
| WordPress, Webflow, Framer, Payload, Next.js | **No** | — | — | — | — | — |
| Generic article webhook | Working-tree `webhookArticlePublisher` only | POST JSON if `ARTICLE_PUBLISH_WEBHOOK_URL` allowlisted | Secret may reuse `MAKE_SHARED_SECRET` | Optional brand id in body | Shared secret | No |

`publish_content` in intelligence, when `immediate` is false, **enqueues a note** and marks memory scheduled. It does not publish. `immediate` calls `publishStoredMemory` → LinkedIn publisher or webhook. That code is uncommitted and has no rows to publish.

---

## 19. Long-form articles

Idea Engine can generate one blog item (title + body) and, after confirm, store it in ContentQueue. There is no slug, SEO title, meta description, tags, featured image pipeline, canonical URL, or draft/live CMS state in the native publisher. The article publisher interface (`src/lib/publishing`) is the right extension point: `ArticlePublisher.publish(ArticlePublishRequest)` registered by destination. Today only `linkedin` and allowlisted `webhook` exist. Framer/Webflow/WordPress/Payload are not implemented.

---

## 20. Make dependency

| Journey | If Make disappeared tomorrow |
|---|---|
| Onboarding scrape | Degrades if `MAKE_ONBOARDING_WEBHOOK_URL` is used. **Optional** |
| Strategy + monthly strategy | **Breaks.** `MAKE_STRATEGY_WEBHOOK_URL` is required by those routes |
| Quick Generate (all plans) | **Breaks.** Multi-channel and starter webhooks |
| Creator content after strategy approve | **Breaks.** `MAKE_CONTENT_GENERATION_WEBHOOK_URL` |
| Single-item regenerate | **Breaks.** `MAKE_CONTENT_REGENERATE_WEBHOOK_URL` |
| Marketing preview packs | **Breaks.** `MAKE_PREVIEW_WEBHOOK_URL` |
| Idea Engine | **Survives only if** `IDEA_ENGINE_NATIVE_ENABLED=true` and the execute worker actually finishes. Inspected data says it is not finishing |
| Approval inbox | **Survives** (Airtable) |
| LinkedIn/Meta publish crons | **Survive** |
| Intelligence pipeline | Does not use Make, but is not the product |

**Make independence: not achieved.** Critical generation and strategy journeys still require Make. Publishing does not.

---

## 21. Airtable dependency

| Data | Source of truth today | Supabase copy |
|---|---|---|
| Brand profile | **Airtable BrandProfiles** | Intelligence brain is optional and empty; keyed by Airtable id |
| Strategy document users approve | Airtable / Make callback | `brand_strategies` empty |
| Content queue, approval, schedule | **Airtable ContentQueue** | Idea Engine holds pre-confirm drafts only |
| Published post identity | Airtable + LinkedIn/Meta ids on the queue | `content_memory.external_post_id` unused |
| Usage / billing counters | Supabase | — |
| Idea Engine runs | Supabase | 10 runs, not a healthy queue |
| Sidecar sessions | Supabase | separate from intelligence |

If Airtable disappeared: brand pickers, approval, scheduling, and both publish crons break. Supabase would still hold auth and failed Idea Engine runs. Intelligence tables would not reconstruct the business.

Sync direction is **not** bidirectional. `airtable_entity_map` exists in migration 023 and was not row-counted separately; intelligence tables being empty implies the map is unused.

---

## 22. MCP / external actions

`POST /api/intelligence/actions` (uncommitted) authenticates:

- web: Supabase session
- `x-cce-channel: mcp` + `INTELLIGENCE_MCP_SECRET` or `OPERATOR_API_SECRET` + `x-cce-user-id`
- `telegram` + `TELEGRAM_BOT_SECRET` + `TELEGRAM_USER_MAP`

Rate limit and in-memory idempotency (lost on cold start). Actions are implemented as store methods. **They execute only when tables exist and a brain exists.** Against the inspected database, `get_brand` throws “Brand brain not found”. No production traffic (`intelligence_action_logs` = 0).

| Action | In code | Safe to call today on this DB |
|---|---|---|
| get/create brand, strategy, theme | yes | get fails until a brain is saved; create works only after deploy of this route |
| generate_theme_plan / generate_ideas | yes, deterministic | needs a theme row |
| create_brief / draft_content | yes, calls OpenAI | needs brain + keys + deployed route |
| revise_content | yes | needs a draft id |
| list/approve/reject/schedule | memory status only | does not touch Airtable approval |
| publish_content | queue note or immediate LinkedIn | not the cron path |
| publish_article | LinkedIn or webhook | webhook needs allowlist |
| get_performance / compare | yes | empty |
| create/analyse experiment | yes | no live traffic assignment |
| ingest / sync LinkedIn analytics | yes | needs published memory + token |
| seed_folian_brain / validate_brand | yes | would write data; not run in this audit |

Telegram can sit on this route **without a second business layer**, but the route is not on `main`, publish/approve do not match the live CMS, and several mutating actions are in `TELEGRAM_ACTIONS` (including `execute_theme_plan` and `approve_content`). That is too much authority for an unmonitored bot until the data plane matches production.

---

## 23. Folian readiness

Instruction tested conceptually, not by publishing.

| Stage | Score | Why |
|---|---|---|
| 1. Brand understanding | FAIL | Brain table empty; live brand is Airtable. Folian test is an in-memory fixture |
| 2. Audience understanding | FAIL | Same. Native strategy audiences unused |
| 3. Strategy | PARTIAL | Make/Airtable strategy may exist for a brand; native strategy does not, and was not verified for Folian specifically |
| 4. Theme development | NOT IMPLEMENTED | Template planner only; no rows; not in the user UI on `main` |
| 5. Idea generation | PARTIAL | Idea Engine UI exists; inspected runs do not complete |
| 6. Research | NOT IMPLEMENTED | `RESEARCH` role has no call site. No web retrieval |
| 7. Content memory | FAIL | Heuristic code, zero rows, not connected to published posts |
| 8. Brief creation | PARTIAL | Real builder in unused pipeline |
| 9. Draft quality | UNVERIFIED | No live generation accepted in this audit. Idea Engine completions not present in DB |
| 10. Human/brand review | PARTIAL | Deterministic linters + optional model rewrite in unused pipeline. Human approval is the Airtable inbox |
| 11. Multi-channel adaptation | PARTIAL | Theme template describes different shapes; Make still does real multi-channel generate; Idea Engine is one channel at a time in the new UX |
| 12. Approval | PARTIAL | Works for Airtable queue. Intelligence drafts are invisible to it |
| 13. Scheduling | PARTIAL | Works for queue items with `scheduled_time` and a cron. Not for intelligence memory |
| 14. Publishing | PARTIAL | LinkedIn and Meta native from the queue. No blog CMS. X not published natively |
| 15. Performance ingestion | FAIL | No snapshots |
| 16. Baseline comparison | NOT IMPLEMENTED | Functions only |
| 17. Experimentation | NOT IMPLEMENTED | CRUD + mean comparison, no operated test |
| 18. Learning | FAIL | No edit learnings, no performance learnings |
| 19. Future-generation improvement | FAIL | Nothing feeds the next Make or Idea Engine prompt from outcomes |
| 20. MCP / remote control | PARTIAL | Route designed and uncommitted; cannot operate Folian until brains and the real queue exist |

**Overall: NO.**

---

## 24. Production vs scaffolding

| Capability | Class |
|---|---|
| Auth, billing, plan caps | PRODUCTION OPERATIONAL (not re-tested live) |
| Airtable brands + content queue | PRODUCTION OPERATIONAL |
| Make strategy + Quick Generate | PRODUCTION OPERATIONAL / LEGACY |
| Idea Engine native | FUNCTIONAL BUT NOT PRIMARY PATH, and **not completing** in inspected data |
| Idea Engine via Make | LEGACY fallback when native flag off |
| Sidecar on `main` | PRODUCTION OPERATIONAL as a personal draft tool (model unverified) |
| Sidecar via `SIDECAR` role + Brand Brain | SCAFFOLDING ONLY (uncommitted) |
| AI role router | SCAFFOLDING ONLY relative to `main`; used by uncommitted Sidecar + intelligence |
| Brand Brain, native strategy, themes | SCAFFOLDING ONLY (schema applied, 0 rows, UI uncommitted) |
| Brief + intelligence writer + review | FUNCTIONAL BUT NOT PRIMARY PATH (tests + uncommitted API) |
| Content memory, edit learning | SCAFFOLDING ONLY |
| Performance, baselines, experiments | SCAFFOLDING ONLY |
| LinkedIn + Meta due publish | PRODUCTION OPERATIONAL (code + cron design; this audit did not fire cron) |
| Blog CMS publish | NOT IMPLEMENTED |
| `workflow_jobs` | SCAFFOLDING ONLY |
| MCP/Telegram action API | FUNCTIONAL BUT NOT PRIMARY PATH (uncommitted, empty data) |

---

## Capability matrix

| Capability | Status | Production path? | Make | Airtable | Evidence | Next step |
|---|---|---|---|---|---|---|
| AI routing | Working tree only; OpenAI-only | No | Bypassed by Make | No | `complete.ts`, `openai.ts`; `ai_usage_logs` = 0 | Use router for Idea Engine; log fallback reason; don’t ship `gpt-5.6` until an account call succeeds |
| Current-model readiness | Env override per role; provider swap is a stub | No | Make models unknown | No | `roles.ts`; anthropic/gemini undefined | Provider interface + one non-OpenAI proof, or document OpenAI-only |
| Sidecar | Live on `main` without Brand Brain | Yes, as shipped on `main` | No | BrandProfiles | `HEAD` `draft.ts` vs working tree diff | Pass brain only after a brain row exists |
| Brand Brain | Schema + UI uncommitted, 0 rows | No | No | Brand id key | REST count 0 | Seed one brand from Airtable; block generation if brain missing |
| Strategy | Make is live; native table empty | Make yes / native no | **Critical** | **Critical** | `strategy/*/route.ts`; `brand_strategies` 0 | Read native strategy in one generator behind a flag |
| Themes | Deterministic planner | No | No | No | `themes.ts`; `content_themes` 0 | Don’t call this “strategy execution” until drafts hit the queue |
| Content memory | Lexical, empty | No | No | Not synced | `contentMemory.ts`; count 0 | Ingest confirmed/published queue items |
| Brief engine | Implemented inside pipeline | No | No | No | `brief.ts`, `pipeline.ts` | Call it from Idea Engine or replace Make for one channel |
| Writing | Two writers: Make (live) and intelligence (dark) | Make | **Critical** | Prompt context | `content/generate/route.ts` | Flagged native LinkedIn draft into ContentQueue |
| Editorial review | Deterministic + optional model in dark path | No | No | No | `review/index.ts` | Run on Idea Engine output before confirm; don’t auto-replace voice |
| User-edit learning | Code only | No | No | Edits in queue ignored | `editLearning.ts`; count 0 | Diff queue body on approve |
| Performance intelligence | LinkedIn fetch helper, no facts | No | No | Queue has no intelligence link | `ingestion/linkedin.ts`; snapshots 0 | Nightly sync for published LinkedIn ids |
| A/B testing | Record + average | No | No | No | `experiments.ts`; count 0 | Do not build more experiment UI until metrics exist |
| Approval | Airtable inbox | Yes | No | **Critical** | approval reminder route | Write intelligence drafts into the same status field |
| Scheduling | Queue + external cron | Yes | No | **Critical** | `linkedin-due`, `meta-due` | Document cron URLs; intelligence must not invent a second clock |
| LinkedIn publishing | Native worker | Yes | No | **Critical** | `linkedin/publish` | Keep; attach metrics |
| Meta publishing | Native worker, flag default on | Yes | No | **Critical** | `meta-due` | Same |
| Blog publishing | Draft only | Partial | Generation often Make | Queue text | no CMS publisher | Webhook or one CMS behind `ArticlePublisher` |
| Make independence | Not close for generate/strategy | — | — | — | webhook map in §20 | One channel off Make |
| Airtable independence | Not close | — | — | — | §21 | Brands + queue are the long pole |
| MCP | API coded, unused | No | No | Brand ids | `actions/route.ts`; logs 0 | Deploy only after brain + queue bridge |
| Telegram readiness | Same API, broad mutate list | No | No | Same | `TELEGRAM_ACTIONS` | Read-only bot first |

---

## 26. Next build plan (not started)

### P0 — before trusting CCE with Folian

| Task | Size | Risk | Depends on | Impact |
|---|---|---|---|---|
| Confirm Vercel env: `IDEA_ENGINE_NATIVE_ENABLED`, `CRON_SECRET` or `IDEA_ENGINE_EXECUTE_SECRET`, `OPENAI_API_KEY`, site URL. Trace one new run’s `[IdeaEngine/Lifecycle]` logs through `execute_route_invoked` → `run_marked_review` or a real `failed` | SMALL | LOW | Deployed Idea Engine (`main` already has worker) | Stops silent hangs |
| Clear or fail the six remote `generating` runs so the UI is honest | SMALL | LOW | Stale guard (6 min) or a one-off status update **outside this audit** | Users aren’t stuck at 0/3 |
| Do not default WRITING/SIDECAR to `gpt-5.6` until one logged successful call with token usage exists | SMALL | MEDIUM | OpenAI account access | Avoids fallback theatre |
| Create Folian Brand Brain from the existing Airtable profile and show it on `/intelligence` **after** the code is committed | MEDIUM | MEDIUM | Commit + apply already-present schema (schema is applied; app is not) | First real brain |

### P1 — Make independence for one journey

| Task | Size | Risk | Depends on | Impact |
|---|---|---|---|---|
| LinkedIn-only native draft that uses Brand Brain + brief and **confirm writes ContentQueue** the way Idea Engine confirm already does | LARGE | HIGH | P0 brain, Airtable field map | First Make-free post that can still be approved and published |
| Keep strategy on Make until that single channel is trusted | — | — | — | Avoids a second rewrite |

### P2 — closed loop

| Task | Size | Risk | Depends on | Impact |
|---|---|---|---|---|
| On publish, store LinkedIn post id on the queue item and nightly `sync` into `performance_snapshots` | MEDIUM | MEDIUM | LinkedIn token scopes | First true “what worked” |
| Diff approved body vs AI body into `user_edit_learnings` | MEDIUM | MEDIUM | Stable original text | Voice preferences |
| Only then attach experiments to two queued posts | LARGE | HIGH | Metrics | Otherwise A/B is paperwork |

### P3 — expansion

| Task | Size | Risk | Depends on | Impact |
|---|---|---|---|---|
| One blog `ArticlePublisher` (webhook is already sketched) | MEDIUM | MEDIUM | Allowlisted URL | Stops copy/paste for articles |
| Provider interface beyond OpenAI | LARGE | MEDIUM | Router actually used | Model freedom |
| Telegram read-only (`get_brand`, `list_pending_content`, `get_performance`) | SMALL | MEDIUM | P1–P2 data | Remote control without a second brain |

---

## What this audit did not do

- No deploy, no migration apply, no row updates, no social publish, no emails.
- No live OpenAI call, so **models actually invoked in production were not observed**. Code defaults and an empty `ai_usage_logs` table are the evidence.
- Vercel production SHA for CCE was not visible from the authenticated team.
- Full `next build` and full-repo ESLint were not re-run; `tsc --noEmit` was clean.
