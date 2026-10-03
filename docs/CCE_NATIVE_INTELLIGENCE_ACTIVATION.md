# CCE native intelligence activation

Date: 2026-10-03. This report only treats a step as operational when it was actually run.

## Folian native brand, 2026-10-03 23:37 +04

Supabase is the source of the Folian Brand Brain. Airtable BrandProfiles is a compatibility row only.

| Item | Value |
| --- | --- |
| Canonical brand id | `03cba45a-6faf-4b6c-a20b-2c2496318b58` |
| Airtable BrandProfiles id | `recampvDrWLSi3FrA` |
| Brand mapping | `airtable_entity_map` `fbff4b32-11d9-4b3c-b9da-2c63c8fdf493` |
| ContentQueue id | `recfekUP2n9mhLGar` |
| Queue mapping | `content_memory` `cd85ae6d-8493-4a0d-afc4-65a6719c0171` |
| Status | Needs Approval |
| Platform | LinkedIn |
| generated_from | intelligence |
| Writing model | gpt-6.1-sol, no fallback, 830 in / 338 out, 8928 ms |
| Review model | gpt-6.1-sol, no fallback, 313 in / 234 out, 4539 ms |
| Estimated cost | $0.005040 writing + $0.002966 review |
| Historical ContentQueue rows | 0 |

A second setup found the existing Folian BrandProfiles row and did not create another. The approval formula used by `/api/content/queue` matched this record. The LinkedIn due-publisher formula matched 0 records. Nothing was approved, scheduled, or published. Migration `025_ai_usage_cost.sql` is not applied, so reasoning tokens and estimated cost are not stored on `ai_usage_logs` yet. The estimate is computed from the central price table.

## GPT-6 registry and acceptance attempt, 2026-10-03 23:21 +04

The role catalog now targets the GPT-6 family through `POST /v1/responses`. Temperature is omitted. Reasoning effort is `none` for Luna task roles and `low` or `medium` for Sol. Astra is `DEEP_STRATEGY` only. `IDEA_ENGINE_LLM_MODEL` and `SIDECAR_LLM_MODEL` are ignored unless `AI_LEGACY_MODEL_OVERRIDES=true`. `AI_MODEL_<ROLE>` still wins.

Minimal Responses probes against the production key:

| Model | Endpoint | Effort | Result | Actual model | Latency | Tokens |
| --- | --- | --- | --- | --- | --- | --- |
| gpt-6-luna | responses | none | success | gpt-6-luna | 1343 ms | 21 in / 12 out |
| gpt-6.1-sol | responses | low | success | gpt-6.1-sol | 31990 ms | 21 in / 12 out |
| gpt-6-astra | responses | low | success, then billing | gpt-6-astra | 1396 ms | 21 in / 12 out |

A later Astra call returned HTTP 429 `credit_balance_exhausted`. Structured `json_object` output worked. The input must contain the word `json`; the adapter adds that instruction when a prompt omits it.

The Folian journey then reached Airtable and found no BrandProfiles or ContentQueue rows whose client name or body contains Folian. No Brand Brain, strategy, memory, brief, draft, or queue record was created. The journey is not operational.

## Live acceptance attempt, 2026-10-03 23:05 +04

