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
	type ListNativeQueueInput,
	type NativeQueueListItem,
} from '@/lib/content/nativeQueueView';

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
			const diagnostics = diagnosticsFromPublishJob(memory, jobByMemoryId.get(memory.id));
			const item = mapMemoryToQueueItem(brain, memory, diagnostics);
			if (!filterNativeQueueItem(item, memory, input)) continue;
			items.push(item);
		}
	}

	return items;
}
