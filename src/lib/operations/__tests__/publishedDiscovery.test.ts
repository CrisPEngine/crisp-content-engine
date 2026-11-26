import { describe, expect, it, vi } from 'vitest';
import { inspectSearchConsoleUrl } from '@/lib/campaigns/searchConsole';
import { submitIndexNow } from '@/lib/operations/indexNow';
import { discoveryFromFetch, sitemapContains, verifyPublishedUrl } from '@/lib/operations/publishedDiscovery';

describe('post-publication discovery', () => {
	it('reads sitemap presence and lastmod without calling that indexing', () => {
		const xml = '<urlset><url><loc>https://folian.app/articles/example/</loc><lastmod>2026-11-26</lastmod></url></urlset>';
		expect(sitemapContains(xml, 'https://folian.app/articles/example').present).toBe(true);
		const result = discoveryFromFetch({
			url: 'https://folian.app/articles/example',
			httpStatus: 200,
			html: '<link rel="canonical" href="https://folian.app/articles/example">',
			robotsTxt: 'User-agent: *\nAllow: /',
			sitemapXml: xml,
			searchConsoleCoverage: 'unknown',
			indexNowSubmitted: true,
			indexNowStatus: 200,
		});
		expect(result.discovery).toBe('discoverable');
		expect(result.indexing).toBe('not_confirmed');
		expect(result.notes.some((note) => note.includes('IndexNow'))).toBe(true);
	});

	it('records a Search Console indexed verdict and a quota failure separately', async () => {
		const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
			inspectionResult: { indexStatusResult: { coverageState: 'Submitted and indexed', verdict: 'PASS', lastCrawlTime: '2026-11-26T00:00:00Z' } },
		}), { status: 200 }));
		const indexed = await inspectSearchConsoleUrl({
			siteUrl: 'https://folian.app/',
			inspectionUrl: 'https://folian.app/articles/example',
			accessToken: 'token',
			fetchImpl: fetchImpl as unknown as typeof fetch,
		});
		expect(indexed.indexing).toBe('indexed');
		const calls = fetchImpl.mock.calls as unknown as Array<[string]>;
		expect(String(calls[0]?.[0])).toBe('https://searchconsole.googleapis.com/v1/urlInspection/index:inspect');
		const limited = inspectSearchConsoleUrl({
			siteUrl: 'https://folian.app/',
			inspectionUrl: 'https://folian.app/articles/example',
			accessToken: 'token',
			fetchImpl: (async () => new Response('{}', { status: 429 })) as typeof fetch,
		});
		await expect(limited).rejects.toThrow(/quota/i);
	});

	it('does not treat a missing IndexNow key as a successful submission', async () => {
		const skipped = await submitIndexNow({ host: 'folian.app', key: '', urls: ['https://folian.app/articles/example'] });
		expect(skipped.submitted).toBe(false);
		const sent = await submitIndexNow({
			host: 'folian.app',
			key: 'abc123',
			urls: ['https://folian.app/articles/example'],
			fetchImpl: (async () => new Response('', { status: 200 })) as typeof fetch,
		});
		expect(sent.submitted).toBe(true);
		expect(sent.status).toBe(200);
	});

	it('checks a live URL without treating a sitemap hit or a missing IndexNow key as indexing', async () => {
		const html = '<link rel="canonical" href="https://folian.app/articles/example">';
		const fetchImpl = (async (input: RequestInfo | URL) => {
			const address = String(input);
			if (address.endsWith('/robots.txt')) return new Response('User-agent: *\nAllow: /', { status: 200 });
			if (address.endsWith('/sitemap.xml')) return new Response('<urlset><url><loc>https://folian.app/articles/example</loc></url></urlset>', { status: 200 });
			return new Response(html, { status: 200 });
		}) as typeof fetch;
		const result = await verifyPublishedUrl('https://folian.app/articles/example', { fetchImpl, indexNowKey: '' });
		expect(result.publication).toBe('published');
		expect(result.discovery).toBe('discoverable');
		expect(result.indexing).toBe('not_confirmed');
		expect(result.indexNowSubmitted).toBe(false);
		expect(result.notes.some((note) => note.includes('IndexNow is not configured'))).toBe(true);
	});
});
