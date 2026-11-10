import type { ArticleRecord } from './types';

export type PublicSource = {
	title: string;
	url: string;
	publisher: string;
	accessedAt?: string;
};

function canonical(raw: string): string | null {
	try {
		const url = new URL(raw);
		if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
		url.hash = '';
		if (url.pathname.endsWith('/') && url.pathname !== '/') url.pathname = url.pathname.slice(0, -1);
		return url.toString();
	} catch {
		return null;
	}
}

const DENIED = [/wikipedia\.org\/wiki\/chris_folayan/i, /chrisfolayan\.com/i, /instagram\.com/i, /folian\.app\/pricing/i, /^https:\/\/folian\.app\/?$/i];

/** Sources that may appear on the public article. Research packets stay in CCE. */
export function sourcesForPublication(article: ArticleRecord): PublicSource[] {
	const research = article.workspace?.research;
	const sources = research?.sources ?? [];
	const items = research?.items ?? [];
	const cited = new Set(items.filter((item) => !item.excluded && item.supported !== false).flatMap((item) => item.sourceIds));
	const topic = `${article.topic} ${article.seo.primaryKeyword ?? ''} ${article.title}`.toLowerCase();
	const seen = new Set<string>();
	const published: PublicSource[] = [];
	for (const source of sources) {
		if (source.excluded) continue;
		const url = canonical(source.url);
		if (!url || seen.has(url) || DENIED.some((pattern) => pattern.test(url))) continue;
		const onTopic = /novel|writ|draft|fiction|outline|story/.test(`${source.title} ${source.domain}`.toLowerCase()) || topic.split(/\W+/).filter((token) => token.length > 4).some((token) => source.title.toLowerCase().includes(token));
		if (!cited.has(source.id) && !onTopic) continue;
		if (/competitor landscape/i.test(source.title)) continue;
		seen.add(url);
		published.push({
			title: source.title.trim() || source.domain,
			url,
			publisher: source.domain,
			accessedAt: source.retrievedAt ?? undefined,
		});
	}
	return published;
}
