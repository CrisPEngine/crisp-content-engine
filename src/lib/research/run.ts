import { RESEARCH_LIMITS, assertPublicHttpUrl, classifySource, contentFingerprint, freshUntil, knowledgeClassFor, sourceDomain, staleness, withinBudget } from './policy';
import { extractVisibleText, pageTypeFromUrl, prioritisePages, robotsAllows, sentences, sitemapUrls, summariseReviews, assessTrend } from './parse';
import { findContradictions, proposeBrandUpdate } from './governance';
import type { SearchHit, SearchProvider } from './search';
import type { ResearchClaim, ResearchFinding, ResearchPacket, ResearchProjectType, ResearchSource } from './types';

export type FetchedPage = {
	url: string;
	status: number;
	contentType: string;
	body: string;
	finalUrl: string;
};

export type PageFetcher = (url: string) => Promise<FetchedPage>;

const USER_AGENT = 'CCEResearch/1.0 (+https://app.crispdigital.io)';
const MAX_BYTES = 500_000;

export function createSafePageFetcher(fetchImpl: typeof fetch = fetch, options?: { allowHttp?: boolean }): PageFetcher {
	return async function fetchPage(target) {
		let current = assertPublicHttpUrl(target, options);
		let redirects = 0;
		while (redirects <= 3) {
			const response = await fetchImpl(current, {
				redirect: 'manual',
				headers: { Accept: 'text/html,application/xhtml+xml,text/plain', 'User-Agent': USER_AGENT },
			});
			if (response.status >= 300 && response.status < 400) {
				const location = response.headers.get('location');
				if (!location) throw new Error('redirect_missing_location');
				current = assertPublicHttpUrl(new URL(location, current).toString(), options);
				redirects += 1;
				continue;
			}
			const contentType = response.headers.get('content-type') ?? '';
			if (!/text\/html|text\/plain|application\/xhtml|xml|application\/json/i.test(contentType) && response.ok) {
				throw new Error('unsupported_content_type');
			}
			const buffer = await response.arrayBuffer();
			if (buffer.byteLength > MAX_BYTES) throw new Error('response_too_large');
			return {
				url: target,
				status: response.status,
				contentType,
				body: new TextDecoder().decode(buffer),
				finalUrl: current.toString(),
			};
		}
		throw new Error('too_many_redirects');
	};
}

function claimFromSentence(text: string, source: ResearchSource, index: number): ResearchClaim {
	const knowledgeClass = source.sourceClass === 'FIRST_PARTY' ? 'FIRST_PARTY_CLAIM' : knowledgeClassFor(source.sourceClass);
	const kind = /\$\s?\d/.test(text) ? 'pricing' : source.sourceClass === 'MAJOR_NEWS' ? 'news' : 'general';
	const until = freshUntil(kind === 'pricing' || kind === 'news' ? kind : 'general');
	return {
		id: `${source.id}-claim-${index}`,
		text,
		knowledgeClass,
		confidence: 'low',
		sourceIds: [source.id],
		state: 'OBSERVED',
		freshUntil: until,
		staleness: staleness(until),
	};
}

