export type SearchHit = {
	url: string;
	title?: string;
	snippet?: string;
	publishedAt?: string;
};

export type SearchProvider = {
	name: string;
	configured: boolean;
	search(query: string, count: number): Promise<SearchHit[]>;
};

export function braveSearchProvider(fetchImpl: typeof fetch = fetch, key = process.env.BRAVE_SEARCH_API_KEY): SearchProvider {
	const token = key?.trim();
	return {
		name: 'brave',
		configured: Boolean(token),
		async search(query, count) {
			if (!token) {
				const error = new Error('search_provider_not_configured');
				(error as Error & { code: string }).code = 'search_provider_not_configured';
				throw error;
			}
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

export function selectSearchProvider(fetchImpl?: typeof fetch): SearchProvider {
	const choice = (process.env.RESEARCH_SEARCH_PROVIDER ?? 'brave').toLowerCase();
	if (choice === 'brave') return braveSearchProvider(fetchImpl);
	return {
		name: choice || 'unconfigured',
		configured: false,
		async search() {
			throw new Error('search_provider_not_configured');
		},
	};
}
