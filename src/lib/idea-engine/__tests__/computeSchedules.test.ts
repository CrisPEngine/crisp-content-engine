import { describe, expect, it } from 'vitest';
import { computeItemSchedules } from '../generator/computeSchedules';

describe('computeItemSchedules', () => {
	it('assigns unique future ISO times per item', () => {
		const items = computeItemSchedules(
			[
				{
					channel: 'LinkedIn',
					body_draft: 'Post one',
					series_position: 1,
					series_total: 2,
				},
				{
					channel: 'LinkedIn',
					body_draft: 'Post two',
					series_position: 2,
					series_total: 2,
				},
			],
			{ timezone: 'UTC', postingWindows: null },
		);

		expect(items[0]?.scheduled_time).toBeTruthy();
		expect(items[1]?.scheduled_time).toBeTruthy();
		expect(items[0]?.scheduled_time).not.toBe(items[1]?.scheduled_time);
		const t0 = new Date(items[0]!.scheduled_time!).getTime();
		const t1 = new Date(items[1]!.scheduled_time!).getTime();
		expect(t1).toBeGreaterThan(t0);
	});
});