export async function discoverOwnedSite(input: {
	website: string;
	fetchPage: PageFetcher;
	previousFingerprints?: Record<string, string>;
}): Promise<{ sources: ResearchSource[]; claims: ResearchClaim[]; gaps: string[]; pagesFetched: number }> {
	const origin = assertPublicHttpUrl(input.website);
	const domain = sourceDomain(origin.toString());
	const sources: ResearchSource[] = [];
	const claims: ResearchClaim[] = [];
	const seenClaims = new Set<string>();
	let pagesFetched = 0;
	let robots = '';
	try {
		const robotsPage = await input.fetchPage(new URL('/robots.txt', origin).toString());
		pagesFetched += 1;
		robots = robotsPage.body;
	} catch {
		robots = '';
	}
	const candidates = [origin.toString()];
	if (robotsAllows(robots, '/sitemap.xml')) {
		try {
			const sitemap = await input.fetchPage(new URL('/sitemap.xml', origin).toString());
			pagesFetched += 1;
			candidates.push(...sitemapUrls(sitemap.body));
		} catch {
			/* A missing sitemap is a gap, not a failure. */
		}
	}
	const selected = prioritisePages(
		candidates.filter((url) => {
			try {
				const path = new URL(url).pathname;
				return sourceDomain(url) === domain && robotsAllows(robots, path);
			} catch {
				return false;
			}
		}),
		RESEARCH_LIMITS.maxPagesPerRun - pagesFetched,
	);
	for (const url of selected) {
		if (!withinBudget(0, pagesFetched + 1)) break;
		let page: FetchedPage;
		try {
			page = await input.fetchPage(url);
			pagesFetched += 1;
		} catch (error) {
			sources.push({
				id: `rejected-${sources.length + 1}`,
				url,
				domain,
				retrievedAt: new Date().toISOString(),
				sourceClass: 'FIRST_PARTY',
				rejected: true,
				rejectReason: error instanceof Error ? error.message : 'fetch_failed',
			});
			continue;
		}
		if (page.status >= 400) continue;
		const visible = extractVisibleText(page.body);
		const fingerprint = contentFingerprint(visible.text);
		const unchanged = input.previousFingerprints?.[url] === fingerprint;
		const source: ResearchSource = {
			id: `source-${sources.length + 1}`,
			url: page.finalUrl,
			domain,
			title: visible.title,
			publisher: domain,
			retrievedAt: new Date().toISOString(),
			verifiedAt: new Date().toISOString(),
			sourceClass: 'FIRST_PARTY',
			pageType: pageTypeFromUrl(page.finalUrl),
			excerpt: visible.text.slice(0, RESEARCH_LIMITS.maxExcerptChars),
			summary: sentences(visible.text)[0],
			fingerprint,
		};
		sources.push(source);
		if (unchanged) continue;
		sentences(visible.text)
			.slice(0, 3)
			.forEach((sentence, index) => {
				const key = sentence.toLowerCase();
				if (seenClaims.has(key)) return;
				seenClaims.add(key);
				claims.push(claimFromSentence(sentence, source, index + 1));
			});
	}
	const readable = sources.filter((source) => !source.rejected);
	const gaps: string[] = [];
	if (!readable.some((source) => source.pageType === 'pricing')) gaps.push('No public pricing page was fetched.');
	if (readable.length === 0) gaps.push('No owned page could be read.');
	return { sources: sources.slice(0, RESEARCH_LIMITS.maxSourcesStored), claims, gaps, pagesFetched };
}

