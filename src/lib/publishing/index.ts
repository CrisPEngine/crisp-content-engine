import type { ArticlePublishRequest, ArticlePublishResult, ArticlePublisher } from './types';
import { webhookArticlePublisher } from './webhook';

const defaultPublishers: Record<string, ArticlePublisher> = {
	webhook: webhookArticlePublisher,
	blog: webhookArticlePublisher,
	newsletter: webhookArticlePublisher,
	article: webhookArticlePublisher,
};

/**
 * Destinations a future adapter can register without changing Article or the agent actions.
 * Only webhook, blog, newsletter, and article are connected today.
 */
export const PLANNED_ARTICLE_DESTINATIONS = [
	'folian',
	'crisp-digital',
	'framer',
	'webflow',
	'wordpress',
	'payload',
	'next',
	'authority',
] as const;

const publishers: Record<string, ArticlePublisher> = { ...defaultPublishers };

export function registerArticlePublisher(destination: string, publisher: ArticlePublisher): void {
	publishers[destination.toLowerCase()] = publisher;
}

export function resetArticlePublishers(): void {
	for (const key of Object.keys(publishers)) delete publishers[key];
	Object.assign(publishers, defaultPublishers);
}

export function getArticlePublisher(destination: string): ArticlePublisher | null {
	return publishers[destination.toLowerCase()] ?? null;
}

export async function publishArticle(request: ArticlePublishRequest): Promise<ArticlePublishResult> {
	const destination = request.destination.toLowerCase();
	let publisher = publishers[destination];
	if (!publisher && destination === 'linkedin') {
		const { linkedinArticlePublisher } = await import('./linkedin');
		publisher = linkedinArticlePublisher;
	}
	if (!publisher) {
		return {
			ok: false,
			destination: request.destination,
			error: `No article publisher registered for "${request.destination}"`,
		};
	}
	return publisher.publish(request);
}

export function destinationForChannel(channel: string, contentType?: string): string {
	const normalised = channel.toLowerCase();
	if (normalised === 'linkedin') return 'linkedin';
	if (normalised === 'blog' || contentType === 'article' || normalised === 'newsletter') return 'webhook';
	return normalised;
}
