import { describe, expect, it } from 'vitest';
import {
	ApprovalQueueFetchError,
	fetchNativeApprovalQueue,
	shouldPollForGeneratingContent,
} from '@/lib/content/approvalQueueClient';

describe('approvalQueueClient', () => {
	it('shouldPollForGeneratingContent only when param set and queue empty', () => {
		expect(shouldPollForGeneratingContent(true, 0)).toBe(true);
		expect(shouldPollForGeneratingContent(true, 2)).toBe(false);
		expect(shouldPollForGeneratingContent(false, 0)).toBe(false);
	});

	it('fetchNativeApprovalQueue maps API items', async () => {
		const originalFetch = global.fetch;
		global.fetch = async () =>
			new Response(JSON.stringify({ items: [{ id: 'a' }] }), { status: 200 });
		try {
			const result = await fetchNativeApprovalQueue(
				{ stage: 'approval', platform: 'X', brandProfileId: 'brand-1' },
				{ origin: 'http://test', timeoutMs: 5_000 },
			);
			expect(result.items).toHaveLength(1);
		} finally {
			global.fetch = originalFetch;
		}
	});

	it('fetchNativeApprovalQueue throws timeout error when aborted by timeout', async () => {
		const originalFetch = global.fetch;
		global.fetch = (_input, init) =>
			new Promise((_resolve, reject) => {
				init?.signal?.addEventListener('abort', () => {
					reject(new DOMException('Timeout', 'TimeoutError'));
				});
			});
		try {
			await expect(
				fetchNativeApprovalQueue(
					{ stage: 'approval' },
					{ origin: 'http://test', timeoutMs: 5 },
				),
			).rejects.toMatchObject({
				code: 'timeout',
			} satisfies Partial<ApprovalQueueFetchError>);
		} finally {
			global.fetch = originalFetch;
		}
	});
});
