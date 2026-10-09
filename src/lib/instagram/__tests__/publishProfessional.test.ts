import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { publishInstagramProfessional } from '@/lib/instagram/oauth';

describe('publishInstagramProfessional', () => {
	const fetchMock = vi.fn();

	beforeEach(() => {
		vi.stubGlobal('fetch', fetchMock);
		fetchMock.mockReset();
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('polls container status before media_publish when an image is attached', async () => {
		const calls: string[] = [];
		fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
			calls.push(url);
			if (url.includes('/media_publish')) {
				return new Response(JSON.stringify({ id: 'published-media' }), { status: 200 });
			}
			if (url.includes('fields=status_code')) {
				return new Response(JSON.stringify({ status_code: 'FINISHED' }), { status: 200 });
			}
			if (url.includes('/media') && init?.method === 'POST') {
				return new Response(JSON.stringify({ id: 'container-123' }), { status: 200 });
			}
			return new Response('unexpected', { status: 500 });
		});

		const result = await publishInstagramProfessional({
			igUserId: '178414000',
			accessToken: 'token',
			caption: 'Hello',
			imageUrl: 'https://cdn.example.com/post.jpg',
		});

		expect(result.success).toBe(true);
		expect(result.mediaId).toBe('published-media');
		expect(calls.some((url) => url.includes('container-123') && url.includes('status_code'))).toBe(true);
		const publishIndex = calls.findIndex((url) => url.includes('media_publish'));
		const statusIndex = calls.findIndex((url) => url.includes('status_code'));
		expect(statusIndex).toBeGreaterThan(-1);
		expect(publishIndex).toBeGreaterThan(statusIndex);
	});

	it('returns a retry-friendly error when the container never becomes ready', async () => {
		vi.useFakeTimers();
		fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
			if (url.includes('/media_publish')) {
				return new Response(JSON.stringify({ error: { message: 'media not ready', code: 2207027 } }), { status: 400 });
			}
			if (url.includes('fields=status_code')) {
				return new Response(JSON.stringify({ status_code: 'IN_PROGRESS' }), { status: 200 });
			}
			if (url.includes('/media') && init?.method === 'POST') {
				return new Response(JSON.stringify({ id: 'container-456' }), { status: 200 });
			}
			return new Response('unexpected', { status: 500 });
		});

		const promise = publishInstagramProfessional({
			igUserId: '178414000',
			accessToken: 'token',
			caption: 'Hello',
			imageUrl: 'https://cdn.example.com/post.jpg',
		});
		await vi.runAllTimersAsync();
		const result = await promise;
		vi.useRealTimers();

		expect(result.success).toBe(false);
		expect(result.error).toMatch(/did not become ready/);
		expect(fetchMock.mock.calls.some(([url]) => String(url).includes('media_publish'))).toBe(false);
	});
});
