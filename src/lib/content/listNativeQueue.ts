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
	matchesPlatformTab,
	memoryForQueueDisplay,
	type ListNativeQueueInput,
	type NativeQueueListItem,
} from '@/lib/content/nativeQueueView';
import { resolveLinkedImageUrlForTarget } from '@/lib/content/queueLinkedImage';
import { resolveQueuePublishTarget, type QueuePublishTarget } from '@/lib/content/queuePublishTarget';
import type { BrandBrain, ContentMemoryRecord } from '@/lib/intelligence/types';
import {
	needsApprovedScheduleRepair,
	repairApprovedScheduleMemory,
} from '@/lib/content/nativeQueueSchedule';
import { isAgentMetaMemory, syncAgentMetaPublishJob } from '@/lib/publish/agentMetaJob';
import { isAgentThreadsMemory, syncAgentThreadsPublishJob } from '@/lib/publish/agentThreadsJob';

export async function listNativeQueueForUser(
	userId: string,
	input: ListNativeQueueInput,
): Promise<NativeQueueListItem[]> {
	const store = getIntelligenceStore();
	const brains = filterBrainsForBrand(await store.listBrandBrains(userId), input.brandProfileId);
	const brainById = new Map(brains.map((brain) => [brain.id, brain]));
	const jobByMemoryId = await loadLatestPublishJobByMemoryId(userId);

	const memories = await store.listMemoryForBrandBrains(
		userId,
		brains.map((brain) => brain.id),
	);

	const publishTargetCache = new Map<string, Promise<QueuePublishTarget>>();

	function publishTargetFor(brain: BrandBrain, channel: string): Promise<QueuePublishTarget> {
		const key = `${brain.id}:${channel}`;
		let pending = publishTargetCache.get(key);
		if (!pending) {
			pending = resolveQueuePublishTarget({ userId, brandBrain: brain, channel });
			publishTargetCache.set(key, pending);
		}
		return pending;
	}

	const items: NativeQueueListItem[] = [];

	async function memoryForListing(memory: ContentMemoryRecord): Promise<ContentMemoryRecord> {
		if (!needsApprovedScheduleRepair(memory)) return memory;
		const repaired = repairApprovedScheduleMemory(memory);
		const saved = await store.saveMemory(userId, repaired);
		if (repaired.publicationDate && repaired.publicationStatus === 'scheduled') {
			if (isAgentThreadsMemory(saved)) {
				await syncAgentThreadsPublishJob({ userId, memory: saved, publishAt: repaired.publicationDate });
			} else if (isAgentMetaMemory(saved)) {
				await syncAgentMetaPublishJob({ userId, memory: saved, publishAt: repaired.publicationDate });
			}
		}
		return saved;
	}

	await Promise.all(
		memories.map(async (memory) => {
			const brain = brainById.get(memory.brandBrainId);
			if (!brain) return;

			memory = await memoryForListing(memory);

			if (input.platformTab && !matchesPlatformTab(String(memory.channel), input.platformTab)) {
				return;
			}

			const job = jobByMemoryId.get(memory.id);
			const displayMemory = memoryForQueueDisplay(memory, job);
			const diagnostics = diagnosticsFromPublishJob(displayMemory, job);

			const channel = String(displayMemory.channel);
			const [linkedImageUrl, publishTarget] = await Promise.all([
				resolveLinkedImageUrlForTarget({
					ownerUserId: userId,
					targetType: 'content',
					targetId: displayMemory.id,
					brandBrainId: brain.id,
				}),
				publishTargetFor(brain, channel),
			]);

			const item = mapMemoryToQueueItem(brain, displayMemory, diagnostics, {
				linkedImageUrl,
				destinationLabel: publishTarget.ready ? publishTarget.label : null,
				publishJob: job,
			});
			if (!filterNativeQueueItem(item, memory, input)) return;
			items.push(item);
		}),
	);

	items.sort((a, b) => b.created_time.localeCompare(a.created_time));
	return items;
}
