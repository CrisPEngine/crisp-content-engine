# CCE Intelligence Upgrade

**Date:** 2026-08-31  
**Companion docs:** [CCE_ARCHITECTURE_AUDIT.md](./CCE_ARCHITECTURE_AUDIT.md), [CCE_NATIVE_MIGRATION_ROADMAP.md](./CCE_NATIVE_MIGRATION_ROADMAP.md)

This upgrade adds a native intelligence foundation **alongside** the live Make + Airtable production path. Nothing that currently generates, approves, schedules, or publishes via those systems was removed.

---

## What was implemented

1. **Architecture audit** of AI, Make, Airtable, auth, generation, approval, scheduling, LinkedIn/Meta publish, jobs, and env vars.
2. **Regression contracts** so Make webhooks, Airtable CMS, LinkedIn publish, Sidecar, approval, and Idea Engine remain wired.
3. **Central AI core** (`src/lib/ai`) with model **roles**, fallbacks, retries, timeouts, usage logging, and no scattered model names.
4. **Sidecar** now calls `completeWithRole('SIDECAR')` (preferred `gpt-5.6`, fallbacks `gpt-5` → `gpt-4o`) and optionally injects Brand Brain context.
5. **Brand Brain** persistence: identity, voice, guardrails, knowledge, examples.
6. **Structured brand strategy** with campaigns and per-channel strategy.
7. **Content memory** with retrieval that prefers related/recent items and warns on hook/CTA/topic collisions without stuffing irrelevant history.
8. **Content themes** + multi-channel theme plans (one core idea → adapted channel pieces).
9. **Structured brief engine** (typed schema) consumed by writing, not dumped as one giant prompt.
10. **Editorial review**: deterministic AI-pattern detectors + brand compliance; optional REVIEW-role rewrite; brand voice remains authoritative.
11. **User-edit learning**: AI vs user versions, signal extraction, confidence `candidate → observed → strong → confirmed`, accept/edit/reject/disable.
12. **Performance snapshots** (channel-agnostic) + objective-aware scoring language (no “most impressions wins”).
13. **Experiments** with control/variant, minimum sample, no tiny-difference winners, observational confidence.
14. **Content learnings** with decay / retest candidates.
15. **Pre-publication scorecard** (interpretable dimensions; prediction withheld without history).
16. **Native `workflow_jobs`** (queued/processing/completed/failed/retrying/cancelled) — successor to Make, not a cutover.
17. **MCP-ready `dispatchIntelligenceAction`** for UI / future MCP / Telegram.
18. **Minimal UI** at `/intelligence` (Brand Brain, Strategy, Themes).
19. **Folian-style acceptance test** covering the full native pipeline.
20. **Additive migration** `023_intelligence_foundation.sql`.

---

## Architecture

### Before

```
UI → Airtable (brands/queue) → Make (generation) → OpenAI-in-Make
Sidecar / Idea Engine → src/lib/llm → gpt-4o-mini / gpt-4o
Publish → native LinkedIn/Meta cron → Airtable status
```

### After (parallel)

```
UI / MCP actions
  → intelligence services (Brand Brain, strategy, themes, brief, memory, review, jobs)
  → src/lib/ai roles → src/lib/llm → OpenAI (with fallbacks)
  → new Supabase tables

Existing production path (unchanged):
  UI → Airtable + Make + native publishers
```

Generation target shape for native work:

```
USER INTENT → CONTEXT RETRIEVAL → STRUCTURED BRIEF → DRAFT → REVIEW → FINAL
```

Make Quick Generate still does `prompt → Make → post`. That is intentional until a later cutover.

---

## Database changes

Migration: `supabase/migrations/023_intelligence_foundation.sql` (additive, RLS owner-scoped).

| Table | Purpose |
|---|---|
| `airtable_entity_map` | Map Airtable record IDs ↔ native entities |
| `brand_brains` | Identity / voice / guardrails / knowledge JSON |
| `brand_brain_examples` | Good / poor / representative / user-edited examples |
| `brand_strategies` | First-class strategy object |
| `brand_campaigns` | Campaigns under a strategy |
| `brand_channel_strategies` | Per-channel strategy |
| `content_themes` | Authority themes |
| `content_theme_plans` | Multi-channel connected plans |
| `content_memory` | Persistent content memory |
| `native_content_briefs` | Structured briefs (not Airtable StrategyUpdates) |
| `content_drafts` | AI / reviewed / user versions |
| `user_edit_learnings` | Proposed learnings from edits |
| `performance_snapshots` | Channel-agnostic metrics + normalised JSON |
| `content_experiments`, `experiment_variants`, `experiment_results` | A/B framework |
| `content_learnings` | Observational learnings with validity |
| `content_scores` | Dimensional pre-publish scores |
| `workflow_jobs` | Native job queue |
| `ai_usage_logs` | Role / model / tokens / duration (no prompt bodies) |
| `intelligence_action_logs` | Telegram/MCP/web action audit (024) |

