import type { ArticlePublishRequest, ArticlePublishResult, ArticlePublisher } from './types';

function allowedWebhookUrl(url: string): boolean {
	const allow = (process.env.ARTICLE_PUBLISH_WEBHOOK_ALLOWLIST || process.env.ARTICLE_PUBLISH_WEBHOOK_URL || '')
		.split(',')
		.map((part) => part.trim())
		.filter(Boolean);
	if (allow.length === 0) return false;
	return allow.some((allowed) => url === allowed || url.startsWith(allowed));
}

export const webhookArticlePublisher: ArticlePublisher = {
	id: 'webhook',

	async publish(request): Promise<ArticlePublishResult> {
		const url =
			(typeof request.document.metadata?.webhookUrl === 'string' && request.document.metadata.webhookUrl) ||
			process.env.ARTICLE_PUBLISH_WEBHOOK_URL;
		if (!url) {
			return { ok: false, destination: 'webhook', error: 'ARTICLE_PUBLISH_WEBHOOK_URL is not configured' };
		}
		if (!allowedWebhookUrl(url)) {
			return { ok: false, destination: 'webhook', error: 'Webhook URL is not allowlisted' };
		}

		const secret = process.env.ARTICLE_PUBLISH_WEBHOOK_SECRET || process.env.MAKE_SHARED_SECRET;
		const response = await fetch(url, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				...(secret ? { 'x-cce-publish-secret': secret } : {}),
			},
			body: JSON.stringify({
				destination: 'article',
				document: request.document,
				memoryId: request.memoryId,
				airtableBrandId: request.airtableBrandId,
				idempotencyKey: request.idempotencyKey,
			}),
		});

		if (!response.ok) {
			return { ok: false, destination: 'webhook', error: `Webhook ${response.status}` };
		}

		const payload = (await response.json().catch(() => ({}))) as { id?: string; url?: string };
		return {
			ok: true,
			destination: 'webhook',
			externalId: payload.id,
			url: payload.url,
		};
	},
};
