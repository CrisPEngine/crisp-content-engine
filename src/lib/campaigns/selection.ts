import type { Ga4LandingPage } from './ga4';
import type { DiscoveredCandidate } from './discovery';
import { assessOverlap } from './overlap';
import type { SearchConsolePage, SearchConsoleQuery, SearchConsoleQueryPage } from './searchConsole';
import type { InventoryArticle, OverlapAssessment } from './types';

const MEANINGFUL_IMPRESSIONS = 50;
const MINIMUM_IMPRESSIONS = 20;

function pathOf(value: string | null | undefined): string {
	if (!value) return '';
	try {
		const url = new URL(value);
		return url.pathname.replace(/\/$/, '') || '/';
	} catch {
		return value.replace(/\/$/, '') || '/';
	}
}

function isArticlePath(path: string): boolean {
	return path.startsWith('/articles/');
}

function brandOnly(query: string, brandTerms: string[]): boolean {
	const words = query.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((word) => word.length > 2);
	const brands = new Set(brandTerms.flatMap((term) => term.toLowerCase().split(/\s+/)).filter((word) => word.length > 2));
	return words.length > 0 && words.every((word) => brands.has(word));
}

function landingSupport(path: string, landingPages: Ga4LandingPage[]): string | null {
	const match = landingPages.find((page) => pathOf(page.landingPage) === path);
	if (!match || match.sessions == null) return null;
	const engagement = match.engagementRate == null ? 'engagement was not returned' : `engagement rate ${(match.engagementRate * 100).toFixed(0)}%`;
	return `GA4 recorded ${match.sessions} organic session${match.sessions === 1 ? '' : 's'} on ${path}. ${engagement}. This is behaviour after arrival, not search demand.`;
}

export function selectObservedOpportunities(input: {
	siteUrl: string;
	startDate: string;
	endDate: string;
	retrievedAt: string;
	queries: SearchConsoleQuery[];
	queryPages: SearchConsoleQueryPage[];
	pages: SearchConsolePage[];
	inventory: InventoryArticle[];
	brandTerms: string[];
	verifiedCapabilities: string[];
	themes?: string[];
	landingPages?: Ga4LandingPage[];
	limit?: number;
}): DiscoveredCandidate[] {
	const landingPages = input.landingPages ?? [];
	const candidates: DiscoveredCandidate[] = [];
	const complete = input.queries.filter((row) => row.impressions != null && row.clicks != null && row.ctr != null && row.position != null && row.impressions >= MINIMUM_IMPRESSIONS);
	for (const row of complete.sort((left, right) => (right.impressions ?? 0) - (left.impressions ?? 0))) {
		const impressions = row.impressions!;
		const clicks = row.clicks!;
		const ctr = row.ctr!;
		const position = row.position!;
		const attributed = input.queryPages.filter((item) => item.query === row.query && item.page);
		const primaryPage = attributed.sort((left, right) => (right.impressions ?? 0) - (left.impressions ?? 0))[0]?.page ?? null;
		const pagePath = pathOf(primaryPage);
		const inventoryMatch = input.inventory.find((article) => article.url && pathOf(article.url) === pagePath);
		const publishedArticle = isArticlePath(pagePath);
		const namedCapability = input.verifiedCapabilities.find((name) => row.query.toLowerCase().includes(name.toLowerCase()));
		const theme = (input.themes ?? []).find((item) => item && row.query.toLowerCase().includes(item.toLowerCase().slice(0, 24)));
		let overlap: OverlapAssessment;
		if (brandOnly(row.query, input.brandTerms) && (pagePath === '/' || pagePath === '') && position <= 5) {
			overlap = {
				decision: 'reject',
				overlap: 1,
				matchedArticleId: inventoryMatch?.id ?? null,
				matchedTitle: inventoryMatch?.title ?? 'Homepage',
				rationale: `“${row.query}” already reaches the homepage at average position ${position.toFixed(1)}. A new article would not answer a distinct audience problem. Nothing was overwritten.`,
			};
		} else if (inventoryMatch || publishedArticle) {
			const title = inventoryMatch?.title ?? primaryPage;
			const weak = ctr < 0.03 || position > 10;
			overlap = weak
				? {
					decision: 'update',
					overlap: 1,
					matchedArticleId: inventoryMatch?.id ?? null,
					matchedTitle: title,
					rationale: `Search Console attributes “${row.query}” to ${primaryPage}. That page already exists${inventoryMatch ? ' in the article inventory' : ' on the site'}. ${impressions} impressions, CTR ${(ctr * 100).toFixed(2)}%, position ${position.toFixed(1)}. Improve that page instead of creating another. Nothing was overwritten.`,
				}
				: {
					decision: 'reject',
					overlap: 1,
					matchedArticleId: inventoryMatch?.id ?? null,
					matchedTitle: title,
					rationale: `“${row.query}” already lands on ${primaryPage} at position ${position.toFixed(1)} with CTR ${(ctr * 100).toFixed(2)}%. Creating another article would compete with it. Nothing was overwritten.`,
				};
		} else {
			const textual = assessOverlap({ title: row.query }, input.inventory);
			overlap = textual.decision === 'create'
				? textual
				: { ...textual, rationale: `${textual.rationale} The query was not attributed to that article’s URL.` };
		}
		if (impressions < MEANINGFUL_IMPRESSIONS && overlap.decision === 'create') {
			overlap = {
				decision: 'research',
				overlap: overlap.overlap,
				matchedArticleId: overlap.matchedArticleId,
				matchedTitle: overlap.matchedTitle,
				rationale: `${impressions} impressions are recorded, which is below the 50-impression line used for a production decision. This needs more evidence before an article is started.`,
			};
		}
		const ga4 = landingSupport(pagePath, landingPages);
		const measured = { impressions, clicks, ctr, position, startDate: input.startDate, endDate: input.endDate };
		candidates.push({
			title: row.query,
			audienceProblem: primaryPage
				? `People searching “${row.query}” are being shown ${primaryPage}.`
				: `Search Console recorded “${row.query}” without a landing page.`,
			searchIntent: 'informational',
			demandClass: 'observed',
			discoverySource: 'search_console',
			naturalKey: `search_console:${row.query.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()}`,
			forcedOverlap: overlap,
			evidence: [
				{
					sourceKind: 'search_console',
					url: primaryPage,
					excerpt: `${impressions} impressions, ${clicks} clicks, CTR ${(ctr * 100).toFixed(2)}%, position ${position.toFixed(1)}. Property ${input.siteUrl}. Query total, not a split page row. Retrieved ${input.retrievedAt}.`,
					observedAt: input.retrievedAt,
					metrics: measured,
				},
				...(ga4 ? [{ sourceKind: 'ga4', url: primaryPage, excerpt: ga4, observedAt: input.retrievedAt, metrics: null }] : []),
			],
			brandRelevance: namedCapability ? 0.85 : 0.55,
			brandRationale: [
				namedCapability
					? `The query names the verified capability “${namedCapability}”.`
					: 'No verified product capability is named by this query. The recommendation does not invent product behaviour.',
				theme ? `Approved theme “${theme}” points the same way. The theme is not search demand.` : '',
			].filter(Boolean).join(' '),
			businessRelevance: impressions >= MEANINGFUL_IMPRESSIONS ? 0.7 : 0.4,
			businessRationale: ga4
				? 'Business relevance uses Search Console impressions. GA4 is attached only as supporting on-page behaviour.'
				: 'Business relevance uses Search Console impressions. No GA4 session was matched to this page, and none was invented.',
		});
		if (candidates.length >= (input.limit ?? 20)) break;
	}
	return candidates;
}
