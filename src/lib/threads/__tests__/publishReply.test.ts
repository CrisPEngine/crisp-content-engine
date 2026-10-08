import { describe, expect, it, vi } from 'vitest';
import { publishThreadsPost } from '../oauth';

describe('publishThreadsPost reply_to_id', () => {
	it('includes reply_to_id in container POST body', async () => {
		const calls: Array<{ url: string; body: string }> = [];
		const fetchImpl = async (input: RequestInfo | URL, init?: RequestInit) => {
			const url = String(input);
			const body = String(init?.body ?? '');
			calls.push({ url, body });
			if (url.includes('threads_publish')) {
				return new Response(JSON.stringify({ id: 'published-1' }), { status: 200 });
			}
			return new Response(JSON.stringify({ id: 'container-1' }), { status: 200 });
		};
		vi.stubGlobal('fetch', fetchImpl);

		const result = await publishThreadsPost({
			threadsUserId: '100',
			accessToken: 'tok',
			text: 'Nice thread',
			replyToId: '999',
		});
		expect(result.success).toBe(true);
		expect(calls[0]?.body).toContain('reply_to_id=999');
		vi.unstubAllGlobals();
	});
});