`024_intelligence_operations.sql` also adds `content_memory.external_post_id` / `external_url`.

Apply manually when ready, same convention as Sidecar/Idea Engine migrations.

---

## AI model architecture

Roles in `src/lib/ai/roles.ts`:

| Role | Default preferred | Typical use |
|---|---|---|
| FAST | `gpt-4o-mini` | tagging, cheap transforms |
| EXTRACTION | `gpt-4o-mini` | structured extract |
| CLASSIFICATION | `gpt-4o-mini` | labels |
| WRITING | `gpt-5.6` → `gpt-5` → `gpt-4o` | drafts, Idea Engine default |
| STRATEGY | `gpt-5.6` → `gpt-5` → `gpt-4o` | theme plans / strategy |
| RESEARCH | `gpt-5` → `gpt-4o` | research synthesis |
| REVIEW | `gpt-5` → `gpt-4o` | editorial pass |
| SIDECAR | `gpt-5.6` → `gpt-5` → `gpt-4o` | Sidecar drafts |

Override with `AI_MODEL_<ROLE>`. Legacy: `SIDECAR_LLM_MODEL`, `SIDECAR_OPENAI_MODEL`, `IDEA_ENGINE_LLM_MODEL`.

`completeWithRole` retries retryable errors and falls back if a model is unavailable. GPT-5-family calls use `max_completion_tokens`. Usage is logged with a `request_id` (no credentials, no full prompt/content).

---

## Brand Brain

Stored per `(user_id, airtable_brand_id)`. Used as the authoritative voice/guardrail source for native briefs, review, and Sidecar (when present). Airtable BrandProfiles remain the live brand directory.

---

## Strategy

Native strategy is a structured object (objectives, audiences, pillars, CTA strategy, campaigns, channel strategies). Brief construction **selects** relevant slices (channel strategy, pillar, campaign title) instead of concatenating everything.

Airtable `strategy_json` is untouched.

---

## Content memory

Each native draft writes a memory row (theme, pillar, campaign, channel, topic, angle, hook, argument, CTA, status, etc.). Retrieval scores topic/hook/argument overlap, boosts same-theme items, and drops low-score/old unrelated posts. Warnings distinguish unwanted repetition from intentional theme continuation (`allowThemeContinuation`).

---

## Themes

A theme is an authority-building object. `buildThemePlan` expands one core idea into channel-adapted pieces (article, founder post, company post, X short, thread, newsletter, follow-up) with explicit “do not duplicate copy” relationships.

---

## Performance intelligence

**Now:** snapshot schema, LinkedIn socialActions / org share stats ingest (graceful fallback to **manual** `ingest_performance`), objective-aware comparison, learnings + decay, scorecard `predictionNote`.

Company-page impression stats often need `r_organization_social`. Without platform data, CCE will not invent performance rankings.

Language is intentionally non-guaranteeing: ranges, confidence, relative-to-baseline — never “this will get N impressions”.

---

## Experiments

Hypothesis → control + variant with pragmatic controls (same account/channel/weekday/time/type) → measurement window → normalise → compare → likely winner only if sample ≥ `minimumSample` and lift is not tiny → store learning.

Social tests are **not** treated as laboratory RCTs.

---

## Sidecar

- Uses central `SIDECAR` role instead of hard-coded `gpt-4o-mini`.
- Existing `SIDECAR_LLM_MODEL=gpt-4o-mini` is treated as the old default and upgraded; set `AI_MODEL_SIDECAR` if you truly need mini.
- Still JSON Chat Completions via `src/lib/llm`.
- Optionally prepends Brand Brain composable context; Airtable voice rules still apply if Brain is empty.
- Make is still not in the Sidecar path.

---

## Operations wave (native, dual-run)

Added **alongside** Make + Airtable. Live CMS/publish crons are unchanged.

