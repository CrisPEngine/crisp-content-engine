# Research intelligence

Native research extends the existing agent research record. A packet stores the project, query, sources, excerpts, claims, findings, entities, topics, contradictions, and proposals. It does not replace Brand Brain.

## Provider

The search interface is `SearchProvider`. The first implementation is the Brave Search API (`https://api.search.brave.com/res/v1/web/search`).

Brave is the initial provider because it has an independent web index, returns source URLs, covers news, and has a flat public price of about $5 per 1,000 requests. CCE still fetches owned pages itself, so search is only used for third-party discovery.

Set `BRAVE_SEARCH_API_KEY` and leave `RESEARCH_SEARCH_PROVIDER=brave` (the default). If the key is absent, owned-site research still runs and the packet records that external search was not configured. No synthetic sources are created.

`RESEARCH_ENABLED=false` disables research runs. Monitors are stored with a cadence and a per-brand cap. They do not crawl on their own.

## What is not automatic

Competitor claims, reviews, social posts, news, and model inferences are not written into Brand Brain. A signed-in user can confirm a first-party proposal. That confirmation is the promotion step.
