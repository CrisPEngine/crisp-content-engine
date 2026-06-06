import { describe, expect, it } from 'vitest';
import { runWithConcurrency } from '../generator/runWithConcurrency';

describe('runWithConcurrency', () => {
	it('runs all tasks with a concurrency limit', async () => {
		const order: number[] = [];
		let inFlight = 0;
		let maxInFlight = 0;

		const tasks = Array.from({ length: 5 }, (_, i) => async () => {
			inFlight += 1;
			maxInFlight = Math.max(maxInFlight, inFlight);
			order.push(i);
			await new Promise((r) => setTimeout(r, 20));
			inFlight -= 1;
			return i;
		});

		const results = await runWithConcurrency(tasks, 2);
		expect(results).toEqual([0, 1, 2, 3, 4]);
		expect(maxInFlight).toBeLessThanOrEqual(2);
		expect(order).toHaveLength(5);
	});
});
