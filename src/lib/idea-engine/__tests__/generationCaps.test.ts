import { describe, expect, it } from 'vitest';
import {
	MAX_ITEMS_PER_OPENAI_CALL,
	clampRequestedCountsForGeneration,
	splitChannelIntoBatches,
} from '../generator/generationCaps';

describe('splitChannelIntoBatches', () => {
	it('splits counts larger than max per OpenAI call', () => {
		expect(splitChannelIntoBatches(7)).toEqual([
			{ count: 3, positionStart: 1 },
			{ count: 3, positionStart: 4 },
			{ count: 1, positionStart: 7 },
		]);
	});

	it('returns empty array for zero count', () => {
		expect(splitChannelIntoBatches(0)).toEqual([]);
	});

	it('never exceeds MAX_ITEMS_PER_OPENAI_CALL per batch', () => {
		for (const total of [1, 2, 3, 4, 9, 11]) {
			const batches = splitChannelIntoBatches(total);
			expect(batches.every((b) => b.count <= MAX_ITEMS_PER_OPENAI_CALL)).toBe(true);
			expect(batches.reduce((sum, b) => sum + b.count, 0)).toBe(total);
		}
	});
});

describe('clampRequestedCountsForGeneration', () => {
	it('rejects unsupported channels', () => {
		const { counts, rejectedChannels } = clampRequestedCountsForGeneration(
			{ LinkedIn: 2, TikTok: 5 },
			'growth',
		);
		expect(counts.LinkedIn).toBe(2);
		expect(rejectedChannels).toContain('TikTok');
	});

	it('clamps channel counts to plan defaults', () => {
		const { counts } = clampRequestedCountsForGeneration({ LinkedIn: 99, X: 99 }, 'creator');
		expect(counts.LinkedIn).toBe(2);
		expect(counts.X).toBe(3);
	});

	it('keeps total within plan maximum when counts are inflated', () => {
		const { counts } = clampRequestedCountsForGeneration(
			{ LinkedIn: 99, X: 99, Blog: 99, Instagram: 99, Facebook: 99 },
			'growth',
		);
		const total = Object.values(counts).reduce((sum, n) => sum + n, 0);
		expect(total).toBe(9);
	});
});
