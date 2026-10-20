import { describe, expect, it, vi } from 'vitest';

describe('buildMetaDueDiagnostics', () => {
	it('explains when a content job is queued but scheduled in the future', async () => {
		const chain: Record<string, unknown> = {};
		chain.select = vi.fn(() => chain);
		chain.in = vi.fn(async () => ({
			data: [
				{
					id: 'job-1',
					platform: 'instagram',
					status: 'queued',
					scheduled_time: '2026-10-20T18:31:00.000Z',
					next_attempt_at: null,
					attempts: 0,
					error_message: null,
					remote_post_id: null,
					updated_at: '2026-10-20T17:35:00.000Z',
					content_item_key: 'content-95',
				},
			],
		}));

		const admin = { from: vi.fn(() => chain) } as never;
		const { buildMetaDueDiagnostics } = await import('@/lib/publish/metaDueDiagnostics');
		const diagnostics = await buildMetaDueDiagnostics(admin, {
			now: '2026-10-20T18:00:00.000Z',
			metaPublishingEnabled: true,
			dueJobsFound: 0,
			contentItemKey: 'content-95',
		});

		expect(diagnostics.dueJobsFound).toBe(0);
		expect(diagnostics.jobInventory.queuedNotYetDue).toBe(1);
		expect(diagnostics.contentJob?.notDueReason).toBe('scheduled_time_in_future');
	});
});
