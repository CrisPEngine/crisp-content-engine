import { beforeEach, describe, expect, it, vi } from 'vitest';

const update = vi.fn();
const maybeSingle = vi.fn();

function chain() {
	const builder: Record<string, unknown> = {};
	builder.select = vi.fn(() => builder);
	builder.eq = vi.fn(() => builder);
	builder.in = vi.fn(() => builder);
	builder.lt = vi.fn(() => builder);
	builder.order = vi.fn(() => builder);
	builder.limit = vi.fn(async () => ({ data: [], error: null }));
	builder.update = vi.fn((payload: unknown) => {
		update(payload);
		return { eq: vi.fn(() => ({ eq: vi.fn(() => ({ select: vi.fn(() => ({ maybeSingle })) })) })) };
	});
	return builder;
}

vi.mock('@/lib/supabaseService', () => ({
	getSupabaseService: vi.fn(() => ({
		from: vi.fn(() => chain()),
	})),
}));

vi.mock('@/lib/publish/agentMetaJob', () => ({
	applyMetaJobOutcomeToAgentContent: vi.fn(async () => true),
}));

vi.mock('@/lib/publish/agentThreadsJob', () => ({
	applyThreadsJobOutcomeToAgentContent: vi.fn(async () => true),
}));

describe('publish job lifecycle', () => {
	beforeEach(() => {
		update.mockClear();
		maybeSingle.mockReset();
	});

	it('detects stale publishing locks', async () => {
		const { isStalePublishingJob, STALE_PUBLISHING_AFTER_MS } = await import('@/lib/publish/publishJobLifecycle');
		const recent = new Date(Date.now() - STALE_PUBLISHING_AFTER_MS + 1000).toISOString();
		const old = new Date(Date.now() - STALE_PUBLISHING_AFTER_MS - 1000).toISOString();
		expect(isStalePublishingJob({ status: 'publishing', updated_at: recent })).toBe(false);
		expect(isStalePublishingJob({ status: 'publishing', updated_at: old })).toBe(true);
		expect(isStalePublishingJob({ status: 'queued', updated_at: old })).toBe(false);
	});
});

describe('publish cron auth', () => {
	it('accepts bearer and x-cron-secret', async () => {
		process.env.CRON_SECRET = 'test-secret';
		const { requirePublishCronAuth } = await import('@/lib/publish/cronAuth');
		expect(
			requirePublishCronAuth(
				new Request('https://example.com', { headers: { authorization: 'Bearer test-secret' } }),
			).ok,
		).toBe(true);
		expect(
			requirePublishCronAuth(new Request('https://example.com', { headers: { 'x-cron-secret': 'test-secret' } })).ok,
		).toBe(true);
		expect(requirePublishCronAuth(new Request('https://example.com')).ok).toBe(false);
	});
});
