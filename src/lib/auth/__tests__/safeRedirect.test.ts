import { describe, expect, it } from 'vitest';
import { safeRedirectPath } from '@/lib/auth/safeRedirect';

describe('safeRedirectPath', () => {
	it('allows internal paths', () => {
		expect(safeRedirectPath('/approve/abc')).toBe('/approve/abc');
		expect(safeRedirectPath('/connections')).toBe('/connections');
	});

	it('blocks open redirects', () => {
		expect(safeRedirectPath('https://evil.com')).toBe('/dashboard');
		expect(safeRedirectPath('//evil.com')).toBe('/dashboard');
		expect(safeRedirectPath('/sign-in?x=1')).toBe('/dashboard');
	});

	it('falls back when empty', () => {
		expect(safeRedirectPath(null)).toBe('/dashboard');
	});
});