| # | Capability | How |
|---|---|---|
| 1 | Production smoke | `GET /api/intelligence/diagnostics` (session or `CRON_SECRET`). Config/model/table checks; **never returns secret values**. |
| 2 | Folian Brand Brain | `seed_folian_brain` + `validate_brand` (`validateFolianBrand` when the brand is Folian). |
| 3 | Theme → plan → content | `execute_theme_plan` runs brief+draft per channel piece and links `parentMemoryId`. |
| 4 | Native LinkedIn publish | `publish_content` queues `workflow_jobs` type `publishing`. `/api/intelligence/jobs/process` calls the LinkedIn article publisher. **Does not replace** `/api/publish/linkedin-due`. |
| 5 | Performance ingestion | `ingest_performance` (manual) and `sync_linkedin_analytics` / `POST /api/intelligence/analytics/linkedin-sync` (API; company stats often need `r_organization_social`). |
| 6 | Baselines | `compare_performance` vs observational baseline. Language is non-forecasting. |
| 7 | Operational A/B | `attach_experiment_variant` + `collect_experiment_results`. |
| 8 | Learnings in briefs | Completed experiment observations are injected into later briefs as `[EXPERIMENT LEARNING / …] — observational only`. |
| 9 | Article publisher | `publishArticle` / `publish_article` — LinkedIn or allowlisted webhook (`ARTICLE_PUBLISH_WEBHOOK_URL`). |
| 10 | Telegram / MCP | `x-cce-channel: telegram` + `TELEGRAM_BOT_SECRET` + `TELEGRAM_USER_MAP`. Action allowlist, rate limits, idempotency, compact redacted replies, `intelligence_action_logs`. Publish/seed are not Telegram-allowed. |

Migration: `supabase/migrations/024_intelligence_operations.sql` (`content_memory.external_post_id/url`, `intelligence_action_logs`).

---

## Remaining Make dependencies

**CRITICAL:** `MAKE_STRATEGY_WEBHOOK_URL`, `MAKE_CONTENT_GENERATION_WEBHOOK_URL`, `MAKE_MULTI_CHANNEL_CONTENT_GENERATION_WEBHOOK_URL`, inbound `/api/strategy/webhook`, `/api/content/webhook`, `/api/content/generation/complete`.

**IMPORTANT:** starter webhook, regenerate, preview, progress, usage increment, batch-ready email.

**OPTIONAL:** onboarding scrape webhook.

**LEGACY:** Idea Engine Make (if native on), LinkedIn credentials-for-Make, documented publish webhook.

---

## Remaining Airtable dependencies

**CRITICAL:** BrandProfiles, ContentQueue, StrategyUpdates/Content Briefs.

**OPTIONAL:** PreviewLeads, optional strategy table.

Native tables map via `airtable_brand_id` / `airtable_entity_map`. No data was moved.

---

## Risks / manual checks

1. Apply `023_intelligence_foundation.sql` in Supabase before using `/intelligence` in production.
2. Confirm the OpenAI account can call `gpt-5.6`; fallbacks should catch 404s, but watch first Sidecar/Idea Engine logs.
3. GPT-5-family temperature/max token behaviour — provider omits temperature for reasoning-family models unless explicitly set.
4. `/intelligence` writes to Supabase only; it does not update Airtable.
5. Native `publish_content` **queues a job** (or `immediate: true`) and publishes native memory only. It does not replace LinkedIn/Meta Airtable cron publishers.
6. No E2E browser coverage of login/approval; rely on contract tests + a manual smoke of generate/approve/publish.
7. `workflow_jobs` claim is not a `FOR UPDATE SKIP LOCKED` loop — fine for low volume; harden before replacing Make.

---

## Tests

Run: `npm test`

Added coverage:

- Model role catalog and env overrides
- Memory retrieval / near-duplicate
- Prose + brand review
- Experiments + learning decay
- Edit-learning + workflow jobs
- Folian acceptance pipeline
- Sidecar Brand Brain prompt
- Regression contracts (Make, Airtable, LinkedIn, Sidecar, approval)
- Diagnostics (no secret leakage), Folian seed/validate, theme execution, native publish, baselines, experiment learnings in briefs, Telegram allowlist/redaction

Existing Idea Engine / entitlements / Sidecar tests should remain green.

---

## Recommended next implementation

1. Apply `023` + `024` migrations; hit `GET /api/intelligence/diagnostics` in staging.
2. Dual-write ContentQueue → `content_memory` on approve/publish.
3. Offer native brief+draft as an opt-in path next to Make Quick Generate.
4. Harden `workflow_jobs` claiming (`FOR UPDATE SKIP LOCKED`) before replacing any Make job.
5. Thin UI for experiments, learnings (accept/reject), and scorecards.
6. Only then consider moving strategy generation off Make.
