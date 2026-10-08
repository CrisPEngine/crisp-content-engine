import { describe, expect, it, vi, beforeEach } from 'vitest';
import { decodeThreadsShortcodeToMediaId, parseThreadsPostUrl } from '../shortcode';
import { resolveThreadsTargetPost } from '../resolvePostUrl';

describe('parseThreadsPostUrl', () => {
	it('parses @user/post short links', () => {
		const parsed = parseThreadsPostUrl('https://www.threads.net/@folian/post/AbCdEf');
		expect(parsed?.username).toBe('folian');
		expect(parsed?.shortcode).toBe('AbCdEf');
	});
});

describe('decodeThreadsShortcodeToMediaId', () => {
	it('decodes a non-empty id for valid alphabet chars', () => {
		const id = decodeThreadsShortcodeToMediaId('Ab');
		expect(id).toMatch(/^\d+$/);
	});
});

describe('resolveThreadsTargetPost', () => {
	beforeEach(() => {
		vi.restoreAllMocks();
	});

	it('uses provided numeric externalPostId', async () => {
		const resolved = await resolveThreadsTargetPost({ externalPostId: '1234567890' });
		expect(resolved.mediaId).toBe('1234567890');
		expect(resolved.method).toBe('provided_id');
	});

	it('falls back to shortcode decode without token', async () => {
		const resolved = await resolveThreadsTargetPost({
			targetUrl: 'https://www.threads.net/@someone/post/Ab',
		});
		expect(resolved.method).toBe('shortcode_fallback');
		expect(resolved.mediaId).toMatch(/^\d+$/);
	});

	it('prefers official profile match when API returns a post', async () => {
		vi.spyOn(global, 'fetch').mockImplementation(async (input) => {
			const url = String(input);
			if (url.includes('profile_lookup')) {
				return new Response(JSON.stringify({ id: '999' }), { status: 200 });
			}
			if (url.includes('/999/threads')) {
				return new Response(
					JSON.stringify({
						data: [{ id: '555', permalink: 'https://www.threads.net/@someone/post/Ab', username: 'someone' }],
					}),
					{ status: 200 },
				);
			}
			return new Response('{}', { status: 404 });
		});

		const resolved = await resolveThreadsTargetPost({
			targetUrl: 'https://www.threads.net/@someone/post/Ab',
			accessToken: 'token',
		});
		expect(resolved.mediaId).toBe('555');
		expect(resolved.method).toBe('official_profile');
	});
});
