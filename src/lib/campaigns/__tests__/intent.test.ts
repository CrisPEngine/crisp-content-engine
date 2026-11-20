import { describe, expect, it } from 'vitest';
import { assessOverlap } from '@/lib/campaigns/overlap';
import type { InventoryArticle } from '@/lib/campaigns/types';
import { critiqueDraft } from '@/lib/articles/editorialDesk';
import { classifyFictionalConsistency } from '@/lib/articles/fictionConsistency';
import { validateEditorialPatch } from '@/lib/articles/editorialPatch';
import { correctionDecision, correctionStrategy } from '@/lib/articles/correctionStrategy';

const inventory: InventoryArticle[] = [
	{ id: 'ai-novel', title: 'Can AI Write a Novel for Me?', topic: 'AI novels', keyword: 'write a novel', intent: 'informational', status: 'published', url: 'https://folian.app/articles/can-ai-write-a-novel' },
	{ id: 'os', title: 'What is an AI writing OS?', topic: 'AI writing OS', keyword: 'ai writing os', intent: 'informational', status: 'published', url: null },
	{ id: 'chatgpt', title: 'ChatGPT for Novel Writing', topic: 'ChatGPT', keyword: 'chatgpt for novel writing', intent: 'informational', status: 'published', url: null },
	{ id: 'scene', title: 'How to continue a fiction scene with AI without contradicting earlier chapters', topic: 'scene continuation', keyword: 'continue a fiction scene', intent: 'informational', status: 'draft', url: null },
];

describe('search intent comparison', () => {
	it('keeps related writing topics distinct from loosely matching articles', () => {
		const titles = [
			'how to track clues and reveals across a mystery novel',
			'how to revise one chapter without rewriting the whole novel',
			'how to decide what happens in the next chapter of a novel',
			'how to choose novel writing software for story notes versus drafting',
		];
		for (const title of titles) {
			const result = assessOverlap({ title }, inventory);
			expect(result.intentRelation).toBe('related_but_distinct');
			expect(result.decision).toBe('create');
			expect(result.matchedTitle).toBeTruthy();
		}
	});

	it('rejects a genuine duplicate and a substantially overlapping query', () => {
		const duplicate = assessOverlap({ title: 'How to continue a fiction scene with AI without contradicting earlier chapters' }, inventory);
		expect(duplicate.intentRelation).toBe('duplicate_intent');
		expect(duplicate.decision).toBe('reject');
		const cannibalised = assessOverlap({ title: 'chatgpt for novel writing help' }, inventory);
		expect(cannibalised.intentRelation === 'duplicate_intent' || cannibalised.intentRelation === 'substantially_overlapping').toBe(true);
		expect(cannibalised.decision === 'reject' || cannibalised.decision === 'update').toBe(true);
	});
});

describe('finding-specific correction recovery', () => {
	it('does not treat Lead and Read as a fictional name clash', () => {
		const body = '## Gather the facts\n\nLead with the established facts.\n\nRead the summary before you continue the scene.\n\nMara asks Iven for the harbour time.';
		expect(classifyFictionalConsistency(body).filter((item) => item.kind === 'accidental')).toEqual([]);
	});

	it('does not raise continuity-only findings against a scene article that answers its own question', () => {
		const body = [
			'## Continue the scene',
			'Continue from the scene you approved. Check that the continuation does not contradict the earlier chapter.',
			'## Next-session checklist',
			'- [ ] Select the context needed for the next scene.',
			'The next drafting cycle should begin from the story you approved.',
		].join('\n');
		const ids = critiqueDraft({ title: 'how to continue a fiction scene with AI without contradicting earlier chapters', topic: 'scene continuation', body, brandName: 'Folian', targetWords: 1400 }).findings.map((finding) => finding.id);
		expect(ids).not.toContain('answers-indirect');
		expect(ids).not.toContain('example-conflict');
		expect(ids).not.toContain('cta-weak');
	});

	it('rejects a stale patch and stops after the correction limit or the budget', () => {
		expect(correctionStrategy('example-conflict')?.kind).toBe('example_conflict');
		expect(correctionStrategy('cta-weak')?.kind).toBe('closing');
		const stale = validateEditorialPatch('Mara waits.', 'current', { revisionId: 'older', section: null, original: 'Mara waits.', replacement: 'Mara waits at the harbour.', findingCode: 'example-conflict', expectedImprovement: 'One timeline.' });
		expect(stale.ok).toBe(false);
		expect(correctionDecision({ openBlockers: ['cta-weak'], attemptsByFinding: { 'cta-weak': 1 }, maxAttempts: 3, costUsd: 0.2, maxCostUsd: 1, introducedCritical: false, unverifiable: false }).decision).toBe('retry');
		expect(correctionDecision({ openBlockers: ['cta-weak'], attemptsByFinding: { 'cta-weak': 3 }, maxAttempts: 3, costUsd: 0.2, maxCostUsd: 1, introducedCritical: false, unverifiable: false }).decision).toBe('stop');
		expect(correctionDecision({ openBlockers: [], attemptsByFinding: {}, maxAttempts: 3, costUsd: 0.2, maxCostUsd: 1, introducedCritical: false, unverifiable: false }).decision).toBe('continue');
		expect(correctionDecision({ openBlockers: [], attemptsByFinding: {}, maxAttempts: 3, costUsd: 1, maxCostUsd: 1, introducedCritical: false, unverifiable: false }).decision).toBe('stop');
		expect(correctionDecision({ openBlockers: ['example-conflict'], attemptsByFinding: {}, maxAttempts: 3, costUsd: 0.1, maxCostUsd: 1, introducedCritical: false, unverifiable: true }).decision).toBe('stop');
	});
});
