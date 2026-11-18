import { describe, expect, it } from 'vitest';
import { buildEditorialSnapshot, costComparison, editorialLimitReason, instructionRequests, selectEditorialContext } from '@/lib/articles/editorialMemory';
import { validateEditorialPatch } from '@/lib/articles/editorialPatch';
import type { ArticleRecord } from '@/lib/articles/types';

const body = `Events can disagree on a calendar.

## Calendar

For historical fiction, replace the invented centenary with a researched event and its verified date. One practitioner’s [timeline method](https://example.com/time) places events together.

## Close

Mara meets Ivo at the harbor.
`;

const article = {
	id: 'article-1',
	body,
	audience: 'Fiction writers',
	searchIntent: 'informational',
	research: { claims: [{ text: 'Demonstrate how to align fictional events with relevant historical or real-world events.', sourceLabel: 'brief', confidence: 'supplied' }, { text: 'Folian is built around story memory rather than one-shot generation.', sourceLabel: 'brand', confidence: 'stored' }], sources: [], gaps: [] },
	workspace: {
		revision: { id: 'rev-6', number: 6, contentHash: 'hash', wordCount: 40, createdAt: '', source: 'manual', note: '' },
		researchId: 'research-1',
		research: { version: 2, status: 'approved', updatedAt: null, notes: '', expertise: '', items: [], gaps: [], updates: [], approved: null, sources: [{ id: 's', url: 'https://example.com/time', title: 'Keeping track of time', domain: 'example.com', retrievedAt: null, addedInVersion: 1, origin: 'search', excluded: false, excludedReason: null }] },
		editorial: { findings: [{ id: 'f1', code: 'HISTORICAL_ALIGNMENT_NOT_DEMONSTRATED', severity: 'major', dimension: 'accuracy', instruction: 'Add one sourced event.', source: 'llm', decision: 'pending', section: 'Calendar', evidence: ['invented centenary'] }] },
		editorialDesk: { critique: null, feedback: '', proposals: [], preview: null, updatedAt: null },
		brief: { instructions: 'Show a calendar.', secondaryKeywords: '', questions: '', avoid: '', tone: '', cta: '', requiredLinks: '', referenceMaterial: '' },
		intelligence: { retrievedAt: '', brandId: 'brand', strategyId: null, strategyStatus: null, capabilityIds: ['cap-1'], claimIds: [], learningIds: [], verifiedNames: ['Story Bible', 'Timeline'] },
	},
} as unknown as ArticleRecord;

describe('editorial memory and patches', () => {
	it('stores references instead of copying the research package', () => {
		const snapshot = buildEditorialSnapshot(article);
		expect(snapshot.references.researchId).toBe('research-1');
		expect(snapshot.references.claimCount).toBe(2);
		expect(JSON.stringify(snapshot)).not.toContain('one-shot generation');
		expect(snapshot.fictionalExamples).toEqual(['Mara', 'Ivo']);
		expect(snapshot.revisionId).toBe('rev-6');
	});

	it('returns only the historical section and matching claims', () => {
		const context = selectEditorialContext(article, 'historical_example', 'HISTORICAL_ALIGNMENT_NOT_DEMONSTRATED');
		expect(context.specialist).toBe('fact_verification');
		expect(context.passage).toContain('invented centenary');
		expect(context.passage).not.toContain('Mara meets Ivo');
		expect(context.claims.some((claim) => claim.includes('historical'))).toBe(true);
		expect(context.claims.some((claim) => claim.includes('one-shot generation'))).toBe(false);
		expect(context.contextCharacters).toBeLessThan(body.length * 4);
	});

	it('rejects a stale patch, an instruction leak, and an unsupported product claim', () => {
		const original = 'For historical fiction, replace the invented centenary with a researched event and its verified date.';
		expect(validateEditorialPatch(body, 'rev-6', { revisionId: 'rev-5', section: 'Calendar', original, replacement: 'A sourced event.', findingCode: 'HISTORICAL_ALIGNMENT_NOT_DEMONSTRATED', expectedImprovement: 'Use a source.' }).ok).toBe(false);
		expect(validateEditorialPatch(body, 'rev-6', { revisionId: 'rev-6', section: 'Calendar', original, replacement: 'Reason: do not paraphrase this.', findingCode: 'HISTORICAL_ALIGNMENT_NOT_DEMONSTRATED', expectedImprovement: 'Use a source.' }).ok).toBe(false);
		const product = validateEditorialPatch(`${body}\nFolian helps.\n`, 'rev-6', {
			revisionId: 'rev-6',
			section: null,
			original: 'Folian helps.',
			replacement: 'Folian Desktop generates the plot.',
			findingCode: 'UNHELPFUL_PRODUCT_MENTION',
			expectedImprovement: 'Remove the claim.',
			verifiedClaims: ['Folian is built around story memory rather than one-shot generation.'],
		});
		expect(product.ok).toBe(false);
	});

	it('applies a sourced historical sentence without changing the other section', () => {
		const original = 'For historical fiction, replace the invented centenary with a researched event and its verified date. One practitioner’s [timeline method](https://example.com/time) places events together.';
		const result = validateEditorialPatch(body, 'rev-6', {
			revisionId: 'rev-6',
			section: 'Calendar',
			original,
			replacement: 'The centenary in the table is an invented scheduling illustration. The 1932 Summer Olympics were held in Los Angeles from 30 July to 14 August 1932. One practitioner’s [timeline method](https://example.com/time) places events together.',
			findingCode: 'HISTORICAL_ALIGNMENT_NOT_DEMONSTRATED',
			expectedImprovement: 'Add the verified Olympic dates.',
			verifiedFacts: ['30 July', '14 August'],
		});
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.body).toContain('30 July');
		expect(result.body).toContain('Mara meets Ivo');
		expect(result.body).not.toContain('Reason:');
	});

	it('does not treat a prohibition as a request for new research', () => {
		expect(instructionRequests('Do not add sources, statistics, or unverified product capabilities.', /sources?|product|capabilit/i)).toBe(false);
		expect(instructionRequests('Add a source for the public event.', /sources?/i)).toBe(true);
	});

	it('stops after the model-call limit and records the rewrite comparison', () => {
		const reason = editorialLimitReason(Array.from({ length: 4 }, () => ({ operation: 'full_review' as const, model: 'gpt', inputTokens: 1, outputTokens: 1, cachedInputTokens: null, estimatedCostUsd: 0.02, contextCharacters: 100, revisionId: 'rev-6', result: 'accepted' as const, at: '' })));
		expect(reason).toMatch(/model-call limit/);
		expect(costComparison(0).savedUsd).toBeGreaterThan(0);
	});
});
