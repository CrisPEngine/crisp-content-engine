import { describe, expect, it, vi } from 'vitest';
import { applyPublishTargetSpacing } from '@/lib/publish/publishJobSpacing';

describe('applyPublishTargetSpacing', () => {
	it('excludes the current content row from spacing and keeps the requested time', async () => {
		const chain: Record<string, unknown> = {};
		chain.select = vi.fn(() => chain);
		chain.eq = vi.fn(() => chain);
		chain.in = vi.fn(() => chain);
		chain.neq = vi.fn(() => chain);
		chain.order = vi.fn(() => chain);
		chain.limit = vi.fn(async () => ({ data: [] }));

		const admin = { from: vi.fn(() => chain) } as never;
		const result = await applyPublishTargetSpacing(admin, {
			platform: 'instagram',
			targetId: 'ig-1',
			scheduledTime: new Date('2026-10-20T17:35:00.000Z'),
			excludeContentItemKey: 'content-95',
		});

		expect(chain.neq).toHaveBeenCalledWith('content_item_key', 'content-95');
		expect(result.scheduledTime.toISOString()).toBe('2026-10-20T17:35:00.000Z');
		expect(result.spacingCapped).toBe(false);
	});

	it('does not push a reschedule later than the requested ceiling', async () => {
		const chain: Record<string, unknown> = {};
		chain.select = vi.fn(() => chain);
		chain.eq = vi.fn(() => chain);
		chain.in = vi.fn(() => chain);
		chain.neq = vi.fn(() => chain);
		chain.order = vi.fn(() => chain);
		chain.limit = vi.fn(async () => ({
			data: [{ scheduled_time: '2026-10-20T20:20:00.000Z' }],
		}));

		const admin = { from: vi.fn(() => chain) } as never;
		const requested = new Date('2026-10-20T20:20:00.000Z');
		const result = await applyPublishTargetSpacing(admin, {
			platform: 'instagram',
			targetId: 'ig-1',
			scheduledTime: requested,
			excludeContentItemKey: '95c337f7-128f-43ef-a547-733118dd70b4',
			requestedCeiling: requested,
		});

		expect(result.scheduledTime.toISOString()).toBe('2026-10-20T20:20:00.000Z');
		expect(result.spacingCapped).toBe(true);
	});
});
