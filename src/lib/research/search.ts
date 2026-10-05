export type SearchHit = {
	url: string;
	title?: string;
	snippet?: string;
	publishedAt?: string;
};

export type SearchDepth = 'basic' | 'advanced';

export type SearchOptions = {
	depth?: SearchDepth;
};

export type SearchProvider = {
	name: string;
	configured: boolean;
	search(query: string, count: number, options?: SearchOptions): Promise<SearchHit[]>;
};

function notConfigured(name: string): SearchProvider {
	return {
		name,
		configured: false,
		async search() {
			const error = new Error('search_provider_not_configured');
			(error as Error & { code: string }).code = 'search_provider_not_configured';
			throw error;
		},
	};
}

export function braveSearchProvider(fetchImpl: typeof fetch = fetch, key = process.env.BRAVE_SEARCH_API_KEY): SearchProvider {
	const token = key?.trim();
	if (!token) return notConfigured('brave');
	return {
		name: 'brave',
		configured: true,
		async search(query, count) {
			const url = new URL('https://api.search.brave.com/res/v1/web/search');
			url.searchParams.set('q', query.slice(0, 300));
			url.searchParams.set('count', String(Math.min(count, 8)));
			const response = await fetchImpl(url, {
				headers: { Accept: 'application/json', 'X-Subscription-Token': token },
			});
			if (!response.ok) throw new Error(`search_provider_error_${response.status}`);
			const body = (await response.json()) as { web?: { results?: Array<{ url?: string; title?: string; description?: string; age?: string }> } };
			return (body.web?.results ?? [])
				.filter((item) => item.url?.startsWith('https://'))
				.map((item) => ({
					url: item.url as string,
					title: item.title,
					snippet: item.description?.slice(0, 500),
					publishedAt: item.age,
				}));
		},
	};
}

export function tavilySearchProvider(fetchImpl: typeof fetch = fetch, key = process.env.TAVILY_API_KEY): SearchProvider {
	const token = key?.trim();
	if (!token) return notConfigured('tavily');
	return {
		name: 'tavily',
		configured: true,
		async search(query, count, options) {
			const depth: SearchDepth = options?.depth === 'advanced' ? 'advanced' : 'basic';
			const response = await fetchImpl('https://api.tavily.com/search', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					api_key: token,
					query: query.slice(0, 400),
					search_depth: depth,
					max_results: Math.min(Math.max(count, 1), 8),
					include_answer: false,
					include_raw_content: false,
				}),
			});
			if (!response.ok) throw new Error(`search_provider_error_${response.status}`);
			const body = (await response.json()) as {
				results?: Array<{ url?: string; title?: string; content?: string; published_date?: string }>;
			};
			return (body.results ?? [])
				.filter((item) => item.url?.startsWith('https://'))
				.map((item) => ({
					url: item.url as string,
					title: item.title,
					snippet: item.content?.slice(0, 500),
					publishedAt: item.published_date,
				}));
		},
	};
}

export function selectSearchProvider(fetchImpl?: typeof fetch): SearchProvider {
	const choice = (process.env.RESEARCH_SEARCH_PROVIDER ?? 'tavily').toLowerCase();
	const fetcher = fetchImpl ?? fetch;
	if (choice === 'tavily') return tavilySearchProvider(fetcher);
	if (choice === 'brave') return braveSearchProvider(fetcher);
	if (choice === 'exa') return notConfigured('exa');
	return notConfigured(choice || 'unconfigured');
}
