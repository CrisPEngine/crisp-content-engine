import { beforeEach, describe, expect, it, vi } from 'vitest';

const getUser = vi.fn(async () => ({ data: { user: { id: 'user-123' } } }));

vi.mock('@/lib/supabase/server', () => ({
	createClient: vi.fn(async () => ({
		auth: { getUser },
	})),
}));

describe('requireSessionUserId', () => {
	beforeEach(() => {
		getUser.mockClear();
	});

	it('returns the authenticated user id', async () => {
		const { requireSessionUserId } = await import('@/lib/agent/session');
		await expect(requireSessionUserId()).resolves.toBe('user-123');
		expect(getUser).toHaveBeenCalled();
	});
});