export async function runResearch(input: {
	brandName: string;
	website?: string;
	query: string;
	projectType: ResearchProjectType;
	brandFacts?: string[];
	ownedDomain?: string;
	fetchPage?: PageFetcher;
	search?: SearchProvider;
	now?: number;
}): Promise<ResearchPacket> {
	const started = input.now ?? Date.now();
	const search = input.search;
	const fetchPage = input.fetchPage ?? createSafePageFetcher();
	const sources: ResearchSource[] = [];
	const claims: ResearchClaim[] = [];
	const gaps: string[] = [];
	let searches = 0;
	let pagesFetched = 0;
	const owned = input.ownedDomain ?? (input.website ? sourceDomain(input.website) : undefined);

	if (input.website && (input.projectType === 'BRAND_DISCOVERY' || input.projectType === 'WEBSITE_DISCOVERY' || input.projectType === 'CURRENT_RESEARCH')) {
		const site = await discoverOwnedSite({ website: input.website, fetchPage });
		sources.push(...site.sources);
		claims.push(...site.claims);
		gaps.push(...site.gaps);
		pagesFetched += site.pagesFetched;
	}

	const externalTypes: ResearchProjectType[] = ['BRAND_DISCOVERY', 'COMPETITOR_RESEARCH', 'REVIEW_RESEARCH', 'TREND_RESEARCH', 'CURRENT_RESEARCH', 'NEWS_MONITORING', 'MARKET_RESEARCH', 'ARTICLE_RESEARCH', 'CLAIM_VERIFICATION'];
	if (externalTypes.includes(input.projectType)) {
		if (!search?.configured) {
			gaps.push('External search is not configured. Owned-site evidence is included. Third-party discovery did not run.');
		} else if (withinBudget(searches + 1, pagesFetched)) {
			searches += 1;
			try {
				const hits = await search.search(`${input.brandName} ${input.query}`.trim(), 6);
				for (const hit of hits) {
					if (sources.length >= RESEARCH_LIMITS.maxSourcesStored) break;
					if (sources.some((source) => source.url === hit.url)) continue;
					let sourceClass = classifySource(hit.url, owned);
					if (input.projectType === 'COMPETITOR_RESEARCH') sourceClass = sourceClass === 'FIRST_PARTY' ? sourceClass : 'UNKNOWN';
					const source: ResearchSource = {
						id: `source-${sources.length + 1}`,
						url: hit.url,
						domain: sourceDomain(hit.url),
						title: hit.title,
						publisher: sourceDomain(hit.url),
						publishedAt: hit.publishedAt,
						retrievedAt: new Date(started).toISOString(),
						sourceClass,
						excerpt: hit.snippet?.slice(0, RESEARCH_LIMITS.maxExcerptChars),
						summary: hit.snippet?.slice(0, 240),
					};
					sources.push(source);
					if (hit.snippet) claims.push(claimFromSentence(hit.snippet, source, 1));
				}
			} catch (error) {
				gaps.push(error instanceof Error ? error.message : 'search_failed');
			}
		}
	}

	const findings: ResearchFinding[] = claims.map((claim) => ({
		id: `finding-${claim.id}`,
		text: claim.text,
		knowledgeClass: claim.knowledgeClass,
		state: claim.state,
		sourceIds: claim.sourceIds,
		sentiment: input.projectType === 'REVIEW_RESEARCH' ? sentimentOf(claim.text) : undefined,
	}));
	const reviews = input.projectType === 'REVIEW_RESEARCH'
		? findings.map((finding) => ({
			sourceId: finding.sourceIds[0] ?? finding.id,
			excerpt: finding.text,
			sentiment: finding.sentiment ?? 'neutral',
			topics: [],
		}))
		: [];
	const review = summariseReviews(reviews);
	if (input.projectType === 'REVIEW_RESEARCH') gaps.push(review.caveat);
	const competitors = input.projectType === 'COMPETITOR_RESEARCH'
		? sources
			.filter((source) => source.sourceClass !== 'FIRST_PARTY' && !source.rejected)
			.map((source) => ({
				name: source.title || source.domain,
				website: source.url,
				relation: 'UNCLASSIFIED' as const,
				claims: claims.filter((claim) => claim.sourceIds.includes(source.id)).map((claim) => claim.text),
				sourceIds: [source.id],
				lastResearchedAt: new Date(started).toISOString(),
			}))
		: [];
	const trend = input.projectType === 'TREND_RESEARCH'
		? assessTrend({ domains: sources.filter((source) => !source.rejected).map((source) => source.domain), publishedWithinDays: 30 })
		: undefined;
	const contradictions = findContradictions(input.brandFacts ?? [], claims.map((claim) => ({ text: claim.text, sourceId: claim.sourceIds[0] ?? claim.id })));
	const proposals = claims.map((claim) => proposeBrandUpdate(claim)).filter((item): item is NonNullable<typeof item> => Boolean(item));
	if (claims.length === 0) gaps.push('No attributable claims were extracted.');

	return {
		projectType: input.projectType,
		decision: input.projectType === 'CURRENT_RESEARCH' ? 'QUICK_VERIFY' : 'FULL_RESEARCH',
		query: input.query,
		sources,
		claims,
		findings,
		entities: [input.brandName].filter(Boolean),
		topics: [input.query].filter(Boolean),
		contradictions,
		proposals,
		competitors,
		reviews,
		reviewSummary: input.projectType === 'REVIEW_RESEARCH' ? review.summary : undefined,
		trend,
		gaps: [...new Set(gaps)],
		usage: {
			searches,
			pagesFetched,
			estimatedSearchUsd: Math.round(searches * RESEARCH_LIMITS.searchUsd * 1000) / 1000,
			durationMs: Date.now() - started,
			provider: search?.configured ? search.name : 'owned-site-only',
		},
		promotedToBrandBrain: false,
	};
}

function sentimentOf(text: string): 'positive' | 'negative' | 'mixed' | 'neutral' {
	const negative = /\b(bad|terrible|broken|hate|disappoint|bug|slow|expensive)\b/i.test(text);
	const positive = /\b(love|great|excellent|helpful|easy|recommend)\b/i.test(text);
	if (negative && positive) return 'mixed';
	if (negative) return 'negative';
	if (positive) return 'positive';
	return 'neutral';
}

export function packetContext(packet: ResearchPacket): string {
	const lines = [
		'RESEARCH PACKET. Use this as dated evidence. Do not treat it as Brand Brain truth. Do not invent citations.',
		`Query: ${packet.query}`,
		`Retrieved with ${packet.usage.provider}. Searches: ${packet.usage.searches}. Pages: ${packet.usage.pagesFetched}.`,
	];
	for (const claim of packet.claims.slice(0, 8)) {
		const source = packet.sources.find((item) => item.id === claim.sourceIds[0]);
		lines.push(`CLAIM (${claim.knowledgeClass}, ${claim.staleness}): ${claim.text}`);
		if (source?.url) lines.push(`SOURCE: ${source.url} retrieved ${source.retrievedAt}`);
	}
	for (const gap of packet.gaps) lines.push(`GAP: ${gap}`);
	for (const item of packet.contradictions) lines.push(`CONTRADICTION: ${item.evidenceA} <> ${item.evidenceB}`);
	return lines.join('\n');
}

export type { SearchHit };
