import { GoogleProviderError } from './googleAuth';

export type SearchConsoleMetric = {
	impressions: number | null;
	clicks: number | null;
	ctr: number | null;
	position: number | null;
};

export type SearchConsoleQuery = SearchConsoleMetric & { query: string };
export type SearchConsolePage = SearchConsoleMetric & { page: string };
export type SearchConsoleQueryPage = SearchConsoleMetric & { query: string; page: string };

export type SearchConsoleReport = {
	siteUrl: string;
	startDate: string;
	endDate: string;
	retrievedAt: string;
	queries: SearchConsoleQuery[];
	pages: SearchConsolePage[];
	queryPages: SearchConsoleQueryPage[];
};

type AnalyticsRow = { keys?: string[]; clicks?: number; impressions?: number; ctr?: number; position?: number };

function metric(value: unknown): number | null {
	return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function metrics(row: AnalyticsRow): SearchConsoleMetric {
	return {
		clicks: metric(row.clicks),
		impressions: metric(row.impressions),
		ctr: metric(row.ctr),
		position: metric(row.position),
	};
}

async function googleFailure(response: Response, prefix: string): Promise<never> {
	let code = `${prefix}_failed`;
	if (response.status === 401) code = `${prefix}_unauthorized`;
	if (response.status === 403) code = `${prefix}_forbidden`;
	if (response.status === 429) code = `${prefix}_quota`;
	let message = `${prefix === 'search_console' ? 'Search Console' : 'GA4'} request failed (${response.status}).`;
	try {
		const body = (await response.json()) as { error?: { message?: string } };
		const apiMessage = body.error?.message;
		if (typeof apiMessage === 'string' && apiMessage.length > 0 && apiMessage.length < 300 && !/private_key|BEGIN PRIVATE KEY/i.test(apiMessage)) {
			message = apiMessage;
		}
	} catch {
		/* keep the status message */
	}
	if (response.status === 403) {
		message = prefix === 'search_console'
			? `${message} Add the service account as a restricted user on this Search Console property.`
			: `${message} Grant the service account Viewer access on this GA4 property.`;
	}
	if (response.status === 429) message = `${message} The Google quota was reached. Wait before trying again.`;
	throw new GoogleProviderError(message, code, response.status);
}

export async function fetchSearchConsoleReport(input: {
	siteUrl: string;
	startDate: string;
	endDate: string;
	accessToken: string;
	fetchImpl?: typeof fetch;
	pageSize?: number;
	maxRows?: number;
}): Promise<SearchConsoleReport> {
	const siteUrl = input.siteUrl.trim();
	if (!siteUrl) throw new GoogleProviderError('Search Console has no property for this brand.', 'search_console_not_bound');
	const fetchImpl = input.fetchImpl ?? fetch;
	const pageSize = Math.min(Math.max(input.pageSize ?? 250, 1), 25000);
	const maxRows = Math.min(Math.max(input.maxRows ?? 1000, 1), 5000);
	const retrievedAt = new Date().toISOString();

	async function pagesOf(dimensions: string[]): Promise<AnalyticsRow[]> {
		const collected: AnalyticsRow[] = [];
		let startRow = 0;
		while (collected.length < maxRows) {
			const rowLimit = Math.min(pageSize, maxRows - collected.length);
			const response = await fetchImpl(`https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`, {
				method: 'POST',
				headers: { Authorization: `Bearer ${input.accessToken}`, 'Content-Type': 'application/json' },
				body: JSON.stringify({ startDate: input.startDate, endDate: input.endDate, dimensions, rowLimit, startRow }),
			});
			if (!response.ok) await googleFailure(response, 'search_console');
			const body = (await response.json()) as { rows?: AnalyticsRow[] };
			const rows = body.rows ?? [];
			collected.push(...rows);
			if (rows.length < rowLimit) break;
			startRow += rows.length;
		}
		return collected;
	}

	const [queries, pages, queryPages] = await Promise.all([
		pagesOf(['query']),
		pagesOf(['page']),
		pagesOf(['query', 'page']),
	]);
	return {
		siteUrl,
		startDate: input.startDate,
		endDate: input.endDate,
		retrievedAt,
		queries: queries.flatMap((row) => {
			const query = row.keys?.[0]?.trim();
			return query ? [{ query, ...metrics(row) }] : [];
		}),
		pages: pages.flatMap((row) => {
			const page = row.keys?.[0]?.trim();
			return page ? [{ page, ...metrics(row) }] : [];
		}),
		queryPages: queryPages.flatMap((row) => {
			const query = row.keys?.[0]?.trim();
			const page = row.keys?.[1]?.trim();
			return query && page ? [{ query, page, ...metrics(row) }] : [];
		}),
	};
}

export type UrlInspection = {
	inspectionUrl: string;
	coverageState: string | null;
	verdict: string | null;
	indexing: 'indexed' | 'not_confirmed';
	lastCrawlTime: string | null;
	googleCanonical: string | null;
	userCanonical: string | null;
	retrievedAt: string;
};

/** URL Inspection only. This does not call the Indexing API. */
export async function inspectSearchConsoleUrl(input: {
	siteUrl: string;
	inspectionUrl: string;
	accessToken: string;
	fetchImpl?: typeof fetch;
}): Promise<UrlInspection> {
	const fetchImpl = input.fetchImpl ?? fetch;
	const response = await fetchImpl('https://searchconsole.googleapis.com/v1/urlInspection/index:inspect', {
		method: 'POST',
		headers: { Authorization: `Bearer ${input.accessToken}`, 'Content-Type': 'application/json' },
		body: JSON.stringify({ inspectionUrl: input.inspectionUrl, siteUrl: input.siteUrl, languageCode: 'en-US' }),
	});
	if (!response.ok) await googleFailure(response, 'search_console');
	const body = (await response.json()) as {
		inspectionResult?: {
			indexStatusResult?: {
				verdict?: string;
				coverageState?: string;
				lastCrawlTime?: string;
				googleCanonical?: string;
				userCanonical?: string;
			};
		};
	};
	const status = body.inspectionResult?.indexStatusResult;
	const coverage = status?.coverageState ?? null;
	return {
		inspectionUrl: input.inspectionUrl,
		coverageState: coverage,
		verdict: status?.verdict ?? null,
		indexing: coverage === 'Submitted and indexed' ? 'indexed' : 'not_confirmed',
		lastCrawlTime: status?.lastCrawlTime ?? null,
		googleCanonical: status?.googleCanonical ?? null,
		userCanonical: status?.userCanonical ?? null,
		retrievedAt: new Date().toISOString(),
	};
}
