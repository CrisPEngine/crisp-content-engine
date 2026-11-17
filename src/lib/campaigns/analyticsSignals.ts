import type { Ga4Report } from './ga4';
import type { SearchConsoleReport } from './searchConsole';
import type { InventoryArticle } from './types';

const MEANINGFUL_IMPRESSIONS = 50;

function pathOf(value: string): string {
	try {
		const url = new URL(value);
		return url.pathname.replace(/\/$/, '') || '/';
	} catch {
		return value.replace(/\/$/, '');
	}
}

export type SearchSignal = {
	kind: 'low_ctr' | 'outside_leading_positions' | 'content_gap' | 'improvement_candidate';
	query?: string;
	page?: string | null;
	impressions: number | null;
	clicks: number | null;
	ctr: number | null;
	position: number | null;
	matchedArticleId: string | null;
	rationale: string;
};

export function searchConsoleSignals(report: SearchConsoleReport, inventory: InventoryArticle[]): SearchSignal[] {
	const signals: SearchSignal[] = [];
	const pagesByQuery = new Map<string, string[]>();
	for (const row of report.queryPages) {
		const pages = pagesByQuery.get(row.query) ?? [];
		pages.push(row.page);
		pagesByQuery.set(row.query, pages);
	}
	for (const row of report.queries) {
		const pages = pagesByQuery.get(row.query) ?? [];
		const matched = inventory.find((article) => article.url && pages.some((page) => pathOf(page) === pathOf(article.url!)));
		if (row.impressions != null && row.impressions >= MEANINGFUL_IMPRESSIONS && row.ctr != null && row.ctr < 0.03) {
			signals.push({
				kind: 'low_ctr',
				query: row.query,
				page: pages[0] ?? null,
				impressions: row.impressions,
				clicks: row.clicks,
				ctr: row.ctr,
				position: row.position,
				matchedArticleId: matched?.id ?? null,
				rationale: `Search Console recorded ${row.impressions} impressions and a CTR of ${row.ctr}. This is observed search demand, using the query total rather than a page-split row.`,
			});
		}
		if (row.impressions != null && row.impressions > 0 && row.position != null && row.position > 10) {
			signals.push({
				kind: 'outside_leading_positions',
				query: row.query,
				page: pages[0] ?? null,
				impressions: row.impressions,
				clicks: row.clicks,
				ctr: row.ctr,
				position: row.position,
				matchedArticleId: matched?.id ?? null,
				rationale: `Average position ${row.position} is outside the first ten results. Impressions are ${row.impressions}.`,
			});
		}
		if (row.impressions != null && row.impressions >= MEANINGFUL_IMPRESSIONS && !matched) {
			signals.push({
				kind: 'content_gap',
				query: row.query,
				page: pages[0] ?? null,
				impressions: row.impressions,
				clicks: row.clicks,
				ctr: row.ctr,
				position: row.position,
				matchedArticleId: null,
				rationale: pages.length
					? 'The query has Search Console impressions, and none of the returned pages match an article stored for this brand.'
					: 'The query has Search Console impressions and no landing page was returned for it.',
			});
		}
		if (matched && ((row.position != null && row.position > 10) || (row.ctr != null && row.ctr < 0.03))) {
			signals.push({
				kind: 'improvement_candidate',
				query: row.query,
				page: matched.url,
				impressions: row.impressions,
				clicks: row.clicks,
				ctr: row.ctr,
				position: row.position,
				matchedArticleId: matched.id,
				rationale: `Existing article “${matched.title}” matches a Search Console page for this query. The article was not changed.`,
			});
		}
	}
	return signals;
}

export type AnalyticsSignal = {
	kind: 'engaged_landing_page' | 'traffic_source';
	landingPage?: string;
	channel?: string | null;
	source?: string | null;
	sessions: number | null;
	engagementRate: number | null;
	rationale: string;
};

export function analyticsSignals(report: Ga4Report): AnalyticsSignal[] {
	const signals: AnalyticsSignal[] = [];
	for (const page of report.landingPages) {
		if (page.sessions != null && page.sessions > 0 && page.engagementRate != null && page.engagementRate >= 0.5) {
			signals.push({
				kind: 'engaged_landing_page',
				landingPage: page.landingPage,
				sessions: page.sessions,
				engagementRate: page.engagementRate,
				rationale: 'GA4 engagement supports how visitors behaved after arrival. It is not evidence of search demand.',
			});
		}
	}
	for (const source of report.sources) {
		if (source.sessions == null) continue;
		signals.push({
			kind: 'traffic_source',
			channel: source.channel,
			source: source.source,
			sessions: source.sessions,
			engagementRate: null,
			rationale: 'Traffic-source sessions are kept separate from Search Console demand.',
		});
	}
	return signals;
}
