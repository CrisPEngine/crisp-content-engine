import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { dispatchArticleGenerationWorker, enqueueArticleGenerationJob } from '../generationJob';
import { setIntelligenceAiForTests, setIntelligenceStoreForTests } from '@/lib/intelligence/actions';
import { createMemoryIntelligenceStore } from '@/lib/intelligence/memoryStore';
import type { IntelligenceAi } from '@/lib/intelligence/pipeline';
import {
	FOLIAN_USER_ID,
	folianGuardrails,
	folianIdentity,
	folianKnowledge,
	folianVoice,
} from '@/lib/intelligence/__tests__/folianFixture';
import { setNativeContentStoreForTests, createMemoryNativeContentStore } from '@/lib/media/store';

function stubAi(): IntelligenceAi {
	return {
		async completeJson<T>(_role: string, _messages: unknown[], feature: string) {
			if (feature === 'article_outline') {
				return {
					data: {
						title: 'Memory for novels',
						searchIntent: 'informational',
						sections: [
							{ heading: 'One', purpose: 'First' },
							{ heading: 'Two', purpose: 'Second' },
							{ heading: 'Three', purpose: 'Third' },
							{ heading: 'Four', purpose: 'Fourth' },
						],
					} as T,
					model: 'stub',
				};
			}
			if (feature === 'article_section') {
				const body = `${Array.from({ length: 400 }, () => 'word').join(' ')}.`;
				return { data: { body } as T, model: 'stub' };
			}
			return { data: {} as T, model: 'stub' };
		},
	};
}

describe('article generation jobs', () => {
	beforeEach(async () => {
		setNativeContentStoreForTests(createMemoryNativeContentStore());
		const store = createMemoryIntelligenceStore();
		setIntelligenceStoreForTests(store);
		setIntelligenceAiForTests(stubAi());
		await store.upsertBrandBrain(FOLIAN_USER_ID, 'recFolian', {
			identity: folianIdentity,
			voice: folianVoice,
			guardrails: folianGuardrails,
			knowledge: folianKnowledge,
		});
	});

	afterEach(() => {
		setIntelligenceStoreForTests(undefined);
		setIntelligenceAiForTests(undefined);
		setNativeContentStoreForTests(undefined);
	});

	it('runs inline generation to completion', async () => {
		const store = createMemoryIntelligenceStore();
		setIntelligenceStoreForTests(store);
		setIntelligenceAiForTests(stubAi());
		const brain = await store.upsertBrandBrain(FOLIAN_USER_ID, 'recFolianJob', {
			identity: folianIdentity,
			voice: folianVoice,
			guardrails: folianGuardrails,
			knowledge: folianKnowledge,
		});
		const job = await enqueueArticleGenerationJob({
			ownerUserId: FOLIAN_USER_ID,
			brandBrainId: brain.id,
			payload: { brandId: brain.id, instruction: 'Write from strategy.' },
		});
		await dispatchArticleGenerationWorker(job.id);
		const updated = await store.getJobById(job.id);
		expect(updated?.status).toBe('completed');
		const result = (updated?.payload as { result?: { articleId?: string } }).result;
		expect(result?.articleId).toBeTruthy();
	});
});
