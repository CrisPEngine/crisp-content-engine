import type { ReviewSignal, TrendAssessment, TrendState } from './types';

export function summariseReviews(reviews: ReviewSignal[]): { summary: string; praise: string[]; complaints: string[]; caveat: string } {
	const praise = reviews.filter((review) => review.sentiment === 'positive').map((review) => review.excerpt);
	const complaints = reviews.filter((review) => review.sentiment === 'negative').map((review) => review.excerpt);
	const caveat =
		reviews.length < 5
			? `Sample size is ${reviews.length}. This is not a market conclusion.`
			: `Based on ${reviews.length} attributed reviews. Still not a product fact.`;
	const summary = reviews.length === 0 ? 'No attributable public reviews were stored.' : `${reviews.length} attributed review signals. ${caveat}`;
	return { summary, praise: praise.slice(0, 5), complaints: complaints.slice(0, 5), caveat };
}

export function assessTrend(input: { domains: string[]; publishedWithinDays: number; declining?: boolean }): TrendAssessment {
	const domains = [...new Set(input.domains.filter(Boolean))];
	const sourceCount = input.domains.length;
	if (sourceCount < 2 || domains.length < 2) {
		return {
			state: 'INSUFFICIENT_EVIDENCE',
			confidence: 'insufficient',
			sourceCount,
			domainCount: domains.length,
			reason: 'One source, or one domain, is not a trend.',
		};
	}
	let state: TrendState = 'TREND_SIGNAL';
	let confidence: TrendAssessment['confidence'] = 'low';
	if (input.declining) {
		state = 'DECLINING';
		confidence = 'low';
	} else if (domains.length >= 4 && input.publishedWithinDays <= 30) {
		state = 'EMERGING';
		confidence = 'moderate';
	} else if (domains.length >= 6 && input.publishedWithinDays <= 90) {
		state = 'ESTABLISHED';
		confidence = 'moderate';
	}
	return {
		state,
		confidence,
		sourceCount,
		domainCount: domains.length,
		reason: `${domains.length} independent domains. Confidence stays moderate until the pattern repeats on a later run.`,
	};
}

export function pageTypeFromUrl(url: string): string {
	const path = new URL(url).pathname.toLowerCase();
	if (path === '/' || path === '') return 'home';
	if (/terms|privacy|cookie|legal|imprint/.test(path)) return 'legal';
	if (path.includes('pricing') || path.includes('plans')) return 'pricing';
	if (path.includes('about')) return 'about';
	if (path.includes('feature')) return 'features';
	if (path.includes('service')) return 'services';
	if (path.includes('faq')) return 'faq';
	if (path.includes('doc') || path.includes('help')) return 'docs';
	if (path.includes('blog') || path.includes('article') || path.includes('insight') || path.includes('news')) return 'blog';
	if (path.includes('case') || path.includes('customer')) return 'case_study';
	if (path.includes('testimonial') || path.includes('review')) return 'testimonials';
	if (path.includes('contact')) return 'contact';
	if (path.includes('product')) return 'product';
	return 'other';
}

const PAGE_PRIORITY = ['home', 'about', 'services', 'product', 'features', 'pricing', 'faq', 'case_study', 'docs', 'testimonials', 'blog', 'contact', 'other', 'legal'];

export function prioritisePages(urls: string[], limit: number): string[] {
	const unique = [...new Set(urls)];
	return unique
		.sort((a, b) => PAGE_PRIORITY.indexOf(pageTypeFromUrl(a)) - PAGE_PRIORITY.indexOf(pageTypeFromUrl(b)))
		.slice(0, limit);
}

export function extractVisibleText(html: string): { title?: string; text: string } {
	const title = html.match(/<title[^>]*>([^<]{1,180})<\/title>/i)?.[1]?.replace(/\s+/g, ' ').trim();
	const withoutScripts = html
		.replace(/<script[\s\S]*?<\/script>/gi, ' ')
		.replace(/<style[\s\S]*?<\/style>/gi, ' ')
		.replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ');
	const text = withoutScripts
		.replace(/<[^>]+>/g, ' ')
		.replace(/&amp;/g, '&')
		.replace(/&nbsp;/g, ' ')
		.replace(/\s+/g, ' ')
		.trim()
		.slice(0, 5000);
	return { title, text };
}

export function sentences(text: string): string[] {
	return text
		.split(/(?<=[.!?])\s+/)
		.map((item) => item.trim())
		.filter((item) => item.length >= 40 && item.length <= 320);
}

export function robotsAllows(robotsText: string, path: string, userAgent = 'CCEResearch'): boolean {
	const groups: Array<{ agents: string[]; disallow: string[] }> = [];
	let current: { agents: string[]; disallow: string[] } | null = null;
	for (const raw of robotsText.split(/\r?\n/)) {
		const line = raw.replace(/#.*$/, '').trim();
		if (!line) continue;
		const [key, ...rest] = line.split(':');
		const value = rest.join(':').trim();
		if (/^user-agent$/i.test(key)) {
			current = { agents: [value.toLowerCase()], disallow: [] };
			groups.push(current);
		} else if (/^disallow$/i.test(key) && current) {
			current.disallow.push(value);
		}
	}
	const agent = userAgent.toLowerCase();
	const specific = groups.filter((group) => group.agents.some((item) => item === agent || item === '*'));
	const applicable = specific.length ? specific : groups.filter((group) => group.agents.includes('*'));
	return !applicable.some((group) => group.disallow.some((rule) => rule && path.startsWith(rule)));
}

export function sitemapUrls(xml: string): string[] {
	return [...xml.matchAll(/<loc>\s*([^<]+)\s*<\/loc>/gi)].map((match) => match[1].trim()).filter((url) => url.startsWith('https://'));
}
