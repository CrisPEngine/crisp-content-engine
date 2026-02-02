# Strategy Webhook Callback Payload (Make → App)

**Endpoint:** `POST /api/strategy/webhook`  
**Auth:** `x-make-secret` header (must match `MAKE_CALLBACK_SECRET` or `MAKE_STRATEGY_WEBHOOK_SECRET`)

---

## Why your strategy had no content

Your Vercel logs showed:

```json
{
  "mode": undefined,
  "strategy_update_id": undefined,
  "brand_profile_id": "recrE1dZ7GkDyVZEl",
  "status": undefined,
  "strategy_status": "Strategy Ready (Awaiting Approval)"
}
```

So the app received only `brand_profile_id` and `strategy_status`. It updated the brand’s status to “Strategy Ready” but **did not receive any strategy content** (`strategy_json`, `strategy_summary`, or `strategy_payload`). That’s why the strategy page showed “Strategy Ready” but no content, and why approving failed or triggered content generation with no strategy.

---

## What Make must send

For the strategy page to show content and for approval to work, your **Make strategy scenario** must call the strategy webhook with at least:

| Field | Required | Description |
|-------|----------|-------------|
| `brand_profile_id` | Yes | Airtable BrandProfiles record ID (e.g. `recXXX`) |
| `strategy_status` | Yes | e.g. `"Strategy Ready (Awaiting Approval)"` |
| `strategy_update_id` | If monthly update | Airtable StrategyUpdates record ID (for briefs flow) |
| `mode` | Optional | `"monthly_update"` if this is a monthly brief callback |
| `strategy_payload` or `strategy` or `strategy_sections` or `strategy_content` | **Yes for content** | **Send the full AI output bundle** (object or JSON string). Do **not** send only a short snippet (e.g. `{{7. brand_understanding: summary}}`). The app stores this as `strategy_json` in Airtable and auto-generates the full human-readable `strategy_summary` for the strategy page. |
| `strategy_summary` or `summary` | Optional | If you send full `strategy_payload`, the app generates the full summary from it. Only needed if you don’t send `strategy_payload`. |

Without `strategy_payload` (or one of the alternate names), the app cannot show or use the strategy. The UI will show “Strategy Ready” but the user will see no content and cannot approve until Make sends a callback that includes the **full** strategy JSON.

---

## Full strategy: send the whole AI output as strategy_payload

The strategy page and content generation use **two** things from the webhook:

1. **`strategy_json`** (in Airtable) – the full structured JSON. Used by content generation and the app.  
2. **`strategy_summary`** (in Airtable) – the human-readable text shown on the strategy page. The app **auto-generates** this from `strategy_payload` when you send the full JSON.

**In Make:** In the HTTP request that calls `/api/strategy/webhook`, map the **entire** OpenAI/AI module output (e.g. the whole Bundle, not a single field) to `strategy_payload`. For example, if your AI step outputs a bundle numbered `7`, send **`7`** (the whole object) as `strategy_payload`, not `7.brand_understanding.summary`.  

**In Airtable:** Ensure BrandProfiles has:

- A **Long text** field named `strategy_json` (stores the full JSON string).  
- A **Long text** field named `strategy_summary` (stores the generated readable summary; the app writes this from the webhook).

No formula or extra Airtable steps are needed; the app writes both when Make sends the full `strategy_payload`.

---

## Example payload (minimal for “strategy with content”)

```json
{
  "brand_profile_id": "recrE1dZ7GkDyVZEl",
  "strategy_status": "Strategy Ready (Awaiting Approval)",
  "strategy_summary": "## Brand Summary\n...",
  "strategy_payload": {
    "brand_summary": { "one_liner": "...", "positioning": "..." },
    "brand_understanding": { "summary": "...", "perceived_audience": "...", "tone_description": "..." },
    "pillars": [ { "name": "...", "why": "..." } ],
    "cadence": { "LinkedIn": "...", "X": "..." },
    "voice": { "summary": "...", "dos": [], "donts": [] }
  }
}
```

For monthly updates, also send `strategy_update_id` and `mode: "monthly_update"` so the StrategyUpdates record is updated.

---

## App changes (this session)

1. **Strategy page:** Approve is disabled until the strategy has content (`strategy_json` or `strategy_summary`). A banner explains that the strategy is still being generated.
2. **Strategy approve API:** Returns 400 with a clear message if the brand has no strategy content, so the user is not sent into content generation with an empty strategy.
3. **Content generation modal:** Polling no longer resets on every render (fixed infinite loop). After ~90 seconds, a “Close and go to content” escape hatch is shown so the user is not stuck.
4. **Docs:** This file documents the expected strategy webhook payload.

---

## Next steps (Make scenario)

1. In the Make scenario that runs after strategy generation, ensure the **HTTP “Callback to Vercel”** (or equivalent) step sends a body that includes:
   - `brand_profile_id`
   - `strategy_status`
   - **`strategy_payload`** = the **full** AI output (e.g. map the whole OpenAI/Bundle output to `strategy_payload`, not just `{{7. brand_understanding: summary}}`). The app stores this as `strategy_json` and generates the full `strategy_summary` for the strategy page.
2. If you use StrategyUpdates (monthly briefs), also send `strategy_update_id` and `mode: "monthly_update"` when applicable.
3. Re-run the scenario for the affected brand (or trigger a retry) so the app receives a callback with the full strategy. Then refresh the strategy page; the full strategy content should appear and Approve will work.
