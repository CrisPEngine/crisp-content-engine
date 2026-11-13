import 'server-only';

import { getIntelligenceStore } from '../actions';
import type { BrandBrain } from '../types';
import { loadKnowledgeSnapshot } from './repository';
import { resolveIntelligence, type IntelligenceTask, type ResolvedIntelligence } from './resolver';

export async function loadResolvedIntelligence(
	userId: string,
	brain: BrandBrain,
	topic: string,
	task: IntelligenceTask,
): Promise<ResolvedIntelligence> {
	const store = getIntelligenceStore();
	const [strategy, learnings, snapshot] = await Promise.all([
		store.getStrategyForBrand(userId, brain.id),
		store.listEditLearnings(userId, brain.id).catch(() => []),
		loadKnowledgeSnapshot(userId, brain.id).catch(() => null),
	]);
	return resolveIntelligence({
		brain,
		strategy,
		snapshot,
		learnings,
		topic,
		task,
	});
}
