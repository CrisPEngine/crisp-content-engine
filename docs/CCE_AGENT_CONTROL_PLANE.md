# CCE Agent Control Plane

External agents operate CCE. CCE remains the system of record for Brand Brain, strategy, themes, memory, performance, experiments, approval, and publishing. Grok is the first operator for Folian. The same control plane is for the CCE web UI, Telegram, other agents, automations, and later mobile clients.

```text
Agent (Grok, web, Telegram, automation)
        ↓
REST /api/agent/v1  and  MCP /api/mcp
        ↓
One action registry
        ↓
Existing CCE intelligence, memory, review, and publishers
```

Agents do not call a model by name. `cce_generate_content` runs the existing intelligence pipeline, which chooses the role, model, brief, and review.

## Authentication

Each agent has a credential:

- id, name, owner, optional organisation
- allowed brand ids (canonical `brand_brains.id` values)
- capabilities
- environment
- hashed secret (`key_hash`), prefix only after creation
- created, last used, optional expiry, revoked time
- rate-limit policy, including an optional daily generation budget

The plaintext secret is returned once by `POST /api/agent/v1/credentials` and is never stored. Send it as `Authorization: Bearer cce_agent_…`.

Set `AGENT_KEY_PEPPER` before issuing production keys. The hash is SHA-256 of the secret, prefixed with the pepper when it is set. Changing the pepper invalidates existing keys.

Session auth for people is unchanged. Credential management uses the signed-in CCE user. Agent calls cannot use a browser session, and a person cannot use an agent key as a login.

A credential restricted to one brand receives `brand_not_accessible` for any other brand id. The response does not include that brand’s data.

## Capabilities and consequence

Capabilities are explicit. There is no “this agent can mutate everything” flag.

| Group | Examples |
| --- | --- |
| READ | `brand:read`, `strategy:read`, `content:read`, `performance:read` |
| DRAFT | `content:create`, `content:revise`, `opportunities:create` |
| PROPOSE | `content:submit_for_approval`, `experiments:propose`, `strategy:propose` |
| APPROVE | `content:approve` |
| SCHEDULE | `content:schedule_after_approval` |
| PUBLISH | `content:publish` |
| ENGAGE | `community:draft_reply`, `community:publish_reply` |
| ADVERTISE | `ads:read`, `ads:analyse`, `ads:propose`, `ads:activate` |
| ADMIN | reserved for later credential administration |

Consequence levels:

| Level | Meaning | Folian operator |
| --- | --- | --- |
| 0 | Read | Allowed |
| 1 | Internal CCE write | Allowed for drafts, opportunities, revisions, proposals |
| 2 | Prepare an external action without performing it | Submit for approval, record a schedule, draft a reply |
| 3 | External action | Not granted. Approve and publish are refused |
| 4 | Financial | A budget proposal is stored and returned as `approval_required`. It is not applied |

Level 4 cannot succeed unless the result is an approval request. The handler does not call an ads API.

The Folian Marketing credential includes the read, draft, and propose capabilities in `FOLIAN_GROK_CAPABILITIES`. It does not include `content:approve`, `content:publish`, `community:publish_reply`, or `ads:activate`. MCP `tools/list` only returns tools that credential can call, so the Folian operator is not offered approve.

## REST

`POST /api/agent/v1`

```json
{
  "action": "cce_get_brand",
  "input": { "brandId": "canonical-brand-id" },
  "idempotencyKey": "optional-for-reads"
}
```

`GET /api/agent/v1` returns `cce_get_capabilities` for the bearer credential.

Mutating actions (consequence level 1 and above) require an idempotency key in the body or the `Idempotency-Key` header. A retry with the same key and payload returns the stored result and does not create a second object. The same key with a different payload returns `idempotency_conflict`.

Brand ids in the public API are CCE brand brain ids. Airtable record ids and Make scenario names are not part of this API.

## MCP

`POST /api/mcp` speaks MCP JSON-RPC 2.0 over Streamable HTTP, protocol `2025-03-26` or `2025-06-18`. The server is stateless: `GET` and `DELETE` return 405 because there is no server-initiated session. `initialize`, `ping`, `notifications/initialized`, `tools/list`, and `tools/call` are supported. When the client accepts only `text/event-stream`, the response is a single SSE message. Otherwise the response is one JSON object.

Tool arguments are the action input. `idempotencyKey` may be an argument or the `Idempotency-Key` header. Tool results include `structuredContent` with the same body REST returns.

Production URL, after this build is deployed:

`https://app.crispdigital.io/api/mcp`

## What the tools do

System and brand: capabilities, system status, brands, brand sections, brand health.

Strategy: strategy, themes, campaigns. Theme and strategy changes are proposals. They do not replace the stored strategy.

Calendar: items by status, plus gaps such as a channel with nothing scheduled or a theme that has gone unused.

Opportunities: create, list, and evaluate. Evaluation compares the submission with stored strategy and themes. It does not treat the discoverer’s summary as a Brand Brain fact. A weak fit is not drafted.

Research: stored with sources and claims, and can be attached to a brief. Claims are not written into Brand Brain.

Content: create a brief from strategy, generate through the existing pipeline, generate from an opportunity only when evaluation says draft, revise with the previous version kept, and read versions. A multi-channel request runs the pipeline once per channel with that channel’s adaptation. LinkedIn, X, Threads, blog, Instagram, and Facebook are not given the same wording instruction.

Approval: list and submit. Submit sets CCE status to review and does not publish. The Folian credential cannot approve or reject. Chris remains the approver.

Scheduling: a recommendation does not invent an optimal time when history is thin. Schedule and reschedule require status `approved` or `scheduled`. They record the time in CCE and return `publisherArmed: false`. They do not set the LinkedIn queue to Ready To Publish.

