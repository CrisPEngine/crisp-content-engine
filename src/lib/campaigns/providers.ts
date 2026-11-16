import type { MeasuredSearch, ProviderAvailability } from './types';

export type SearchConsoleQueryRow = {
	query: string;
	page: string | null;
	impressions: number;
	clicks: number;
	ctr: number;
	position: number;
};

export function providerAvailability(env: Record<string, string | undefined> = process.env): ProviderAvailability[] {
	const searchConfigured = Boolean(env.TAVILY_API_KEY?.trim() || env.BRAVE_SEARCH_API_KEY?.trim());
	const gsc = gscConfigured(env);
	return [
		{ id: 'inventory', label: 'Existing articles', state: 'available', detail: 'Overlap uses articles already stored for the selected brand.' },
		{ id: 'strategy', label: 'Approved strategy and themes', state: 'available', detail: 'Themes can be recorded as strategic suggestions. They are not treated as measured demand.' },
		{
			id: 'search',
			label: 'Search research',
			state: searchConfigured ? 'available' : 'unavailable',
			detail: searchConfigured
				? `Using ${env.RESEARCH_SEARCH_PROVIDER?.trim() || 'tavily'}. Results are evidence of coverage, not keyword volume.`
				: 'Set TAVILY_API_KEY or BRAVE_SEARCH_API_KEY, and optionally RESEARCH_SEARCH_PROVIDER, to retrieve public search results.',
		},
		{
			id: 'search_console',
			label: 'Google Search Console',
			state: gsc ? 'available' : 'unavailable',
			detail: gsc
				? `Property ${env.GOOGLE_SEARCH_CONSOLE_SITE_URL?.trim()}.`
				: 'Set GOOGLE_SEARCH_CONSOLE_SITE_URL plus either GOOGLE_SEARCH_CONSOLE_ACCESS_TOKEN or GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_SEARCH_CONSOLE_REFRESH_TOKEN. Use the Search Console read-only scope. No query data is available until this is configured.',
		},
		{
			id: 'community',
			label: 'Public community discussions',
			state: searchConfigured ? 'available' : 'unavailable',
			detail: searchConfigured
				? 'Public discussions are retrieved through the configured search provider and stored with their URLs.'
				: 'Community research uses the same search provider. Configure it before discussions can be retrieved.',
		},
		{ id: 'analytics', label: 'Website analytics', state: 'unavailable', detail: 'No analytics property is connected. Page behaviour will not be invented.' },
	];
}

export function gscConfigured(env: Record<string, string | undefined> = process.env): boolean {
	const site = env.GOOGLE_SEARCH_CONSOLE_SITE_URL?.trim();
	const access = env.GOOGLE_SEARCH_CONSOLE_ACCESS_TOKEN?.trim();
	const refresh = env.GOOGLE_CLIENT_ID?.trim() && env.GOOGLE_CLIENT_SECRET?.trim() && env.GOOGLE_SEARCH_CONSOLE_REFRESH_TOKEN?.trim();
	return Boolean(site && (access || refresh));
}

async function gscAccessToken(env: Record<string, string | undefined>, fetchImpl: typeof fetch): Promise<string> {
	const direct = env.GOOGLE_SEARCH_CONSOLE_ACCESS_TOKEN?.trim();
	if (direct) return direct;
	const response = await fetchImpl('https://oauth2.googleapis.com/token', {
		method: 'POST',
		headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
		body: new URLSearchParams({
			client_id: env.GOOGLE_CLIENT_ID!.trim(),
			client_secret: env.GOOGLE_CLIENT_SECRET!.trim(),
			refresh_token: env.GOOGLE_SEARCH_CONSOLE_REFRESH_TOKEN!.trim(),
			grant_type: 'refresh_token',
		}),
	});
	if (!response.ok) throw new Error(`Search Console token refresh failed (${response.status}).`);
	const body = (await response.json()) as { access_token?: string };
	if (!body.access_token) throw new Error('Search Console token refresh did not return an access token.');
	return body.access_token;
}

export async function fetchSearchConsoleQueries(input: {
	startDate: string;
	endDate: string;
	rowLimit?: number;
	env?: Record<string, string | undefined>;
	fetchImpl?: typeof fetch;
}): Promise<SearchConsoleQueryRow[]> {
	const env = input.env ?? process.env;
	if (!gscConfigured(env)) {
		const error = new Error('Google Search Console is not configured.');
		(error as Error & { code: string }).code = 'search_console_not_configured';
		throw error;
	}
	const fetchImpl = input.fetchImpl ?? fetch;
	const token = await gscAccessToken(env, fetchImpl);
	const site = encodeURIComponent(env.GOOGLE_SEARCH_CONSOLE_SITE_URL!.trim());
	const response = await fetchImpl(`https://searchconsole.googleapis.com/webmasters/v3/sites/${site}/searchAnalytics/query`, {
		method: 'POST',
		headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
		body: JSON.stringify({
			startDate: input.startDate,
			endDate: input.endDate,
			dimensions: ['query', 'page'],
			rowLimit: Math.min(input.rowLimit ?? 25, 50),
		}),
	});
	if (!response.ok) throw new Error(`Search Console query failed (${response.status}).`);
	const body = (await response.json()) as { rows?: Array<{ keys?: string[]; clicks?: number; impressions?: number; ctr?: number; position?: number }> };
	return (body.rows ?? []).map((row) => ({
		query: row.keys?.[0] ?? '',
		page: row.keys?.[1] ?? null,
		clicks: row.clicks ?? 0,
		impressions: row.impressions ?? 0,
		ctr: row.ctr ?? 0,
		position: row.position ?? 0,
	})).filter((row) => row.query);
}

export function measuredFromRow(row: SearchConsoleQueryRow, startDate: string, endDate: string): MeasuredSearch {
	return {
		impressions: row.impressions,
		clicks: row.clicks,
		ctr: row.ctr,
		position: row.position,
		startDate,
		endDate,
	};
}
