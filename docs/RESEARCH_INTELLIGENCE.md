# Research intelligence

Native research extends the existing agent research record. A packet stores the project, query, sources, excerpts, claims, findings, entities, topics, contradictions, and proposals. It does not replace Brand Brain.

## Provider

The search interface is `SearchProvider`. The default implementation is the [Tavily Search API](https://docs.tavily.com/documentation/api-reference/endpoint/search) (`POST https://api.tavily.com/search`).

Tavily is the initial provider on the free Researcher plan. CCE uses **Basic Search** by default and **Advanced Search** only when the research necessity classifier returns `FULL_RESEARCH` or `REFRESH_EXISTING_RESEARCH`. Owned-site pages are still fetched directly; search is only used for third-party discovery.

Set `TAVILY_API_KEY` and leave `RESEARCH_SEARCH_PROVIDER=tavily` (the default). To use Brave instead, set `RESEARCH_SEARCH_PROVIDER=brave` and `BRAVE_SEARCH_API_KEY`. If no provider key is configured, owned-site research still runs and the packet records that external search was not configured. No synthetic sources are created.

`RESEARCH_ENABLED=false` disables research runs. Monitors are stored with a cadence and a per-brand cap. They do not crawl on their own.

## What is not automatic

Competitor claims, reviews, social posts, news, and model inferences are not written into Brand Brain. A signed-in user can confirm a first-party proposal. That confirmation is the promotion step.
