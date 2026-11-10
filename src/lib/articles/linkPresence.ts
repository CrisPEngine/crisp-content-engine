import type { DestinationTool } from '@/lib/publishing/destinationTaxonomy';

/** Extract http(s) URLs and markdown link targets from article body. */
export function extractBodyUrls(body: string): string[] {
	const found = new Set<string>();
	for (const match of body.matchAll(/\[[^\]]*\]\((https?:\/\/[^)\s]+)\)/gi)) {
		found.add(match[1]);
	}
	for (const match of body.matchAll(/https?:\/\/[^\s)\]>"']+/gi)) {
		found.add(match[0].replace(/[.,;:!?)]+$/, ''));
	}
	return [...found];
}

function normaliseUrl(value: string): string {
	try {
		const url = new URL(value);
		url.hash = '';
		url.search = '';
		return `${url.origin}${url.pathname}`.replace(/\/+$/, '').toLowerCase();
	} catch {
		return value.trim().toLowerCase().replace(/\/+$/, '');
	}
}

/** True when the body already links to this destination tool via absolute or relative path. */
export function bodyLinksDestinationTool(body: string, tool: Pick<DestinationTool, 'slug' | 'label' | 'routePath'>): boolean {
	const urls = extractBodyUrls(body).map(normaliseUrl);
	const path = (tool.routePath || '').trim();
	const slug = tool.slug.trim();
	const candidates = new Set<string>();
	if (path) {
		candidates.add(path.toLowerCase());
		candidates.add(path.replace(/\/+$/, '').toLowerCase());
		candidates.add(path.replace(/^\//, '').toLowerCase());
	}
	if (slug) {
		candidates.add(slug.toLowerCase());
		candidates.add(`/tools/${slug}`.toLowerCase());
		candidates.add(`tools/${slug}`.toLowerCase());
	}
	for (const url of urls) {
		for (const candidate of candidates) {
			if (!candidate) continue;
			if (url.includes(candidate) || url.endsWith(candidate)) return true;
		}
	}
	// Relative markdown links without host
	const lower = body.toLowerCase();
	if (path && lower.includes(`](${path.toLowerCase()}`)) return true;
	if (path && lower.includes(`](${path.replace(/^\//, '').toLowerCase()}`)) return true;
	if (slug && /word[\s-]?count[\s-]?planner/i.test(tool.label) && /folian\.app\/tools\/word-count-planner/i.test(body)) return true;
	return false;
}

export function linkedToolSlugsFromBody(body: string, tools: Array<Pick<DestinationTool, 'slug' | 'label' | 'routePath'>>): string[] {
	return tools.filter((tool) => bodyLinksDestinationTool(body, tool)).map((tool) => tool.slug);
}