The repo is linked to Vercel project `crisp-content-engine` (team Chris' projects). Production deployment `dpl_JAUD7vjRCMSoRkyp1eGozdv2PsZK` is commit `bf1f1a9804e2405892b744dc28b699851688403a` (`idea engine fixes`), aliased to `https://app.crispdigital.io`. Nothing was deployed and production env vars were not changed.

Production env presence: `OPENAI_API_KEY`, `AIRTABLE_PAT`, `AIRTABLE_BASE_ID`, `AIRTABLE_BRANDPROFILES_TABLE`, `AIRTABLE_CONTENTQUEUE_TABLE`, `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`, `IDEA_ENGINE_LLM_MODEL`, `IDEA_ENGINE_NATIVE_ENABLED`, `LLM_PROVIDER`, and `SIDECAR_LLM_MODEL` are set. `AI_MODEL_*` overrides are not set. The production Supabase project ref matches local `.env.local`.

Non-secret model config read from production: `LLM_PROVIDER=openai`, `IDEA_ENGINE_LLM_MODEL=gpt-4o`, `IDEA_ENGINE_NATIVE_ENABLED=true`, `SIDECAR_LLM_MODEL=gpt-4o-mini`. The router uses `IDEA_ENGINE_LLM_MODEL` as the WRITING preferred model. It ignores `SIDECAR_LLM_MODEL` when that value is `gpt-4o-mini`, so SIDECAR stays on the code default `gpt-5.6`.

Every role was probed with a minimal JSON prompt and no fallback:

| Role | Preferred | Result | Latency | Classification |
| --- | --- | --- | --- | --- |
| FAST | gpt-4o-mini | failed | 516 ms | billing |
| EXTRACTION | gpt-4o-mini | failed | 271 ms | billing |
| CLASSIFICATION | gpt-4o-mini | failed | 936 ms | billing |
| WRITING | gpt-4o | failed | 407 ms | billing |
| STRATEGY | gpt-5.6 | failed | 242 ms | billing |
| RESEARCH | gpt-5 | failed | 234 ms | billing |
| REVIEW | gpt-5 | failed | 230 ms | billing |
| SIDECAR | gpt-5.6 | failed | 294 ms | billing |

Provider error, identical for every role: `You have no credits remaining.` No actual model, tokens, or fallback. OpenAI returns this on HTTP 429, which the router previously treated as a rate limit and could have walked fallback models. Billing messages are now classified as `billing` and do not fall back.

The Folian journey was not started. No Brand Brain, strategy, memory ingest, brief, draft, review, or ContentQueue row was created. The native journey is not operational.

## What changed

The Intelligence Foundation checkpoint was already on `main`. This phase wired that foundation into the existing Idea Engine, Airtable ContentQueue contract, and an operator diagnostics view.

- Idea Engine generation now calls the central `completeWithRole('WRITING')` router instead of a direct structured-JSON call.
- The execute worker returns HTTP 202 immediately and continues inside `after()` on the long-lived route, so the dispatcher’s 15 second abort no longer kills generation.
- Fallback is allowed only for timeout, HTTP 429, and retryable provider outages. Invalid model, authentication failure, HTTP 400, schema errors, and programming errors do not fall through to another model.
- Successful fallbacks are recorded on `ai_usage_logs.error_code` as `fallback:<reason>`. The table has no separate fallback-reason column.
- Confirming an intelligence draft writes the existing ContentQueue through `confirmMemoryToContentQueue`: platform LinkedIn, status `Needs Approval`, `generated_from` `intelligence`. A second confirm with `airtableContentId` already set does not create another row.
- `/intelligence` can display and edit Brand Brain and native strategy JSON, and a Diagnostics tab lists role assignments plus the latest `ai_usage_logs` rows.
- Sidecar already calls `completeWithRole('SIDECAR')` and, when a Brand Brain row exists, loads strategy, memory, and learnings into selected context. That path was not exercised against a live Folian brain.

## Git commits

| Commit | Meaning |
| --- | --- |
| `2cdf2621920832333f0277672ff079085730fbc2` | Checkpoint the CCE Intelligence Foundation before native activation. Not pushed. |
| `90152a514d536b0a4bbc5a9f4efa4fcc9055b606` | Checkpoint native intelligence activation and the GPT-6 role registry. Not pushed. |

The Folian native-brand code after `90152a5` is still uncommitted. Nothing was deployed.

## Idea Engine root cause

Ten historical runs were inspected in the Supabase project pointed at by local `.env.local`:

| Status | `generation_stage` | Count | Error stored |
| --- | --- | --- | --- |
| `failed` | `failed` | 1 | `Content generation failed. Please try again.` |
| `failed` | null | 3 | same generic message |
| `generating` | null | 6 | empty |

None had reached `review` or `confirmed`.

`generation_stage` null means `setRunGenerationStage` / `updateRunReviewStatus` never ran. Those six rows are from March and May 2026. The worker never reported a result. That matches the earlier failure mode: `after()` on the short `POST /api/idea-engine/run` was dropped after the response, and the stale-run guard only runs when someone later polls the run. A second defect in the current dispatcher made that worse: it `fetch`es the execute route with `AbortSignal.timeout(15_000)` while the execute route used to await the full generation. The abort then fell back to `after()` on the short route again.

The June failures stored only the user-facing sentence. The underlying provider or Airtable error was not kept, so those four rows cannot be diagnosed further from the database.

## Idea Engine fix

- `POST /api/idea-engine/run/[runId]/execute` now accepts the job (202) and runs `generateChannelsForRun` in `after()` with `maxDuration` 300. The 15 second dispatch timeout only waits for acceptance.
- Caught `IdeaEngineError` and `LlmError` values are persisted as `<code>: <message>`, wrapped with the existing user-facing sentence so the UI still has a readable prefix.
- Runs still `generating` after 6 minutes are marked failed with: `Generation did not finish within 6 minutes and no worker result was persisted.`

A new diagnostic run was created and executed in-process (not via Make, not via the HTTP worker):

- Run `77ac599d-bc19-46b1-815f-27f5e6c054f8`
- Final status `failed`
- `generation_stage` `failed`
- Persisted error: `Content generation failed. Please try again. (idea_engine_missing_airtable: Airtable is not configured for Idea Engine)`

It did not remain `generating`. It also did not reach `review`, because this environment has no `AIRTABLE_PAT`, `AIRTABLE_BASE_ID`, or `OPENAI_API_KEY`.

The six abandoned `generating` rows were then set to `failed` with that stale-worker message so they cannot sit open indefinitely. That recovery is not evidence that generation works.

## Model availability tests

`probeConfiguredModels()` was invoked through the live activator. Every role stopped before a provider call:

`llm_missing_api_key: OPENAI_API_KEY is not configured`

No latency or token usage exists. The registry was not silently changed to a cheaper model.

Configured assignments (OpenAI is the only implemented provider):

| Role | Preferred | Fallbacks |
| --- | --- | --- |
| FAST | `gpt-4o-mini` | `gpt-4o` |
| EXTRACTION | `gpt-4o-mini` | `gpt-4o` |
| CLASSIFICATION | `gpt-4o-mini` | `gpt-4o` |
| WRITING | `gpt-5.6` | `gpt-5`, `gpt-4o` |
| STRATEGY | `gpt-5.6` | `gpt-5`, `gpt-4o` |
| RESEARCH | `gpt-5` | `gpt-4o` |
| REVIEW | `gpt-5` | `gpt-4o` |
| SIDECAR | `gpt-5.6` | `gpt-5`, `gpt-4o` |

Whether this OpenAI account can invoke `gpt-5.6` or `gpt-5` is unknown. Idea Engine WRITING still honors `IDEA_ENGINE_LLM_MODEL` / `AI_MODEL_WRITING` when those are set.

## Model router

`completeWithRole` is the native entry for Idea Engine writing and for Sidecar. `classifyLlmFailure` / `mayFallback` refuse fallback for malformed requests, unsupported parameters, invalid schema, programming errors, invalid model configuration, and authentication failure. Usage rows record role, provider, model, fallback flag, latency, tokens, and success. Requested model and fallback reason are logged; the reason is stored in `error_code` when a fallback succeeds.

## Folian Brand Brain

Not created. `brand_brains` still has 0 rows. Local `.env.local` has Supabase keys and no Airtable credentials, and the Vercel account `chris-9559` (team ABL International's projects) has no CCE project to pull production env from. Folian facts were not invented to fill the gap. The `/intelligence` editor can save a brain once a brand profile can be loaded.

## Folian native strategy

Not created. `brand_strategies` was not written. Make/Airtable strategy was not modified.

## Memory ingestion

Not run. `content_memory` still has 0 rows. `activateFolianNativeJourney` contains an idempotent ingest that skips queue record ids already stored on `airtable_content_id`. It was not executed.

## Brief, writing, and review

Unit tests cover brief assembly, memory retrieval, deliberate theme continuation versus hook collision, and editorial/brand review. No live Folian brief, WRITING call, or review was produced. `ai_usage_logs` still has 0 rows.

## ContentQueue bridge

`confirmMemoryToContentQueue` is implemented and unit-tested: it posts `Needs Approval` + LinkedIn + `generated_from: intelligence`, stores the Airtable id on the memory row, and returns the existing id on retry. No Airtable record was created. Approval and the LinkedIn publisher were therefore not shown a real item.

The publisher selects `platform = LinkedIn` AND `status = Ready To Publish` AND attempts under 3. A `Needs Approval` row would be visible to the approval UI and would not be published. That remains a code-level claim until a row exists.

## Sidecar

Sidecar uses the router and will attach Brand Brain context when a brain row exists for the brand. No live Sidecar answer was generated, and no actual model was recorded.

## Diagnostics

`GET /api/intelligence/diagnostics` returns the role registry and the latest 20 usage rows. The Intelligence page has a Diagnostics tab for the same data. It is behind the existing signed-in intelligence check. It was not clicked through in a browser because this environment cannot authenticate a user session, and the page’s brand list depends on Airtable.

## Test, typecheck, lint, build

| Check | Result |
| --- | --- |
| `tsc --noEmit` | Passed |
| Vitest | 176 passed, 2 skipped (live Folian journey and the diagnostic are opt-in) |
| Diagnostic vitest (`CCE_IDEA_ENGINE_DIAGNOSTIC=1`) | Passed: run `77ac599d-bc19-46b1-815f-27f5e6c054f8` ended `failed` with the Airtable configuration error |
| Live Folian vitest (`CCE_LIVE_ACTIVATE=1`) | Failed immediately: `OPENAI_API_KEY is not configured` |
| ESLint on the touched intelligence, AI, Idea Engine, and publishing paths | 0 errors, 0 warnings |
| `next build` | Passed |

## Remaining Make dependencies

Quick Generate, strategy generation, regenerate, and preview still call Make webhooks. Those routes were not removed. Native intelligence does not replace them until a confirmed Folian draft has actually been written into ContentQueue.

## Remaining Airtable dependencies

Brand profiles, ContentQueue, approval status, scheduling fields, and the LinkedIn due-query all still use Airtable. This phase does not add a second production queue.

## Risks

- Preferred writing/strategy/sidecar model is `gpt-5.6`. If the account cannot call it, generation will fail visibly rather than downgrade. That is intended, and it is untested.
- The execute-route 202 change is not deployed, so production Idea Engine behavior is unchanged.
- Confirm is idempotent only after `airtable_content_id` is saved. If Airtable accepts the row and the Supabase update fails, a retry can duplicate the queue item.
- Historical content and a newly confirmed draft share `airtable_content_id`. Confirming an ingested history row would treat it as already queued. New drafts leave that field empty until confirm.
- The six recovered runs are failed with an operator message. They were not regenerated.

## Recommended next phase

1. Run CCE with `OPENAI_API_KEY` and the Airtable ContentQueue/BrandProfiles env (the production host, not this laptop).
2. Re-run `probeConfiguredModels()` and keep the registry only if the preferred models succeed.
3. Re-run `activateFolianNativeJourney()` so it can load the real Folian brand, ingest queue history, generate “Create the next Folian LinkedIn post.”, and park the draft at `Needs Approval`.
4. Open that record in the existing approval screen and confirm the LinkedIn due-query does not select it.
5. Only then deploy the execute-route and router changes.

Do not approve or publish that draft as part of the next phase unless someone explicitly asks.
