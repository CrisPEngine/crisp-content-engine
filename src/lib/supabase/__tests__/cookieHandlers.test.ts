import { describe, expect, it, vi } from 'vitest';
import { createSupabaseServerCookieHandlers } from '@/lib/supabase/cookieHandlers';

describe('createSupabaseServerCookieHandlers', () => {
	it('swallows cookie set errors (Server Component render)', () => {
		const cookieStore = {
			get: vi.fn(),
			set: vi.fn(() => {
				throw new Error('Cookies can only be modified in a Server Action or Route Handler.');
			}),
		};
		const handlers = createSupabaseServerCookieHandlers(cookieStore as never);
		expect(() => handlers.set('sb-access-token', 'x', { path: '/' })).not.toThrow();
		expect(cookieStore.set).toHaveBeenCalled();
	});

	it('swallows cookie remove errors', () => {
		const cookieStore = {
			get: vi.fn(),
			set: vi.fn(() => {
				throw new Error('Cookies can only be modified in a Server Action or Route Handler.');
			}),
		};
		const handlers = createSupabaseServerCookieHandlers(cookieStore as never);
		expect(() => handlers.remove('sb-access-token', { path: '/' })).not.toThrow();
	});

	it('passes through cookie reads', () => {
		const cookieStore = {
			get: vi.fn(() => ({ value: 'abc' })),
			set: vi.fn(),
		};
		const handlers = createSupabaseServerCookieHandlers(cookieStore as never);
		expect(handlers.get('sb-access-token')).toBe('abc');
	});
});
