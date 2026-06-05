# Idea Engine — native generation

Idea Engine runs entirely inside CRISP Content Engine when `IDEA_ENGINE_NATIVE_ENABLED=true`.

## Enable

1. Apply `supabase/migrations/018_idea_engine_native.sql`
2. Set environment variables:

```bash
IDEA_ENGINE_NATIVE_ENABLED=true
OPENAI_API_KEY=...
IDEA_ENGINE_LLM_MODEL=gpt-4o
IDEA_ENGINE_LLM_TEMPERATURE=0.7
IDEA_ENGINE_LLM_MAX_TOKENS=8192
```

3. Redeploy. Remove or ignore `MAKE_IDEA_ENGINE_SERIES_WEBHOOK_URL` when native is enabled.

## Flow

```
POST /api/idea-engine/run
  → placeholders in Supabase
  → after() → generateSeries(runId)
  → per-channel OpenAI calls
  → progressive item updates
  → run status = review

GET /api/idea-engine/run/:id (poll)
POST /api/idea-engine/confirm → Airtable ContentQueue
```

No Make webhooks. Make callback routes return **410** when native is enabled.

## Rollback

Set `IDEA_ENGINE_NATIVE_ENABLED=false` and configure `MAKE_IDEA_ENGINE_SERIES_WEBHOOK_URL`.

## Prompts

- System: [`src/lib/prompts/idea-engine-system.ts`](../src/lib/prompts/idea-engine-system.ts)
- Builder: [`src/lib/idea-engine/generator/buildPrompt.ts`](../src/lib/idea-engine/generator/buildPrompt.ts)
- Make reference exports: [`docs/idea-engine-make-prompt-export/`](./idea-engine-make-prompt-export/)

## Scheduling

Native generation sets `idea_engine_items.scheduled_time` (future ISO, unique per item, timezone-aware). Confirm prefers item `scheduled_time` when writing to ContentQueue.

## Other Make workflows

Unchanged: Strategy, Monthly Content Brief, Quick Generate, publishing automations.
