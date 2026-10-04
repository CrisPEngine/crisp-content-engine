# Connect Grok to CCE for Folian

Do this after the agent control plane is deployed and migration `026_agent_control_plane.sql` is applied. This document does not contain a credential secret. The secret is shown once in CCE and should not be pasted into a ticket or a doc.

## 1. Create the Folian credential

1. Sign in to CCE at `https://app.crispdigital.io`.
2. Open `https://app.crispdigital.io/admin/agents`.
3. Name: `Folian Marketing Grok`.
4. CCE brand id: `03cba45a-6faf-4b6c-a20b-2c2496318b58`.
5. Choose **Create Folian operator credential**.

That policy can read Folian, create opportunities, briefs, drafts, and revisions, submit for approval, schedule only after a human has approved, and propose experiments or ad changes. It cannot approve its own content, publish, send a reply, activate an ad, or change spend.

Copy the `cce_agent_…` secret immediately. CCE stores only a hash. If it is lost, revoke the credential and create another. Do not commit the secret.

Recommended limits on that credential are 60 requests an hour, 15 generations a day, 30 research writes a day, 5 schedule records a day, 10 ad proposals a day, and a 25 USD estimated generation budget. The Folian button applies those limits.

Set `AGENT_KEY_PEPPER` in the production environment before creating the first key. Leave `AGENT_SUBMIT_TO_QUEUE` unset until you explicitly want a submitted draft to appear in the existing approval queue. Even then, the queue status is Needs Approval, not Ready To Publish.

## 2. Add the connector in Grok

The server is MCP Streamable HTTP.

- URL: `https://app.crispdigital.io/api/mcp`
- Header: `Authorization: Bearer <the secret>`

On grok.com:

1. Open [grok.com/connectors](https://grok.com/connectors).
2. Choose **New Connector**, then **Custom**.
3. Enter `https://app.crispdigital.io/api/mcp`.
4. Complete the authentication step. If the form asks for a bearer token or an authorization header, use the secret from step 1. Do not put the secret in the URL.

For the Grok API or the `grok` CLI, the equivalent remote server is:

```bash
grok mcp add --transport http cce https://app.crispdigital.io/api/mcp --header "Authorization: Bearer ${CCE_AGENT_SECRET}"
```

Keep the secret in the environment. Do not write it into a shared config file.

Grok Business or Enterprise may need an admin to add the connector in the team console before members can use it.

## 3. Test the connection

Ask Grok to call these tools, in order:

1. `cce_get_capabilities` — Folian should be the only brand. LinkedIn publish is supported by the existing publisher, but this credential cannot publish. X and Threads should show as not implemented. Do not continue if Grok reports a channel as connected when the tool says `NOT_IMPLEMENTED` or `UNKNOWN`.
2. `cce_get_brand` — the name is Folian, and the positioning comes from Brand Brain. If sections are omitted, the answer is identity, positioning, voice, and guardrails, not the entire knowledge base.
3. `cce_get_marketing_brief` — scheduled work, items waiting for approval, gaps, performance, and decisions for you. If performance history is thin, the brief says so.

A failed call should be a code such as `unauthenticated`, `capability_not_enabled`, or `brand_not_accessible`, not a guessed brand fact.

## 4. Job description to give Grok

Use this as the standing instruction:

> You are Folian’s marketing operator. CCE is the system of record. Use the CCE connector for brand, strategy, calendar, content, performance, and approvals. Do not invent Folian positioning, voice, or proof. Do not keep a separate calendar or brand brain. Discover opportunities, including on X, and submit them with `cce_create_opportunity` including the URL and a short excerpt. Let CCE evaluate fit before you ask it to draft. Ask CCE to generate, revise, and submit. I approve. You do not approve, publish, send replies, or change ad spend. If a tool returns `approval_required`, `content_not_approved`, or `capability_not_enabled`, stop and tell me. If performance history is insufficient, say so and do not recommend a winning time, hook, or budget move.

## 5. Approval boundaries

Grok may, without asking first:

- read Folian marketing state
- save an opportunity, a research note, a brief, a draft, or a revision
- submit a draft for your approval
- propose an experiment, a theme, a strategy change, or an ad change

Grok must bring these to you:

- anything waiting in `cce_get_pending_approvals`
- a reply draft
- a schedule, and only after you have approved the content in CCE
- any `approval_required` result, especially spend

Grok must not:

- approve or reject its own draft
- publish, including by posting outside CCE and forgetting to record it
- change Brand Brain hard rules or replace strategy
- activate, pause, delete, or rebudget a campaign

If Grok publishes somewhere CCE cannot reach yet, the next call is `cce_record_external_publish` with the content id, channel, external id, and https URL. That records the relationship. It is not permission to publish.

## 6. First routine

Start with one morning pass, not an autonomous poster:

1. `cce_get_marketing_brief`
2. `cce_get_next_best_actions`
3. Tell you what is waiting, what is missing from the calendar, and what performance cannot yet support.
4. If it found a relevant public conversation, `cce_create_opportunity`, then `cce_evaluate_opportunity`.
5. Only if CCE’s evaluation says draft: `cce_create_brief`, `cce_generate_content`, optional `cce_request_revision`, then `cce_submit_for_approval`.
6. Stop. You approve in CCE.

Do not add a routine that calls approve, publish, or budget tools. Those capabilities are absent on this credential, and a budget proposal must remain unapplied.
