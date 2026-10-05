import { afterEach, describe, expect, it } from 'vitest';
import { dispatchIntelligenceAction, setIntelligenceAiForTests, setIntelligenceStoreForTests } from '../actions';
import { createMemoryIntelligenceStore } from '../memoryStore';
import type { IntelligenceAi } from '../pipeline';

const OWNER = '00000000-0000-4000-8000-0000000000aa';
const OTHER = '00000000-0000-4000-8000-0000000000bb';
const AIRTABLE_ID = 'rec-new-native';

function stubAi(): IntelligenceAi {
	return {
		async completeJson<T>(role: string) {
			if (role === 'REVIEW') return { data: { revisedDraft: 'A short draft idea.' } as T, estimatedCostUsd: 0 };
			if (role === 'FAST') {
				return {
					data: { topic: 'A short draft idea', angle: 'Say what is known', centralArgument: 'Do not invent the rest', supportingConcepts: [] } as T,
					estimatedCostUsd: 0,
				};
			}
			return { data: { draft: 'A short draft idea.', hook: 'A short draft idea.', argument: 'Do not invent the rest', cta: 'Ask one question.', topic: 'A short draft idea' } as T, estimatedCostUsd: 0 };
		},
	};
}

describe('a new native brand needs no allowlist', () => {
	afterEach(() => {
		setIntelligenceStoreForTests(undefined);
		setIntelligenceAiForTests(undefined);
		delete process.env.NATIVE_INTELLIGENCE_ENABLED;
		delete process.env.NATIVE_INTELLIGENCE_BRAND_ALLOWLIST;
	});

	it('generates and reports missing context instead of an eligibility error', async () => {
		process.env.NATIVE_INTELLIGENCE_BRAND_ALLOWLIST = 'not-this-brand';
		const store = createMemoryIntelligenceStore();
		setIntelligenceStoreForTests(store);
		setIntelligenceAiForTests(stubAi());
		const brain = await store.upsertBrandBrain(OWNER, AIRTABLE_ID, { identity: { name: 'Disposable' } });
		const result = await dispatchIntelligenceAction(OWNER, 'draft_content', {
			airtableBrandId: AIRTABLE_ID,
			userIntent: 'Create a short draft idea.',
			channel: 'linkedin',
		}) as { contextGaps: string[]; memory: { publicationStatus: string } };
		expect(result.memory.publicationStatus).toBe('draft');
		expect(result.contextGaps).toEqual(expect.arrayContaining(['strategy', 'themes', 'content_memory', 'brand_facts']));
		expect(brain.guardrails.nativeIntelligenceEnabled).not.toBe(false);
		await expect(dispatchIntelligenceAction(OTHER, 'draft_content', {
			airtableBrandId: AIRTABLE_ID,
			userIntent: 'Create a short draft idea.',
			channel: 'linkedin',
		})).rejects.toThrow(/Brand brain not found/);
	});

	it('honours the global stop and a single-brand disable', async () => {
		const store = createMemoryIntelligenceStore();
		setIntelligenceStoreForTests(store);
		setIntelligenceAiForTests(stubAi());
		await store.upsertBrandBrain(OWNER, AIRTABLE_ID, {
			identity: { name: 'Disposable' },
			guardrails: { nativeIntelligenceEnabled: false },
		});
		await expect(dispatchIntelligenceAction(OWNER, 'draft_content', {
			airtableBrandId: AIRTABLE_ID,
			userIntent: 'Create a short draft idea.',
			channel: 'linkedin',
		})).rejects.toMatchObject({ code: 'native_intelligence_brand_disabled' });

		process.env.NATIVE_INTELLIGENCE_ENABLED = 'false';
		await expect(dispatchIntelligenceAction(OWNER, 'draft_content', {
			airtableBrandId: AIRTABLE_ID,
			userIntent: 'Create a short draft idea.',
			channel: 'linkedin',
		})).rejects.toMatchObject({ code: 'native_intelligence_globally_disabled' });
	});
});
