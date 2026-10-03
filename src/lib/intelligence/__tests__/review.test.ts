import { describe, expect, it } from 'vitest';
import { detectProsePatterns, shouldRewrite } from '../review/prosePatterns';
import { reviewDraft } from '../review';
import type { BrandBrain, ContentBrief } from '../types';

describe('prose pattern review', () => {
	it('flags common low-quality AI openings without rejecting a single pattern automatically', () => {
		const text = [
			"In today's fast-paced world, it's not just about writing. It's about unlocking the power of storytelling.",
			'So, here is the thing. What if the real question is whether you are ready? Are you listening? Can you feel it?',
			'In conclusion, the key takeaway is to leverage synergy.',
		].join(' ');
		const hits = detectProsePatterns(text);
		expect(hits.some((hit) => hit.id === 'generic_scene_setting')).toBe(true);
		expect(hits.some((hit) => hit.id === 'predictable_marketing')).toBe(true);
		expect(shouldRewrite(hits)).toBe(true);
	});

	it('does not punish distinctive brand voice that happens to be formal', () => {
		const text =
			'Folian remembers the canon you already approved. Continuity errors are cheaper to catch in a memory layer than in draft twelve.';
		const hits = detectProsePatterns(text);
		expect(hits.some((hit) => hit.severity === 'high')).toBe(false);
	});
});

describe('brand compliance review', () => {
	it('strips prohibited phrases deterministically and keeps brand fit authoritative', () => {
		const brain: BrandBrain = {
			id: 'b',
			userId: 'u',
			airtableBrandId: 'rec',
			identity: { name: 'Folian', positioning: 'memory layer for serious fiction' },
			voice: { tone: 'calm' },
			guardrails: { phrasesToAvoid: ['delve'], prohibitedClaims: ['guaranteed bestseller'], promotionalIntensity: 'low' },
			knowledge: {},
			examples: [],
			updatedAt: new Date().toISOString(),
		};
		const brief: ContentBrief = {
			objective: 'authority',
			audience: 'authors',
			channel: 'linkedin',
			contentType: 'founder_post',
			funnelStage: 'awareness',
			topic: 'canon',
			angle: 'memory',
			hookDirection: 'problem-led',
			centralArgument: 'Memory beats autocomplete',
			supportingPoints: [],
			evidence: [],
			proofPoints: [],
			relevantBrandContext: [],
			voiceRequirements: ['calm'],
			cta: 'No hard sell',
			guardrails: [],
			prohibitedPhrases: ['delve'],
			relatedPreviousContent: [],
			differentiationFromRecent: [],
			sourceRequirements: [],
			optimizationObjective: 'authority',
		};

		const review = reviewDraft({
			draft: 'Look, delve into this guaranteed bestseller machine and buy now.',
			brain,
			brief,
		});
		expect(review.brandFit.passed).toBe(false);
		expect(review.improvedDraft.toLowerCase()).not.toContain('delve');
		expect(review.changed).toBe(true);
	});
});
