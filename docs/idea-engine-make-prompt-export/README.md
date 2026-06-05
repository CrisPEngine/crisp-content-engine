# Idea Engine — Make scenario reference (migration source)

Reference documentation for the native CCE migration. Runtime prompts live in
`src/lib/prompts/idea-engine-system.ts` and `src/lib/prompts/idea-engine-user.ts`.

## Iterator / router structure (reconstructed from webhook contract)

Make scenario flow (native equivalent):

1. **Webhook trigger** — receives full payload from `POST /api/idea-engine/run`
2. **Per-channel router** — for each key in `requested_counts` where count > 0
3. **Per-position iterator** — generate `count` items for channel (series_position 1..N)
4. **OpenAI module** — one call per channel batch (all items for that channel in one JSON response)
5. **Callback** — POST `items[]` to `callback_url`

Native generator mirrors step 2–4 inside `generateSeries()` without external callback.

## Channel generation order

LinkedIn → X → Blog → Facebook → Instagram (stable sort matching placeholder creation in run route).

## OpenAI settings (configure via env)

| Setting | Env | Default |
|---------|-----|---------|
| Model | `IDEA_ENGINE_LLM_MODEL` | `gpt-4o` |
| Temperature | `IDEA_ENGINE_LLM_TEMPERATURE` | `0.7` |
| Max tokens | `IDEA_ENGINE_LLM_MAX_TOKENS` | `8192` |

## Output JSON shape (authoritative)

See `fixture-payload.json` for inbound context and `fixture-response.json` for expected OpenAI output.
