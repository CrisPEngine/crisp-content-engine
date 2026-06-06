import { describe, expect, it } from 'vitest';
import { IDEA_ENGINE_RUN_MAX_TOTAL } from '@/lib/ideaEngineLimits';
import {
	CHANNEL_GENERATION_CONCURRENCY,
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

	it('clamps channel counts to per-run max', () => {
		const { counts } = clampRequestedCountsForGeneration({ LinkedIn: 99, X: 99 }, 'growth');
		expect(counts.LinkedIn).toBe(2);
		expect(counts.X).toBe(4);
	});

	it('enforces total run cap of 7', () => {
		const { counts } = clampRequestedCountsForGeneration(
			{ LinkedIn: 2, X: 4, Blog: 1, Instagram: 2, Facebook: 2 },
			'growth',
		);
		const total = Object.values(counts).reduce((sum, n) => sum + n, 0);
		expect(total).toBeLessThanOrEqual(IDEA_ENGINE_RUN_MAX_TOTAL);
	});

	it('uses bounded parallel channel concurrency constant', () => {
		expect(CHANNEL_GENERATION_CONCURRENCY).toBeGreaterThanOrEqual(2);
		expect(CHANNEL_GENERATION_CONCURRENCY).toBeLessThanOrEqual(3);
	});
});
