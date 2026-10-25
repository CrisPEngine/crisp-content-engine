import { beforeEach, describe, expect, it } from 'vitest';
import { runContentIntelligencePipeline, type IntelligenceAi } from '@/lib/intelligence/pipeline';
import { createMemoryIntelligenceStore } from '@/lib/intelligence/memoryStore';
import { FOLIAN_BRAND_ID, FOLIAN_USER_ID, folianGuardrails, folianIdentity, folianKnowledge, folianVoice } from './folianFixture';

const LONG_THREADS =
	`${'Canon has to survive between writing sessions. '.repeat(12)}How do you track continuity in your draft? #Folian`;

const SHORT_THREADS = 'Canon stays with the author. How do you track continuity? #Folian';

function stubAi(): IntelligenceAi {
	return {
		async completeJson<T>(role: string, messages: Array<{ content: string }>, feature: string) {
			if (feature === 'intelligence_editorial_plan' || feature === 'intelligence_fast_plan') {
				return {
					data: {
						themeTitle: 'AI and authorship',
						angle: 'Memory beats autocomplete',
						hookDirection: 'Open with continuity',
					} as T,
				};
			}
			if (feature === 'intelligence_channel_limit') {
				return { data: { revisedDraft: SHORT_THREADS } as T };
			}
			if (role === 'WRITING') {
				return {
					data: {
						draft: LONG_THREADS,
						hook: 'Sessions reset. Canon should not.',
						argument: 'Authors approve memory.',
						cta: 'How do you track continuity in your draft?',
						topic: 'Canon',
					} as T,
				};
			}
			return { data: {} as T };
		},
	};
}

describe('Threads generation pipeline', () => {
	const store = createMemoryIntelligenceStore();

	beforeEach(async () => {
		await store.upsertBrandBrain(FOLIAN_USER_ID, FOLIAN_BRAND_ID, {
			identity: folianIdentity,
			voice: folianVoice,
			guardrails: folianGuardrails,
			knowledge: folianKnowledge,
		});
	});

	it('tightens over-long Threads drafts without mid-sentence truncation', async () => {
		const brain = await store.getBrandBrain(FOLIAN_USER_ID, FOLIAN_BRAND_ID);
		if (!brain) throw new Error('missing brain');
		const result = await runContentIntelligencePipeline(
			store,
			{
				userId: FOLIAN_USER_ID,
				airtableBrandId: FOLIAN_BRAND_ID,
				userIntent: 'Write a Threads post about canon.',
				channel: 'threads',
				contentType: 'thread',
			},
			stubAi(),
		);
		expect(result.reviewedDraft.length).toBeLessThanOrEqual(500);
		expect(result.reviewedDraft).toMatch(/\?\s*#?\w+/);
		expect(result.reviewedDraft).toBe(SHORT_THREADS);
	});
});
