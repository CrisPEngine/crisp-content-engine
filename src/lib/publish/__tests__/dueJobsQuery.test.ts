import { describe, expect, it, vi } from 'vitest';
import { duePublishJobsQuery, META_PUBLISH_PLATFORMS } from '@/lib/publish/dueJobsQuery';

function mockAdmin() {
	const inCalls: Array<[string, unknown]> = [];
	const chain: Record<string, unknown> = {};
	chain.select = vi.fn(() => chain);
	chain.in = vi.fn((column: string, values: unknown) => {
		inCalls.push([column, values]);
		return chain;
	});
	chain.lte = vi.fn(() => chain);
	chain.or = vi.fn(() => chain);
	chain.order = vi.fn(() => chain);
	chain.limit = vi.fn(() => Promise.resolve({ data: [], error: null }));
	const admin = { from: vi.fn(() => chain) };
	return { admin, inCalls, chain };
}

describe('duePublishJobsQuery', () => {
	it('restricts meta worker to facebook and instagram platforms', async () => {
		const { admin, inCalls } = mockAdmin();
		await duePublishJobsQuery(admin as never, { platforms: META_PUBLISH_PLATFORMS, now: '2026-10-06T12:00:00.000Z' });
		const platformFilter = inCalls.find(([col]) => col === 'platform');
		expect(platformFilter).toEqual(['platform', ['facebook', 'instagram']]);
	});

	it('threads worker filters to threads only', async () => {
		const { admin, inCalls } = mockAdmin();
		await duePublishJobsQuery(admin as never, { platforms: ['threads'], now: '2026-10-06T12:00:00.000Z' });
		const platformFilter = inCalls.find(([col]) => col === 'platform');
		expect(platformFilter).toEqual(['platform', ['threads']]);
	});
});
