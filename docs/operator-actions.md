# Operator Actions Layer

## Feature flag

Operator routes and `/admin/operator` are **disabled by default**. Enable only in environments where you have applied migration `016_operator_action_hardening.sql`:

```bash
# Defaults (leave unset or set explicitly to false)
OPERATOR_CONSOLE_ENABLED=false
NEXT_PUBLIC_OPERATOR_CONSOLE_ENABLED=false
OPERATOR_API_SECRET=
```

To enable:

- `OPERATOR_CONSOLE_ENABLED=true` — server routes (`/api/operator/*`, `/admin/operator`); returns **404** when not `true`
- `NEXT_PUBLIC_OPERATOR_CONSOLE_ENABLED=true` — shows the “Operator Console” link on `/admin` only (no other admin UX changes)
- `OPERATOR_API_SECRET` — **server-only**; used by `requireOperatorAuth` for `x-operator-secret` automation. Never use a `NEXT_PUBLIC_` prefix.

Mutating operator actions still depend on the **existing app** Supabase, Airtable, and Make environment variables (same as production content/strategy flows). See [Required Environment Variables](#required-environment-variables) below.

## Overview

The operator actions layer is an internal API boundary for admin UI, trusted automations, future MCP tools, and future agents. It does not replace Airtable or Make. Current Airtable tables and Make webhooks remain the implementation adapters behind validated action contracts.

## Security

Operator endpoints are protected by `requireOperatorAuth`.

- Admin UI calls may use the normal Supabase session cookie. The user must have `profiles.is_admin = true`; admin sessions currently receive all operator scopes.
- Trusted automation may pass `x-operator-secret: <OPERATOR_API_SECRET>`. This path is disabled unless `OPERATOR_API_SECRET` is configured.
- Secret-based callers can be restricted with `OPERATOR_ALLOWED_SCOPES`, a comma-separated list such as `operator:read,operator:generate`.
- These endpoints should not be called directly from public client code except from an authenticated admin surface.

Supported scopes:

- `operator:read`
- `operator:write`
- `operator:generate`
- `operator:schedule`
- `operator:admin`

## Admin Console

The internal console is available at `/admin/operator` when `OPERATOR_CONSOLE_ENABLED=true`.

Access is protected:

- When the server flag is off, `/admin/operator` and `/api/operator/*` return **404** (not found).
- When enabled, the page checks the Supabase session server-side and redirects non-admins.
- The console only calls protected operator APIs, which enforce `requireOperatorAuth`, scopes, and rate limits.
- `OPERATOR_API_SECRET` is never sent from the browser; the admin UI uses the session cookie only.

The console includes:

- Operator overview: logging availability, secret configuration state, scope mode, available actions, recent action count, and recent error count.
- Action runner: select an action, edit the JSON input, toggle dry-run, provide an idempotency key, submit to `POST /api/operator/actions`, and copy request/response JSON.
- Logs viewer: filter `GET /api/operator/logs` by action, status, and limit, then expand rows to inspect redacted input/output summaries and metadata.
- MCP preparation: static classification of read-only, human-approval, and high-impact future MCP actions.

Use dry-run first for every mutating or generation action. To test idempotency, run the same mutating action twice with the same idempotency key; after the first successful non-dry-run, the second response should include `idempotentReplay: true` and should not call Airtable or Make again.

## Endpoints

### `POST /api/operator/actions`

Dispatches one validated operator action.

```json
{
  "action": "generate_content_batch",
  "dryRun": true,
  "idempotencyKey": "optional-key",
  "input": {
    "brandProfileId": "rec...",
    "platform": "LinkedIn"
  }
}
```

`idempotencyKey` may also be supplied with the `x-idempotency-key` header. The request body wins if both are present.

Response:

```json
{
  "ok": true,
  "action": "generate_content_batch",
  "dryRun": true,
  "actionLogId": "op_...",
  "result": {}
}
```

Validation failures return `400`. Auth/scope failures return `401` or `403`. Rate-limit failures return `429`. Airtable/Make adapter failures return structured errors with a `code` and redacted `details` when available.

Example secret-authenticated dry run:

```bash
curl -X POST "$APP_URL/api/operator/actions" \
  -H "content-type: application/json" \
  -H "x-operator-secret: $OPERATOR_API_SECRET" \
  -H "x-idempotency-key: demo-content-batch-001" \
  -d '{
    "action": "generate_content_batch",
    "dryRun": true,
    "input": {
      "brandProfileId": "recXXXXXXXXXXXXXX",
      "platform": "LinkedIn"
    }
  }'
```

Example status update:

```bash
curl -X POST "$APP_URL/api/operator/actions" \
  -H "content-type: application/json" \
  -H "x-operator-secret: $OPERATOR_API_SECRET" \
  -H "x-idempotency-key: approve-recXXXXXXXXXXXXXX-v1" \
  -d '{
    "action": "update_content_status",
    "input": {
      "contentId": "recXXXXXXXXXXXXXX",
      "status": "Ready To Publish"
    }
  }'
```

### `GET /api/operator/logs`

Fetches durable operator logs. Requires `operator:admin`.

Query params:

- `action`: optional operator action name.
- `status`: optional `started`, `succeeded`, or `failed`.
- `limit`: optional number from `1` to `200`, defaults to `50`.

Console logging remains as a fallback if the Supabase audit table is unavailable.

Example:

```bash
curl "$APP_URL/api/operator/logs?action=generate_content_batch&status=failed&limit=20" \
  -H "x-operator-secret: $OPERATOR_API_SECRET"
```

## Audit Logging

Operator actions write durable rows to `public.operator_action_logs` via the Supabase service role. Each row captures request identity, action, status, actor, dry-run flag, target IDs, redacted input/output summaries, error information, duration, source IP, user agent, and metadata.

Do not store secrets in operator action inputs or adapter results. The logger stores summaries and redacted safe results only; webhook bodies, API keys, bearer tokens, webhook secrets, and email addresses are redacted or summarized before storage.

Apply `supabase/migrations/016_operator_action_hardening.sql` manually (not auto-applied). The migration adds:

- `public.operator_idempotency_keys`
- `public.operator_rate_limits`
- `public.check_operator_rate_limit(...)`

These tables have RLS enabled and no public access policies. They are intended for service-role access from protected route handlers.

## Idempotency

Mutating actions accept an optional idempotency key in either:

- request body: `idempotencyKey`
- request header: `x-idempotency-key`

The body value takes precedence. Idempotency applies to:

- `create_or_update_brand_profile`
- `generate_or_refresh_brand_strategy`
- `generate_content_batch`
- `regenerate_individual_post`
- `update_content_status`
- `send_item_to_approval`
- `schedule_approved_content`

If the same action and idempotency key already completed successfully, the endpoint returns the stored redacted result with `idempotentReplay: true` and does not re-run Airtable or Make side effects. If the key is currently in progress, the endpoint returns `409`.

Dry-run requests are not reserved as mutating idempotency records because they do not create side effects.

## Rate Limits

The operator endpoint applies action-level rate limits before running actions. It prefers the Supabase-backed `check_operator_rate_limit` function and falls back to an in-memory counter if the durable store is unavailable.

Defaults:

- Fetch actions: `120` requests per `60` seconds.
- Mutating actions: `30` requests per `60` seconds.
- Generation/webhook actions: `10` requests per `300` seconds.

Configurable env vars:

- `OPERATOR_RATE_LIMIT_FETCH`
- `OPERATOR_RATE_LIMIT_FETCH_WINDOW_SECONDS`
- `OPERATOR_RATE_LIMIT_MUTATE`
- `OPERATOR_RATE_LIMIT_MUTATE_WINDOW_SECONDS`
- `OPERATOR_RATE_LIMIT_GENERATE`
- `OPERATOR_RATE_LIMIT_GENERATE_WINDOW_SECONDS`

## Actions

### `create_or_update_brand_profile`

Creates or patches a BrandProfiles Airtable record.

Required scope: `operator:write`.

Input:

```json
{
  "userId": "supabase-user-id",
  "brandProfileId": "optional-rec-id-for-update",
  "profile": {
    "brand_type": "company",
    "client_name": "Acme",
    "audience": "Founders",
    "value_props": "Clear benefit",
    "offers": "Consulting",
    "platforms_requested": ["LinkedIn"],
    "timezone": "Asia/Dubai",
    "language_region": "US English",
    "preferred_image_source": "AI Generated"
  }
}
```

Dry-run returns the Airtable payload without writing.

### `generate_or_refresh_brand_strategy`

Fetches the BrandProfiles record from Airtable and triggers the Make strategy webhook.

Required scope: `operator:generate`.

Input:

```json
{
  "brandProfileId": "rec...",
  "mode": "refresh",
  "strategyUpdateId": "optional-rec...",
  "extraInstructions": "optional"
}
```

Uses `MAKE_STRATEGY_WEBHOOK_URL`.

### `generate_content_batch`

Fetches the BrandProfiles record, verifies a strategy payload exists, and triggers the Make content generation webhook.

Required scope: `operator:generate`.

Input:

```json
{
  "brandProfileId": "rec...",
  "platform": "LinkedIn",
  "strategyId": "optional-rec...",
  "triggerType": "operator_requested"
}
```

Uses `MAKE_CONTENT_GENERATION_WEBHOOK_URL`.

### `regenerate_individual_post`

Fetches a ContentQueue item, triggers the Make regeneration webhook, and moves the item to `Needs Review`.

Required scopes: `operator:generate`, `operator:write`.

Input:

```json
{
  "contentId": "rec...",
  "feedback": "Make it more specific."
}
```

Uses `MAKE_CONTENT_REGENERATE_WEBHOOK_URL`.

### `update_content_status`

Patches a ContentQueue item's status. If status is `Ready To Publish`, `approved_at` is set. If status is `Published`, `published_at` is set.

Required scope: `operator:write`.

Input:

```json
{
  "contentId": "rec...",
  "status": "Ready To Publish",
  "scheduledTime": "2026-05-26T10:00:00.000Z"
}
```

### `send_item_to_approval`

Convenience action that sets a ContentQueue item to `Needs Approval`.

Required scope: `operator:write`.

Input:

```json
{
  "contentId": "rec...",
  "notes": "optional"
}
```

### `schedule_approved_content`

Sets a ContentQueue item to `Scheduled` and writes `scheduled_time`.

Required scope: `operator:schedule`.

The item must already be `Ready To Publish` or `Scheduled`; the operator layer will reject scheduling unapproved content.

Input:

```json
{
  "contentId": "rec...",
  "scheduledTime": "2026-05-26T10:00:00.000Z"
}
```

### `fetch_brand_content_queue`

Reads ContentQueue items from Airtable.

Required scope: `operator:read`.

Input:

```json
{
  "brandProfileId": "optional-rec...",
  "statuses": ["Needs Approval", "Ready To Publish"],
  "limit": 50
}
```

### `fetch_operator_logs`

Returns structured operator logs through the same action dispatcher.

Required scope: `operator:admin`.

Input:

```json
{
  "action": "generate_content_batch",
  "status": "failed",
  "limit": 50
}
```

## Required Environment Variables

These are the **same variables** the main application already uses for Airtable content, brand profiles, strategy generation, and Supabase admin/service access. The operator layer does not introduce alternate credentials.

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `AIRTABLE_PAT`
- `AIRTABLE_BASE_ID`
- `AIRTABLE_BRANDPROFILES_TABLE`
- `AIRTABLE_CONTENTQUEUE_TABLE`
- `MAKE_STRATEGY_WEBHOOK_URL`
- `MAKE_CONTENT_GENERATION_WEBHOOK_URL`
- `MAKE_CONTENT_REGENERATE_WEBHOOK_URL`

Operator feature flags (see [Feature flag](#feature-flag); disabled by default):

- `OPERATOR_CONSOLE_ENABLED` — must be `true` to expose `/api/operator/*` and `/admin/operator`
- `NEXT_PUBLIC_OPERATOR_CONSOLE_ENABLED` — must be `true` to show the admin dashboard link
- `OPERATOR_API_SECRET` — server-only secret for `x-operator-secret` (optional)

Optional:

- `OPERATOR_ALLOWED_SCOPES`
- `MAKE_API_KEY`
- `MAKE_SHARED_SECRET`
- `MAKE_STRATEGY_WEBHOOK_SECRET`
- `MAKE_CONTENT_WEBHOOK_SECRET`
- `OPERATOR_RATE_LIMIT_FETCH`
- `OPERATOR_RATE_LIMIT_FETCH_WINDOW_SECONDS`
- `OPERATOR_RATE_LIMIT_MUTATE`
- `OPERATOR_RATE_LIMIT_MUTATE_WINDOW_SECONDS`
- `OPERATOR_RATE_LIMIT_GENERATE`
- `OPERATOR_RATE_LIMIT_GENERATE_WINDOW_SECONDS`

## Adapter Boundary

The operator service depends on interfaces in `src/lib/operator/adapters/types.ts`. Airtable and Make are only called from adapter implementations. A future MCP server should call the same service functions rather than reimplement Airtable or Make payload construction.

## Future MCP Notes

Do not expose Airtable or Make credentials directly to a future MCP server. MCP tools should call the same operator action service, pass scoped operator credentials, use idempotency keys for mutating tools, and surface only redacted action results to agent transcripts.

Before building a real MCP layer, add a tool-to-scope registry, human approval gates for destructive or high-volume actions, explicit customer/brand tenancy checks for non-admin operators, and a small MCP-facing test suite that exercises the same action runner contracts used by `/admin/operator`.
