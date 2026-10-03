import {
	FOLIAN_BRAND_ID,
	folianGuardrails,
	folianIdentity,
	folianKnowledge,
	folianVoice,
} from '../__tests__/folianFixture';
import type { IntelligenceStore } from '../store';
import { validateFolianBrand } from './validate';

export async function seedFolianBrand(
	store: IntelligenceStore,
	userId: string,
	airtableBrandId?: string,
) {
	const brandId = airtableBrandId?.trim() || FOLIAN_BRAND_ID;
	const brain = await store.upsertBrandBrain(userId, brandId, {
		identity: folianIdentity,
		voice: folianVoice,
		guardrails: folianGuardrails,
		knowledge: folianKnowledge,
	});

	if (!brain.examples.some((example) => example.kind === 'good')) {
		await store.addExample(userId, {
			brandBrainId: brain.id,
			kind: 'good',
			channel: 'linkedin',
			contentType: 'founder_post',
			body: 'Folian is not a ghostwriter. It is the memory layer that keeps canon from drifting between sessions.',
			whyItWorks: 'Specific product claim, no hype.',
		});
	}

	const strategy = await store.upsertStrategy(userId, {
		userId,
		brandBrainId: brain.id,
		airtableBrandId: brandId,
		status: 'active',
		objectives: ['Become the default story-memory layer for serious novelists'],
		audiences: [{ name: 'Serious fiction authors', problems: ['Lost canon'], desiredOutcomes: ['Finish the book'] }],
		audienceProblems: ['Chat tools invent facts', 'Continuity dies between sessions'],
		desiredOutcomes: ['Trusted canon', 'Fewer continuity rewrites'],
		positioning: folianIdentity.positioning,
		keyMessages: ['Memory is the product', 'Authors approve canon', 'Not a ghostwriter'],
		proofPoints: ['Approval before facts persist'],
		contentPillars: ['AI and authorship', 'Continuity craft', 'Author authority'],
		funnelStages: ['awareness', 'consideration'],
		ctaStrategy: { default: 'Invite a look at story memory; no hard sell' },
		contentMix: { linkedin: 0.5, blog: 0.3, x: 0.2 },
		editorialThemes: ['AI and authorship'],
	});

	await store.upsertChannelStrategy(userId, {
		strategyId: strategy.id,
		channel: 'linkedin',
		role: 'Founder authority on authorship and memory',
		cadence: '2-3/week',
		formats: ['founder_post', 'company_post'],
		constraints: ['No growth-hacker tone'],
	});
	await store.upsertChannelStrategy(userId, {
		strategyId: strategy.id,
		channel: 'blog',
		role: 'Long-form argument with proof',
		cadence: '2/month',
		formats: ['article'],
		constraints: [],
	});

	const refreshed = await store.getBrandBrain(userId, brandId);
	const refreshedStrategy = await store.getStrategyForBrand(userId, brain.id);
	if (!refreshed) throw new Error('Folian seed failed');
	return {
		brain: refreshed,
		strategy: refreshedStrategy,
		validation: validateFolianBrand(refreshed, refreshedStrategy),
	};
}
