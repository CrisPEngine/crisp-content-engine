import 'server-only';

import { getLinkedInConnectionByBrand, publishToLinkedIn } from '@/lib/linkedin/publish';
import type { ArticlePublishResult, ArticlePublisher } from './types';

function isConnectionError(value: unknown): value is { error: string } {
	return Boolean(value && typeof value === 'object' && 'error' in value);
}

export const linkedinArticlePublisher: ArticlePublisher = {
	id: 'linkedin',

	async publish(request): Promise<ArticlePublishResult> {
		if (!request.airtableBrandId) {
			return { ok: false, destination: 'linkedin', error: 'airtableBrandId is required for LinkedIn publish' };
		}

		const connection = await getLinkedInConnectionByBrand(request.airtableBrandId);
		if (!connection) {
			return { ok: false, destination: 'linkedin', error: 'No LinkedIn connection for this brand' };
		}
		if (isConnectionError(connection)) {
			return { ok: false, destination: 'linkedin', error: connection.error };
		}

		const result = await publishToLinkedIn(
			connection.accessToken,
			connection.personUrn,
			{
				title: request.document.title,
				body: request.document.body,
				imageUrl: request.document.imageUrl,
			},
			request.idempotencyKey || request.memoryId,
			connection.organizationUrn,
		);

		if (!result.success) {
			return { ok: false, destination: 'linkedin', error: result.error };
		}

		console.info('[publish:linkedin]', {
			memory_id: request.memoryId,
			brand: request.airtableBrandId,
			linkedin_post_id: result.linkedin_post_id,
		});

		return {
			ok: true,
			destination: 'linkedin',
			externalId: result.linkedin_post_id,
			url: result.published_url,
		};
	},
};
