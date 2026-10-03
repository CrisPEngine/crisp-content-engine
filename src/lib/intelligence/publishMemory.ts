import { destinationForChannel, publishArticle } from '@/lib/publishing';
import type { IntelligenceStore } from './store';
import type { ContentMemoryRecord } from './types';

export async function publishStoredMemory(
	store: IntelligenceStore,
	userId: string,
	memory: ContentMemoryRecord,
) {
	const brain = await store.getBrandBrainById(userId, memory.brandBrainId);
	if (!brain) throw new Error('Brand brain not found');

	const destination = destinationForChannel(String(memory.channel), memory.contentType);
	const result = await publishArticle({
		destination,
		userId,
		airtableBrandId: brain.airtableBrandId,
		memoryId: memory.id,
		idempotencyKey: memory.id,
		document: {
			title: memory.hook,
			body: memory.body || '',
			metadata: memory.metadata,
		},
	});

	if (!result.ok) {
		await store.saveMemory(userId, {
			...memory,
			publicationStatus: 'failed',
			metadata: { ...memory.metadata, lastPublishError: result.error },
		});
		throw new Error(result.error || 'Publish failed');
	}

	const updated = await store.saveMemory(userId, {
		...memory,
		publicationStatus: 'published',
		publicationDate: new Date().toISOString(),
		destination: result.url || destination,
		externalPostId: result.externalId,
		externalUrl: result.url,
		metadata: {
			...memory.metadata,
			linkedin_post_id: destination === 'linkedin' ? result.externalId : memory.metadata?.linkedin_post_id,
		},
	});

	return { destination, externalId: result.externalId, url: result.url, memory: updated };
}
