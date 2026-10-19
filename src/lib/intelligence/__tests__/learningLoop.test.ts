import { describe, expect, it } from 'vitest';
import { createMemoryIntelligenceStore } from '../memoryStore';
import { captureNativeLearningEvent } from '../learningLoop';

describe('captureNativeLearningEvent', () => {
	it('stores editorial feedback and user_feedback edit learning', async () => {
		const store = createMemoryIntelligenceStore();
		await store.upsertBrandBrain('user-1', 'rec-brand', {
			identity: { name: 'Folian' },
			voice: {},
			guardrails: {},
			knowledge: {},
		});
		const brain = await store.getBrandBrain('user-1', 'rec-brand');
		expect(brain).toBeTruthy();

		await captureNativeLearningEvent(store, {
			userId: 'user-1',
			brandBrainId: brain!.id,
			contentId: 'content-1',
			channel: 'instagram',
			action: 'reject',
			feedbackText: 'The caption is messed up',
			beforeBody: 'AI draft',
		});

		const learnings = await store.listLearnings('user-1', brain!.id);
		const edits = await store.listEditLearnings('user-1', brain!.id);
		expect(learnings.some((row) => row.scope === 'editorial_feedback')).toBe(true);
		expect(edits.some((row) => row.signalType === 'user_feedback' && row.observation.includes('caption'))).toBe(true);
	});
});
