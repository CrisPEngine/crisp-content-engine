# Content Generation Webhook Routing

## What the Vercel logs showed

From your logs:

1. **POST /api/strategy/recQZOHOJ1slH2aMi/approve** → 200, "Content generation webhook triggered successfully"  
   So when you approved the strategy, the app **did** call a content-generation webhook.

2. **No content creation**  
   The app was calling **only** the **Creator-tier** webhook (`MAKE_CONTENT_GENERATION_WEBHOOK_URL`). It did **not** check the user’s plan. So:
   - If the user is on **Scale** (or Growth/Pro), the **Creator** Make scenario was still invoked.
   - The Creator scenario may not write into the same Airtable Content Queue (or format) that the multichannel flow uses, so `/api/content/queue` kept returning 0 records.

3. **GET /api/content/queue** (repeated)  
   The UI was polling for content. Because no records were created (wrong scenario or scenario not creating queue records), it always saw 0.

4. **POST /api/strategy/webhook**  
   Make sent the strategy callback with `strategy_status: 'Strategy Ready (Awaiting Approval)'`. That part is separate from content generation.

## Routing rule (implemented)

- **Creator tier** (`subscriptions.plan === 'creator'`)  
  - Call **Creator** Make scenario: **`MAKE_CONTENT_GENERATION_WEBHOOK_URL`**  
  - Same payload as before (brand_profile_id, user_id, person_urn, organization_urn, brand_type, strategy_json, strategy_summary, triggered_at).

- **Any other tier** (Growth, Pro, Scale)  
  - Use the **multichannel** flow: the app calls **POST /api/content/generate** internally with default channels (e.g. LinkedIn 2, Blog 1).  
  - That route calls **`MAKE_MULTI_CHANNEL_CONTENT_GENERATION_WEBHOOK_URL`** with the full multichannel payload (generation_job_id, channels, brand_voice_context, strategy, etc.).  
  - Make’s multichannel scenario creates content and writes to the Content Queue, so `/api/content/queue` will start returning records.

## Env vars

- **Creator scenario:** `MAKE_CONTENT_GENERATION_WEBHOOK_URL` (and optionally `MAKE_CONTENT_WEBHOOK_SECRET` / `MAKE_SHARED_SECRET`).
- **Multichannel scenario:** `MAKE_MULTI_CHANNEL_CONTENT_GENERATION_WEBHOOK_URL` (used by `/api/content/generate` and, for non-Creator, after strategy approve).

## After deploy

- **Creator** users: approve strategy → Creator Make scenario runs (unchanged).
- **Growth/Pro/Scale** users: approve strategy → app calls `/api/content/generate` with default channels → multichannel Make scenario runs → content appears in the queue and in the UI.
