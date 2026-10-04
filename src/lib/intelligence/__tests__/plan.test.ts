import { describe, expect, it } from 'vitest';
import { acceptEditorialPlan, buildDeterministicPlan, isInstructionTopic } from '../plan';
import { folianGuardrails, folianIdentity, folianKnowledge, folianVoice } from './folianFixture';
import type { BrandBrain, ContentTheme } from '../types';

const brain: BrandBrain = {
	id: 'brain',
	userId: 'user',
	airtableBrandId: 'rec',
	identity: folianIdentity,
	voice: folianVoice,
	guardrails: folianGuardrails,
	knowledge: folianKnowledge,
	examples: [],
	updatedAt: '2026-10-03T00:00:00.000Z',
};

const theme: ContentTheme = {
	id: 'theme',
	userId: 'user',
	brandBrainId: 'brain',
	title: 'Author authority',
	description: 'Proposed facts stay proposals until the author approves them.',
	objective: 'Make author approval the boundary of the product.',
	targetAudience: 'Serious fiction authors',
	relatedPillars: ['Author authority'],
	keyArguments: ['Folian does not replace the author'],
	subtopics: [],
	questionsToAnswer: ['Who decides what is true in the book?'],
	proofPoints: [],
	keywords: [],
	channels: ['linkedin'],
	status: 'active',
};

describe('editorial planning', () => {
	it('turns a generic instruction into an editorial topic', () => {
		const intent = 'Create the next Folian LinkedIn post.';
		expect(isInstructionTopic(intent, intent)).toBe(true);
		const plan = buildDeterministicPlan({
			userIntent: intent,
			brain,
			theme,
			memory: { related: [], recentSameChannel: [], warnings: ['insufficient history for performance-informed optimisation'], continuationAllowed: true },
		});
		expect(plan.topic).toBe('Who decides what is true in the book?');
		expect(plan.topic).not.toBe(intent);
		expect(plan.experimentOpportunity).toMatch(/insufficient history/i);
	});

	it('rejects a model topic that repeats the user instruction', () => {
		const fallback = buildDeterministicPlan({
			userIntent: 'Create the next Folian LinkedIn post.',
			brain,
			theme,
			memory: { related: [], recentSameChannel: [], warnings: [], continuationAllowed: true },
		});
		const accepted = acceptEditorialPlan(
			{ topic: 'Create the next Folian LinkedIn post.', selectedTheme: 'Not a theme', angle: 'Author approval is the boundary' },
			fallback,
			['Author authority'],
			'Create the next Folian LinkedIn post.',
		);
		expect(accepted.topic).toBe(fallback.topic);
		expect(accepted.selectedTheme).toBe('Author authority');
		expect(accepted.angle).toBe('Author approval is the boundary');
	});
});
