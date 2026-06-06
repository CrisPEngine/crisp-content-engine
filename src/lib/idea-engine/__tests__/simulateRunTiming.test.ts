import { describe, expect, it } from 'vitest';
import {
	estimateMaxItemsBeforeLimit,
	simulateIdeaEngineRunTiming,
} from '../observability/simulateRunTiming';

/** Representative 9-item run: 1 Blog, 3 LinkedIn, 5 X (growth/pro-style mix). */
const NINE_ITEM_RUN = { Blog: 1, LinkedIn: 3, X: 5 };

describe('simulateIdeaEngineRunTiming', () => {
	it('models the 9-item run as 4 sequential OpenAI batches in channel order', () => {
		const result = simulateIdeaEngineRunTiming({
			requestedCounts: NINE_ITEM_RUN,
			openAiBatchDurationMs: 50_000,
		});

		expect(result.itemCount).toBe(9);
		expect(result.batchCount).toBe(4);
		expect(result.batches.map((b) => `${b.channel}:${b.itemCount}`)).toEqual([
			'LinkedIn:3',
			'X:3',
			'X:2',
			'Blog:1',
		]);
	});

	it('produces timing report for observed Vercel-timeout scenario (~50s per batch)', () => {
		const result = simulateIdeaEngineRunTiming({
			requestedCounts: NINE_ITEM_RUN,
			openAiBatchDurationMs: 50_000,
			persistencePerBatchMs: 200,
			contextLoadMs: 2_500,
		});

		// Sequential: 2500 + 4 * (50000 + 200) = 203_300ms (~3.4 min)
		// Parallel channels: 2500 + max(LinkedIn 50200, X 100400, Blog 50200) = 102_900ms
		expect(result.sequentialTotalMs).toBe(203_300);
		expect(result.parallelChannelsTotalMs).toBe(102_900);
		expect(result.estimatedSavingsMs).toBe(100_400);
	});

	it('exceeds 300s Vercel limit when OpenAI batches average 75s', () => {
		const result = simulateIdeaEngineRunTiming({
			requestedCounts: NINE_ITEM_RUN,
			openAiBatchDurationMs: 75_000,
		});

		// 2500 + 4 * 75200 = 303_300ms
		expect(result.sequentialTotalMs).toBeGreaterThan(300_000);
		expect(result.parallelChannelsTotalMs).toBeLessThan(300_000);
	});

	it('estimates safe item volume before 300s limit', () => {
		const at50s = estimateMaxItemsBeforeLimit({
			vercelLimitMs: 300_000,
			openAiBatchDurationMs: 50_000,
		});
		const at75s = estimateMaxItemsBeforeLimit({
			vercelLimitMs: 300_000,
			openAiBatchDurationMs: 75_000,
		});

		expect(at50s).toBe(15);
		expect(at75s).toBe(9);
	});
});
