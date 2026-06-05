import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/featureFlags', () => ({
	isIdeaEngineNativeEnabled: vi.fn(),
}));

vi.mock('@/lib/supabaseService', () => ({
	getSupabaseService: vi.fn(),
}));

import { isIdeaEngineNativeEnabled } from '@/lib/featureFlags';
import { POST as callbackPost } from '../callback/route';
import { POST as itemUpdatePost } from '../item-update/route';

describe('legacy Make webhook routes', () => {
	beforeEach(() => {
		vi.mocked(isIdeaEngineNativeEnabled).mockReset();
	});

	it('callback returns 410 when native Idea Engine is enabled', async () => {
		vi.mocked(isIdeaEngineNativeEnabled).mockReturnValue(true);
		const response = await callbackPost(
			new Request('https://example.com/api/idea-engine/webhook/callback', { method: 'POST' }),
		);
		expect(response.status).toBe(410);
	});

	it('item-update returns 410 when native Idea Engine is enabled', async () => {
		vi.mocked(isIdeaEngineNativeEnabled).mockReturnValue(true);
		const response = await itemUpdatePost(
			new Request('https://example.com/api/idea-engine/webhook/item-update', { method: 'POST' }),
		);
		expect(response.status).toBe(410);
	});

	it('callback does not return 410 when native is disabled', async () => {
		vi.mocked(isIdeaEngineNativeEnabled).mockReturnValue(false);
		const response = await callbackPost(
			new Request('https://example.com/api/idea-engine/webhook/callback', { method: 'POST' }),
		);
		expect(response.status).not.toBe(410);
	});
});
