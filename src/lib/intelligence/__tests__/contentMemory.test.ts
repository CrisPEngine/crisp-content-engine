import { describe, expect, it } from 'vitest';
import { retrieveRelevantMemory, looksNearDuplicate } from '../contentMemory';
import type { ContentMemoryRecord } from '../types';

function memory(partial: Partial<ContentMemoryRecord>): ContentMemoryRecord {
	return {
		id: partial.id ?? crypto.randomUUID(),
		userId: 'user',
		brandBrainId: 'brain',
		channel: partial.channel ?? 'linkedin',
		publicationStatus: 'published',
		createdAt: partial.createdAt ?? '2026-08-01T00:00:00.000Z',
		...partial,
	};
}

describe('content memory retrieval', () => {
	it('surfaces recent hook/CTA collisions and related theme pieces', () => {
		const records = [
			memory({
				id: 'recent-hook',
				hook: 'Authors do not need another chatbot',
				argument: 'Memory is the product',
				cta: 'See story memory',
				topic: 'AI and authorship',
				createdAt: '2026-08-30T00:00:00.000Z',
			}),
			memory({
				id: 'old-unrelated',
				hook: 'Collecting 1:18 models taught me patience',
				argument: 'Die-cast scale accuracy',
				topic: 'model cars',
				channel: 'x',
				createdAt: '2024-01-01T00:00:00.000Z',
			}),
			memory({
				id: 'theme-piece',
				hook: 'Canon is a product decision',
				argument: 'Approval before facts persist',
				topic: 'AI and authorship',
				themeId: 'theme-1',
				createdAt: '2026-08-20T00:00:00.000Z',
			}),
		];

		const result = retrieveRelevantMemory(records, {
			channel: 'linkedin',
			userIntent: 'Write about why authors do not need another chatbot',
			hook: 'Authors do not need another chatbot',
			cta: 'See story memory',
			topic: 'AI and authorship',
			themeId: 'theme-1',
			allowThemeContinuation: true,
		});

		expect(result.warnings.some((warning) => warning.includes('hook'))).toBe(true);
		expect(result.related.some((row) => row.id === 'theme-piece')).toBe(true);
		expect(result.related.some((row) => row.id === 'old-unrelated')).toBe(false);
		expect(result.continuationAllowed).toBe(true);
	});

	it('allows deliberate theme continuation when the hook and argument are new', () => {
		const records = [
			memory({
				id: 'same-theme',
				themeId: 'theme-1',
				hook: 'The manuscript is the product',
				argument: 'Persistence of canon matters more than another chat window',
				topic: 'AI and authorship',
				cta: 'Read the canon note',
			}),
		];
		const result = retrieveRelevantMemory(records, {
			channel: 'linkedin',
			userIntent: 'Continue the authorship theme with a new proof about revision history',
			hook: 'Revision history is the part most tools throw away',
			argument: 'Authors need to see what changed and who approved it',
			topic: 'AI and authorship',
			themeId: 'theme-1',
			allowThemeContinuation: true,
			cta: 'Look at revision history',
		});
		expect(result.continuationAllowed).toBe(true);
		expect(result.warnings.filter((warning) => warning.includes('hook collision'))).toHaveLength(0);
		expect(result.related.some((row) => row.id === 'same-theme')).toBe(true);
	});

	it('names insufficient history when a brand has no memory', () => {
		const result = retrieveRelevantMemory([], {
			channel: 'linkedin',
			userIntent: 'Create the next Folian LinkedIn post.',
		});
		expect(result.related).toHaveLength(0);
		expect(result.warnings).toContain('insufficient history for performance-informed optimisation');
	});

	it('detects near-duplicate bodies', () => {
		const existing = [
			memory({
				body: 'Folian holds canon so the author can finish the book they are actually writing.',
			}),
		];
		expect(
			looksNearDuplicate(
				'Folian holds canon so the author can finish the book they are actually writing.',
				existing,
			),
		).toBe(true);
		expect(looksNearDuplicate('Tuesday morning espresso tasting notes from Lisbon.', existing)).toBe(false);
	});
});
