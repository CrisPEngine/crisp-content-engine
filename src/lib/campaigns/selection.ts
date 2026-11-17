import type { Ga4LandingPage } from './ga4';
import type { DiscoveredCandidate } from './discovery';
import { assessOverlap } from './overlap';
import type { SearchConsolePage, SearchConsoleQuery, SearchConsoleQueryPage } from './searchConsole';
import { DEFAULT_SCORE_THRESHOLDS, type InventoryArticle, type OverlapAssessment, type ScoreThresholds } from './types';

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
	thresholds?: ScoreThresholds;
	limit?: number;
}): DiscoveredCandidate[] {
	const thresholds = input.thresholds ?? DEFAULT_SCORE_THRESHOLDS;
	const landingPages = input.landingPages ?? [];
	const candidates: DiscoveredCandidate[] = [];
	const complete = input.queries.filter((row) => row.impressions != null && row.clicks != null && row.ctr != null && row.position != null && row.impressions >= thresholds.meaningfulImpressions);
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
		if (impressions < thresholds.highConfidenceImpressions && overlap.decision === 'create') {
			overlap = {
				decision: 'research',
				overlap: overlap.overlap,
				matchedArticleId: overlap.matchedArticleId,
				matchedTitle: overlap.matchedTitle,
				rationale: `${impressions} impressions are recorded, which is below the 50-impression line used for a production decision. This needs more evidence before an article is started.`,
			};
		}
		const ga4 = landingSupport(pagePath, landingPages);
		const measured = { impressions, clicks, ctr, position, startDate: input.startDate, endDate: input.endDate, scope: 'query' as const };
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
			businessRelevance: impressions >= thresholds.highConfidenceImpressions ? 0.7 : 0.4,
			businessRationale: ga4
				? 'Business relevance uses Search Console impressions. GA4 is attached only as supporting on-page behaviour.'
				: 'Business relevance uses Search Console impressions. No GA4 session was matched to this page, and none was invented.',
		});
		if (candidates.length >= (input.limit ?? 20)) break;
	}
	const covered = new Set(candidates.map((candidate) => pathOf(candidate.evidence.find((item) => item.sourceKind === 'search_console')?.url)));
	for (const page of input.pages.filter((row) => row.impressions != null && row.clicks != null && row.ctr != null && row.position != null && row.impressions >= thresholds.highConfidenceImpressions)) {
		if (candidates.length >= (input.limit ?? 20)) break;
		const pagePath = pathOf(page.page);
		if (!isArticlePath(pagePath) || covered.has(pagePath)) continue;
		covered.add(pagePath);
		const title = pagePath.split('/').filter(Boolean).pop()?.replace(/-/g, ' ') || page.page;
		const inventoryMatch = input.inventory.find((article) => article.url && pathOf(article.url) === pagePath);
		const ga4 = landingSupport(pagePath, landingPages);
		candidates.push({
			title,
			audienceProblem: `The existing page ${page.page} is being shown in search.`,
			searchIntent: 'informational',
			demandClass: 'observed',
			discoverySource: 'search_console',
			naturalKey: `search_console:page:${pagePath}`,
			forcedOverlap: {
				decision: 'update',
				overlap: 1,
				matchedArticleId: inventoryMatch?.id ?? null,
				matchedTitle: inventoryMatch?.title ?? page.page,
				rationale: `This is the page total for ${page.page}: ${page.impressions} impressions, ${page.clicks} clicks, CTR ${((page.ctr ?? 0) * 100).toFixed(2)}%, position ${(page.position ?? 0).toFixed(1)}. Individual queries were too fragmented to represent it. Improve this page. Nothing was overwritten.`,
			},
			evidence: [
				{
					sourceKind: 'search_console',
					url: page.page,
					excerpt: `Page total, not a single query: ${page.impressions} impressions, ${page.clicks} clicks, CTR ${((page.ctr ?? 0) * 100).toFixed(2)}%, position ${(page.position ?? 0).toFixed(1)}. Property ${input.siteUrl}. Retrieved ${input.retrievedAt}.`,
					observedAt: input.retrievedAt,
					metrics: { impressions: page.impressions!, clicks: page.clicks!, ctr: page.ctr!, position: page.position!, startDate: input.startDate, endDate: input.endDate, scope: 'page' },
				},
				...(ga4 ? [{ sourceKind: 'ga4', url: page.page, excerpt: ga4, observedAt: input.retrievedAt, metrics: null }] : []),
			],
			brandRelevance: 0.6,
			brandRationale: 'The page already exists. No new product capability was inferred from the URL.',
			businessRelevance: 0.7,
			businessRationale: 'Business relevance uses the Search Console page total. GA4, when present, is supporting behaviour only.',
		});
	}
	const seen = new Set(candidates.map((candidate) => candidate.title.toLowerCase()));
	for (const row of input.queries.filter((item) => item.impressions != null && item.clicks != null && item.ctr != null && item.position != null && item.impressions >= thresholds.recordImpressions && item.impressions < thresholds.meaningfulImpressions)) {
		if (candidates.length >= (input.limit ?? 20) || seen.has(row.query.toLowerCase())) continue;
		if (brandOnly(row.query, input.brandTerms)) continue;
		seen.add(row.query.toLowerCase());
		candidates.push({
			title: row.query,
			audienceProblem: `Search Console recorded a long-tail query with ${row.impressions} impressions. That is not enough to start production.`,
			searchIntent: 'informational',
			demandClass: 'observed',
			discoverySource: 'search_console',
			naturalKey: `search_console:${row.query.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()}`,
			forcedOverlap: {
				decision: 'research',
				overlap: 0,
				matchedArticleId: null,
				matchedTitle: null,
				rationale: `${row.impressions} impressions are real, but below ${thresholds.meaningfulImpressions}. Low volume does not make the query false, and it does not justify an article yet.`,
			},
			evidence: [{
				sourceKind: 'search_console',
				url: null,
				excerpt: `Long-tail query total: ${row.impressions} impressions, ${row.clicks} clicks, position ${row.position}. This is not a page total.`,
				observedAt: input.retrievedAt,
				metrics: { impressions: row.impressions!, clicks: row.clicks!, ctr: row.ctr!, position: row.position!, startDate: input.startDate, endDate: input.endDate, scope: 'query' },
			}],
			brandRelevance: 0.4,
			brandRationale: 'No verified capability was inferred from this long-tail query.',
			businessRelevance: 0.3,
			businessRationale: 'The query is kept because it was observed. It is not treated as enough demand to produce.',
		});
	}
	return candidates;
}
