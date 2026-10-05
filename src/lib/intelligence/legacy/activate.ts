import type { IntelligenceStore } from '../store';
import type { QueueMemoryInput } from './reconcile';
import { memoryFromQueueItem, reconcileLegacyProfiles, type LegacyProfileRef } from './reconcile';

export async function activateLegacyBrand(store: IntelligenceStore, input: {
	userId: string;
	airtableTable: string;
	profiles: LegacyProfileRef[];
	selectedId: string;
	reason: string;
	brain: Parameters<IntelligenceStore['upsertBrandBrain']>[2];
	strategy: Omit<Parameters<IntelligenceStore['upsertStrategy']>[1], 'userId' | 'brandBrainId' | 'airtableBrandId' | 'id'>;
	themes: Array<Omit<Parameters<IntelligenceStore['createTheme']>[1], 'brandBrainId' | 'strategyId' | 'id'>>;
	queueItems?: QueueMemoryInput[];
	representativeExample?: { body: string; whyItWorks: string };
}): Promise<{
	brandId: string;
	airtableBrandId: string;
	retainedIds: string[];
	strategyId: string;
	themeTitles: string[];
	memoryIngested: number;
	memorySkipped: number;
}> {
	const decision = reconcileLegacyProfiles({
		expectedOwnerUserId: input.userId,
		profiles: input.profiles,
		selectedId: input.selectedId,
		reason: input.reason,
	});
	const brain = await store.upsertBrandBrain(input.userId, decision.selectedId, input.brain);
	if (input.representativeExample && !brain.examples.some((example) => example.metadata?.source === 'brand_profile_overview')) {
		await store.addExample(input.userId, {
			brandBrainId: brain.id,
			kind: 'representative',
			channel: 'linkedin',
			contentType: 'company_post',
			body: input.representativeExample.body,
			whyItWorks: input.representativeExample.whyItWorks,
			metadata: { source: 'brand_profile_overview', airtableRecordId: decision.selectedId },
		});
	}
	const existingStrategy = await store.getStrategyForBrand(input.userId, brain.id);
	const strategy = await store.upsertStrategy(input.userId, {
		...input.strategy,
		id: existingStrategy?.id,
		userId: input.userId,
		brandBrainId: brain.id,
		airtableBrandId: decision.selectedId,
	});
	const existingThemes = await store.listThemes(input.userId, brain.id);
	const themeTitles: string[] = [];
	for (const theme of input.themes) {
		const match = existingThemes.find((row) => row.title === theme.title);
		const saved = await store.createTheme(input.userId, {
			...theme,
			id: match?.id,
			brandBrainId: brain.id,
			strategyId: strategy.id,
		});
		themeTitles.push(saved.title);
	}
	const existingMemory = await store.listMemory(input.userId, brain.id);
	const seen = new Set(existingMemory.map((row) => row.airtableContentId).filter(Boolean));
	let memoryIngested = 0;
	let memorySkipped = 0;
	for (const item of input.queueItems ?? []) {
		if (seen.has(item.id)) {
			memorySkipped += 1;
			continue;
		}
		const memory = memoryFromQueueItem(item);
		if (!memory) {
			memorySkipped += 1;
			continue;
		}
		await store.saveMemory(input.userId, {
			...memory,
			brandBrainId: brain.id,
			contentType: 'company_post',
		});
		seen.add(item.id);
		memoryIngested += 1;
	}
	return {
		brandId: brain.id,
		airtableBrandId: decision.selectedId,
		retainedIds: decision.retainedIds,
		strategyId: strategy.id,
		themeTitles,
		memoryIngested,
		memorySkipped,
	};
}
