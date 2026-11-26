import { describe, expect, it } from 'vitest';
import { consumesWeeklyCapacity, productionCapacity } from '@/lib/campaigns/productionPolicy';

describe('weekly production capacity', () => {
	it('does not count needs_attention or failed jobs against the weekly slot', () => {
		const now = Date.parse('2026-11-26T18:48:24.000Z');
		const usage = productionCapacity([
			{ createdAt: '2026-11-26T18:48:24.000Z', status: 'needs_attention' },
			{ createdAt: '2026-11-20T01:00:00.000Z', status: 'ready_for_approval' },
		], now, 2);
		expect(usage.attempted).toBe(2);
		expect(usage.attention).toBe(1);
		expect(consumesWeeklyCapacity({ status: 'needs_attention' })).toBe(false);
		expect(usage.remaining).toBe(1);
	});
});