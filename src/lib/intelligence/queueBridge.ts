import 'server-only';

import { IDEA_ENGINE_QUEUE_STATUS, buildContentQueueCoreFields } from '@/lib/idea-engine/airtable/contentQueueFields';
import type { IntelligenceStore } from './store';
import type { ContentMemoryRecord } from './types';

export type QueueBridgeResult = {
	airtableRecordId: string;
	idempotent: boolean;
	status: string;
	platform: string;
};

export async function confirmMemoryToContentQueue(options: {
	store: IntelligenceStore;
	userId: string;
	memory: ContentMemoryRecord;
	clientName?: string;
}): Promise<QueueBridgeResult> {
	if (options.memory.airtableContentId) {
		return {
			airtableRecordId: options.memory.airtableContentId,
			idempotent: true,
			status: IDEA_ENGINE_QUEUE_STATUS,
			platform: 'LinkedIn',
		};
	}

	const brain = await options.store.getBrandBrainById(options.userId, options.memory.brandBrainId);
	if (!brain) throw new Error('Brand brain not found');

	const token = process.env.AIRTABLE_PAT;
	const baseId = process.env.AIRTABLE_BASE_ID;
	const table = process.env.AIRTABLE_CONTENTQUEUE_TABLE;
	if (!token || !baseId || !table) throw new Error('Airtable ContentQueue is not configured');

	const platform = options.memory.channel.toLowerCase() === 'linkedin' ? 'LinkedIn' : options.memory.channel;
	const fields = buildContentQueueCoreFields({
		item: {
			channel: platform,
			post_title: options.memory.hook,
			hook: options.memory.hook,
			body_draft: options.memory.body || '',
		},
		brandProfileId: brain.airtableBrandId,
		clientName: options.clientName || brain.identity.name,
		airtableStatus: IDEA_ENGINE_QUEUE_STATUS,
	});
	fields.generated_from = 'intelligence';
	// ContentQueue client_name is a BrandProfiles link, not a display name.
	fields.client_name = [brain.airtableBrandId];
	fields.brand_profile_id = [brain.airtableBrandId];

	const response = await fetch(`https://api.airtable.com/v0/${baseId}/${table}`, {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${token}`,
			'Content-Type': 'application/json',
		},
		body: JSON.stringify({ fields }),
	});
	const payload = (await response.json().catch(() => ({}))) as { id?: string; error?: { message?: string } };
	if (!response.ok || !payload.id) {
		throw new Error(payload.error?.message || `ContentQueue write failed (${response.status})`);
	}

	await options.store.saveMemory(options.userId, {
		...options.memory,
		airtableContentId: payload.id,
		publicationStatus: 'review',
		metadata: {
			...options.memory.metadata,
			queue_status: IDEA_ENGINE_QUEUE_STATUS,
			queue_platform: platform,
			confirmed_without_publish: true,
		},
	});

	return {
		airtableRecordId: payload.id,
		idempotent: false,
		status: IDEA_ENGINE_QUEUE_STATUS,
		platform,
	};
}