Performance: content, channel, baseline, comparison, and top content. Empty or small samples return “Insufficient history for performance-informed optimisation.” No ranking is claimed from a tiny sample.

Learning: read stored learnings. A proposal is stored as a candidate edit signal and does not change Brand Brain.

Experiments: a proposal is created only when theme usage is visibly uneven or there are at least eight performance snapshots. The result has no winner and low confidence.

Community: inbox, reply drafts, and a request for human approval. Sending a reply is not granted.

External records: `cce_record_external_publish` stores a publish that already happened, after rejecting non-https and private hosts. It does not fetch the URL and does not publish. Engagement records include source and reliability.

Advertising: campaign and performance reads return `analytics_unavailable` until an account is connected. Campaign proposals are paused concepts and are not created on a platform. Budget changes return `approval_required` and are not applied.

Operations: `cce_get_marketing_brief` and `cce_get_next_best_actions` assemble the items above.

Feedback and assets: feedback is stored and not promoted to Brand Brain. An asset reference can be attached to a brief. This is not a media library.

## Errors

Errors are `{ ok: false, error: { code, message, retryable } }`.

| Code | When |
| --- | --- |
| `unauthenticated` | Missing or unknown key |
| `revoked_key` | Credential revoked |
| `expired_key` | `expires_at` has passed |
| `brand_not_accessible` | Brand is outside the credential, or the id is unknown |
| `capability_not_enabled` | The credential lacks the action’s capability |
| `approval_required` | Level 4 action, returned with an approval id and `executed: false` |
| `content_not_approved` | Schedule requested before human approval |
| `content_already_published` | Schedule or submit after publication |
| `idempotency_key_required` | Mutating call without a key |
| `idempotency_conflict` | Key reused with a different payload |
| `rate_limit` | Hourly requests or a daily action bucket |
| `ai_billing` | Daily generation budget exhausted, or provider billing failure |
| `ai_provider_unavailable` | Provider timeout or outage. Retryable |
| `invalid_url` | External URL is not public https |
| `analytics_unavailable` | No ad account is connected. Returned in the result, not always as a transport error |
| `native_intelligence_brand_not_enabled` | Generation is off for that canonical brand |
| `agent_store_unavailable` | Migration 026 is not applied |
| `unknown_action` | Action is not in the registry |

## Audit, idempotency, and events

Every executed action is written to `agent_audit_log` with agent, user, brand, action, capability, consequence, request id, idempotency key, a redacted request summary, affected object, result, approval flag, latency, and error code. Secrets are dropped from the summary.

Idempotency rows live in `agent_idempotency`. Rate windows and daily cost live in `agent_rate_windows` and `agent_daily_cost`. On more than one server instance the rate counter is a read-then-write, so it is a backstop against a runaway loop rather than a perfect global limiter.

Domain events are stored in `agent_records` (`content.created`, `content.ready_for_approval`, `content.approved`, `content.rejected`, `content.scheduled`, `content.published`, `opportunity.created`, `community.reply_needed`, `ad.proposal_created`). Outbound delivery is not implemented. `signAgentWebhook` exists for a later signed sender. Do not point an agent at an unsigned webhook.

## Channels

The channel registry distinguishes:

- `CCE_NATIVE` — CCE can draft or record a schedule without the platform
- `SUPPORTED_BY_PLATFORM` — a publisher or API exists, but this credential may still be forbidden to call it
- `CONNECTED_AND_AUTHORIZED` — not claimed unless a live permission check has passed
- `NOT_AUTHORIZED` — documented by the platform, not granted to CCE
- `NOT_IMPLEMENTED` — no adapter in this phase
- `DISCONNECTED` / `UNKNOWN` — do not treat as usable

LinkedIn personal and organisation posts remain on the existing publisher. Comments, mentions, and LinkedIn ads are not treated as authorised. X, Threads, Instagram Stories, newsletters, and native blog CMS adapters are not implemented. Instagram feed and Facebook Page publishing stay on the existing Meta path and are not granted to the agent. A Meta token is not treated as Threads access.

Article publishing continues to use `ArticlePublisher`. Webhook, blog, and newsletter destinations are registered. Framer, Webflow, WordPress, Payload, and Folian’s CMS are not adapters yet. Adding one does not change the agent action names.

## Data

Migration `supabase/migrations/026_agent_control_plane.sql` adds credentials, idempotency, rate windows, daily cost, audit, and `agent_records` for opportunities, briefs, research, community interactions, ad proposals, events, feedback, and assets. Row level security lets the owner read credentials, audit, and records. Writes go through the service role. The migration is not applied by this change.

`AGENT_SUBMIT_TO_QUEUE` defaults off. When set to `true`, submit-for-approval also confirms a non-held draft into the existing ContentQueue as Needs Approval. It does not set Ready To Publish. Leave it unset until that bridge is wanted.

## Rollout

P0, in this tree and covered by `src/lib/agent/__tests__/controlPlane.test.ts`: credentials, REST, MCP, Folian policy, the read and draft tools, audit, idempotency, and rate limits. The acceptance test discovers an opportunity, evaluates it, briefs, generates two channel-native drafts, revises, submits for approval, and checks that approve, schedule-before-approval, and budget changes do not publish or spend.

P1: native X, Threads, richer Instagram and Facebook community and analytics, LinkedIn analytics where the current token actually allows it, performance workers, community inbox ingestion.

P2: Folian CMS and other article adapters, paid read and analyse, paused campaign creation, experiment operations.

P3: selected autonomous publishing, selected replies, controlled spend changes, more brands, removal of Make, native replacement of the Airtable queue.

Make and Airtable paths used by the current product are unchanged. This API does not add a Make dependency and does not expose Airtable fields.
