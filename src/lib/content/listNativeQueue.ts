import 'server-only';

import { getIntelligenceStore } from '@/lib/intelligence/actions';
import {
	diagnosticsFromPublishJob,
	loadLatestPublishJobByMemoryId,
} from '@/lib/publish/contentPublishDiagnostics';
import {
	filterBrainsForBrand,
	filterNativeQueueItem,
	mapMemoryToQueueItem,
	memoryForQueueDisplay,
	type ListNativeQueueInput,
	type NativeQueueListItem,
} from '@/lib/content/nativeQueueView';
import { resolveLinkedImageUrlForTarget } from '@/lib/content/queueLinkedImage';
import { resolveQueuePublishTarget } from '@/lib/content/queuePublishTarget';

export async function listNativeQueueForUser(
	userId: string,
	input: ListNativeQueueInput,
): Promise<NativeQueueListItem[]> {
	const store = getIntelligenceStore();
	const brains = filterBrainsForBrand(await store.listBrandBrains(userId), input.brandProfileId);
	const jobByMemoryId = await loadLatestPublishJobByMemoryId(userId);
	const items: NativeQueueListItem[] = [];

	for (const brain of brains) {
		const memories = await store.listMemory(userId, brain.id);
		for (const memory of memories) {
			const job = jobByMemoryId.get(memory.id);
			const displayMemory = memoryForQueueDisplay(memory, job);
			const diagnostics = diagnosticsFromPublishJob(displayMemory, job);
			const [linkedImageUrl, publishTarget] = await Promise.all([
				resolveLinkedImageUrlForTarget({
					ownerUserId: userId,
					targetType: 'content',
					targetId: displayMemory.id,
					brandBrainId: brain.id,
				}),
				resolveQueuePublishTarget({
					userId,
					brandBrain: brain,
					channel: String(displayMemory.channel),
				}),
			]);
			const item = mapMemoryToQueueItem(brain, displayMemory, diagnostics, {
				linkedImageUrl,
				destinationLabel: publishTarget.ready ? publishTarget.label : null,
			});
			if (!filterNativeQueueItem(item, memory, input)) continue;
			items.push(item);
		}
	}

	return items;
}
