import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMemoryIntelligenceStore } from '../../memoryStore';
import { setIntelligenceStoreForTests } from '../../actions';
import { generateNativeStrategy } from '../generateNativeStrategy';
import { enqueueNativeStrategyGeneration, runStrategyGenerationJob } from '../generationJob';
import { resolveStrategyEngine } from '../strategyEngine';

const OWNER = '00000000-0000-4000-8000-0000000000cc';
const AIRTABLE = 'rec-strategy-test';

vi.mock('@/lib/ai/complete', () => ({
	completeWithRole: vi.fn(async () => ({
		data: {
			objectives: ['Grow qualified traffic'],
			audiences: [{ name: 'Collectors', description: 'Adult hobbyists' }],
			audienceProblems: ['Finding authentic stock'],
			desiredOutcomes: ['Trusted source'],
			positioning: 'Premium die-cast specialist',
			keyMessages: ['Curated inventory'],
			proofPoints: [{ text: 'Offers: Scale models', source: 'brand_facts' }],
			contentPillars: ['New arrivals'],
			funnelStages: ['awareness'],
			ctaStrategy: { default: 'Browse the catalog' },
			contentMix: {},
			editorialThemes: ['Product drops'],
			channelStrategies: [{ channel: 'instagram', role: 'visual showcase', cadence: '4x weekly', formats: ['reels'] }],
			campaigns: [],
			extras: {
				richPillars: [{ title: 'New arrivals', why: 'Collectors watch releases', exampleHooks: ['Just landed on the shelf'] }],
				hashtagBuckets: { instagram: ['#diecast'] },
				postMix: { thoughtLeadershipPct: 10, educationalPct: 40, promoPct: 30, communityPct: 20 },
			},
		},
		model: 'gpt-6.1-sol',
	})),
}));

describe('native strategy generator', () => {
	afterEach(() => {
		setIntelligenceStoreForTests(undefined);
		delete process.env.STRATEGY_ENGINE;
	});

	it('validates LLM output and stores draft without activating', async () => {
		const store = createMemoryIntelligenceStore();
		setIntelligenceStoreForTests(store);
		const brain = await store.upsertBrandBrain(OWNER, AIRTABLE, {
			identity: { name: 'Premium Die-Cast' },
			knowledge: { brandFacts: ['Offers: Scale models'] },
		});
		await store.upsertStrategy(OWNER, {
			userId: OWNER,
			brandBrainId: brain.id,
			airtableBrandId: AIRTABLE,
			status: 'draft',
			objectives: ['Skeleton'],
			audiences: [],
			audienceProblems: [],
			desiredOutcomes: [],
			keyMessages: [],
			proofPoints: [],
			contentPillars: ['Instagram content'],
			funnelStages: [],
			ctaStrategy: {},
			contentMix: {},
			editorialThemes: [],
		});

		const job = await enqueueNativeStrategyGeneration({
			ownerUserId: OWNER,
			airtableBrandId: AIRTABLE,
			brandBrainId: brain.id,
		});
		await runStrategyGenerationJob(job);

		const strategy = await store.getStrategyForBrand(OWNER, brain.id);
		expect(strategy?.generationMetadata?.phase).toBe('ready');
		expect(strategy?.draftPayload).toBeTruthy();
		expect(strategy?.objectives).toEqual(['Skeleton']);
		expect(strategy?.status).toBe('draft');
	});

	it('defaults strategy engine to native', () => {
		delete process.env.STRATEGY_ENGINE;
		expect(resolveStrategyEngine()).toBe('native');
		expect(resolveStrategyEngine()).toBe('native');
		process.env.STRATEGY_ENGINE = 'make';
		expect(resolveStrategyEngine()).toBe('make');
	});

	it('snapshots before regenerate', async () => {
		const store = createMemoryIntelligenceStore();
		setIntelligenceStoreForTests(store);
		const brain = await store.upsertBrandBrain(OWNER, AIRTABLE, { identity: { name: 'Brand' } });
		const saved = await store.upsertStrategy(OWNER, {
			userId: OWNER,
			brandBrainId: brain.id,
			airtableBrandId: AIRTABLE,
			status: 'active',
			objectives: ['Live objective'],
			audiences: [],
			audienceProblems: [],
			desiredOutcomes: [],
			keyMessages: [],
			proofPoints: [],
			contentPillars: ['Pillar'],
			funnelStages: [],
			ctaStrategy: {},
			contentMix: {},
			editorialThemes: [],
		});
		await enqueueNativeStrategyGeneration({ ownerUserId: OWNER, airtableBrandId: AIRTABLE, brandBrainId: brain.id });
		const snapshots = await store.listStrategySnapshots(OWNER, saved.id);
		expect(snapshots.length).toBe(1);
	});

	it('generateNativeStrategy strips unverified proof points', async () => {
		const store = createMemoryIntelligenceStore();
		const brain = await store.upsertBrandBrain(OWNER, AIRTABLE, {
			identity: { name: 'Brand' },
			knowledge: { brandFacts: ['Known fact'] },
		});
		const result = await generateNativeStrategy({
			brain,
			userId: OWNER,
			existingStrategy: null,
		});
		expect(result.modelRole).toBe('STRATEGY');
		expect(result.draft.proofPoints.every((p) => !p.flagged)).toBe(true);
	});
});
