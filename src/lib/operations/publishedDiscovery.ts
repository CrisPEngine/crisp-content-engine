import { googleAuthMode } from '@/lib/campaigns/googleAuth';
import { inspectSearchConsoleUrl } from '@/lib/campaigns/searchConsole';
import { assessPublishedPage, type DiscoveryAssessment } from './discovery';
import { submitIndexNow } from './indexNow';

export type PublishedDiscovery = DiscoveryAssessment & {
	url: string;
	checkedAt: string;
	indexNowSubmitted: boolean;
	indexNowStatus: number | null;
	searchConsoleCoverage: string | null;
};

export function sitemapContains(xml: string, url: string): { present: boolean; lastmod: string | null } {
	const target = url.replace(/\/$/, '');
	const blocks = xml.split(/<url\b/i).slice(1);
	for (const block of blocks) {
		const loc = /<loc>\s*([^<]+)\s*<\/loc>/i.exec(block)?.[1]?.trim().replace(/\/$/, '');
		if (loc !== target) continue;
		const lastmod = /<lastmod>\s*([^<]+)\s*<\/lastmod>/i.exec(block)?.[1]?.trim() ?? null;
		return { present: true, lastmod };
	}
	return { present: false, lastmod: null };
}

export function canonicalFromHtml(html: string): string | null {
	const match = /<link[^>]+rel=["']canonical["'][^>]*>/i.exec(html);
	const href = match ? /href=["']([^"']+)["']/i.exec(match[0]) : null;
	return href?.[1]?.trim() ?? null;
}

export function robotsMetaFromHtml(html: string): string | null {
	const match = /<meta[^>]+name=["']robots["'][^>]*>/i.exec(html);
	const content = match ? /content=["']([^"']+)["']/i.exec(match[0]) : null;
	return content?.[1]?.trim() ?? null;
}

export function discoveryFromFetch(input: {
	url: string;
	httpStatus: number | null;
	html: string;
	robotsTxt: string | null;
	sitemapXml: string | null;
	searchConsoleCoverage: 'submitted_and_indexed' | 'not_indexed' | 'unknown' | null;
	indexNowSubmitted: boolean;
	indexNowStatus: number | null;
}): PublishedDiscovery {
	const sitemap = input.sitemapXml ? sitemapContains(input.sitemapXml, input.url) : { present: false, lastmod: null };
	const assessment = assessPublishedPage({
		httpStatus: input.httpStatus,
		finalUrl: input.httpStatus === 200 ? input.url : null,
		expectedCanonical: input.url,
		canonical: canonicalFromHtml(input.html),
		robotsMeta: robotsMetaFromHtml(input.html),
		xRobotsTag: null,
		robotsTxtAllows: input.robotsTxt == null ? null : !/disallow:\s*\/\s*$/im.test(input.robotsTxt),
		inSitemap: input.sitemapXml == null ? null : sitemap.present,
		sitemapLastmod: sitemap.lastmod,
		searchConsoleCoverage: input.searchConsoleCoverage,
	});
	if (input.indexNowSubmitted) assessment.notes.push('IndexNow accepted the URL. That is not confirmation that a search engine has indexed it.');
	return {
		...assessment,
		url: input.url,
		checkedAt: new Date().toISOString(),
		indexNowSubmitted: input.indexNowSubmitted,
		indexNowStatus: input.indexNowStatus,
		searchConsoleCoverage: input.searchConsoleCoverage,
	};
}

export async function verifyPublishedUrl(url: string, options?: {
	fetchImpl?: typeof fetch;
	siteUrl?: string | null;
	accessToken?: string | null;
	indexNowKey?: string | null;
}): Promise<PublishedDiscovery> {
	const fetchImpl = options?.fetchImpl ?? fetch;
	const target = new URL(url);
	const page = await fetchImpl(url).then(async (response) => ({ status: response.status, html: response.ok ? await response.text() : '' })).catch(() => ({ status: null as number | null, html: '' }));
	const robots = await fetchImpl(new URL('/robots.txt', target).toString()).then((response) => response.ok ? response.text() : null).catch(() => null);
	const sitemap = await fetchImpl(new URL('/sitemap.xml', target).toString()).then((response) => response.ok ? response.text() : null).catch(() => null);
	let coverage: 'submitted_and_indexed' | 'not_indexed' | 'unknown' | null = null;
	const token = options?.accessToken?.trim();
	const siteUrl = options?.siteUrl?.trim();
	if (token && siteUrl) {
		try {
			const inspection = await inspectSearchConsoleUrl({ inspectionUrl: url, siteUrl, accessToken: token, fetchImpl });
			coverage = inspection.indexing === 'indexed' ? 'submitted_and_indexed' : 'not_indexed';
		} catch (error) {
			coverage = 'unknown';
			const message = error instanceof Error ? error.message : 'Search Console inspection failed.';
			if (/quota/i.test(message)) coverage = 'unknown';
		}
	}
	const receipt = await submitIndexNow({ host: target.host, key: options?.indexNowKey, urls: [url], fetchImpl });
	const result = discoveryFromFetch({
		url,
		httpStatus: page.status,
		html: page.html,
		robotsTxt: robots,
		sitemapXml: sitemap,
		searchConsoleCoverage: coverage,
		indexNowSubmitted: receipt.submitted,
		indexNowStatus: receipt.status,
	});
	if (!token || !siteUrl) result.notes.push(googleAuthMode(process.env) === 'none' ? 'Google Search Console inspection is not configured.' : 'Search Console inspection was skipped because this brand has no property URL.');
	if (!receipt.submitted && receipt.error) result.notes.push(receipt.error);
	return result;
}
