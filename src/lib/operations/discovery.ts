export type IndexingObservation = 'indexed' | 'not_confirmed';

export type DiscoveryAssessment = {
	publication: 'unpublished' | 'published';
	discovery: 'unverified' | 'discoverable' | 'blocked';
	indexing: IndexingObservation;
	notes: string[];
};

function robotsBlocks(value: string | null | undefined): boolean {
	const text = (value ?? '').toLowerCase();
	return text.includes('noindex') || text.includes('none');
}

/** Sitemap inclusion and a successful fetch are not indexing. Only a Search Console indexed verdict is. */
export function assessPublishedPage(input: {
	httpStatus: number | null;
	finalUrl: string | null;
	expectedCanonical: string | null;
	canonical: string | null;
	robotsMeta: string | null;
	xRobotsTag: string | null;
	robotsTxtAllows: boolean | null;
	inSitemap: boolean | null;
	sitemapLastmod: string | null;
	searchConsoleCoverage: 'submitted_and_indexed' | 'not_indexed' | 'unknown' | null;
}): DiscoveryAssessment {
	const notes: string[] = [];
	const published = input.httpStatus === 200 && Boolean(input.finalUrl);
	if (!published) notes.push(input.httpStatus == null ? 'The public URL was not fetched.' : `The public URL returned HTTP ${input.httpStatus}.`);
	const canonicalMatches = !input.expectedCanonical || !input.canonical || normalise(input.canonical) === normalise(input.expectedCanonical);
	if (published && !canonicalMatches) notes.push('The canonical URL does not match the expected article URL.');
	const blocked = robotsBlocks(input.robotsMeta) || robotsBlocks(input.xRobotsTag) || input.robotsTxtAllows === false;
	if (blocked) notes.push('A robots directive blocks indexing.');
	if (input.inSitemap === false) notes.push('The article URL is not in the sitemap.');
	if (input.inSitemap && input.sitemapLastmod) notes.push(`The sitemap lists this URL with lastmod ${input.sitemapLastmod}. That does not mean it is indexed.`);
	if (input.inSitemap && !input.sitemapLastmod) notes.push('The sitemap lists this URL without a lastmod value.');
	const indexing: IndexingObservation = input.searchConsoleCoverage === 'submitted_and_indexed' ? 'indexed' : 'not_confirmed';
	if (indexing === 'not_confirmed') notes.push('Search Console has not confirmed that this URL is indexed.');
	const discovery = !published ? 'unverified' : blocked || !canonicalMatches ? 'blocked' : 'discoverable';
	return {
		publication: published ? 'published' : 'unpublished',
		discovery,
		indexing,
		notes,
	};
}

function normalise(url: string): string {
	try {
		const parsed = new URL(url);
		parsed.hash = '';
		return parsed.toString().replace(/\/$/, '');
	} catch {
		return url.trim().replace(/\/$/, '');
	}
}
