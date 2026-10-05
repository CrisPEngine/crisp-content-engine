import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { instagramOAuthScopes, instagramAuthorizeUrl } from '@/lib/instagram/oauth';

describe('instagram oauth config', () => {
	const env = process.env;

	beforeEach(() => {
		process.env = { ...env, INSTAGRAM_APP_ID: '111', INSTAGRAM_APP_SECRET: 'secret' };
		delete process.env.META_APP_ID;
	});

	afterEach(() => {
		process.env = env;
	});

	it('requests only publish scopes', () => {
		expect(instagramOAuthScopes()).toEqual(['instagram_business_basic', 'instagram_business_content_publish']);
	});

	it('uses INSTAGRAM_APP_ID in authorize URL', () => {
		const url = new URL(instagramAuthorizeUrl('state123'));
		expect(url.searchParams.get('client_id')).toBe('111');
		expect(url.searchParams.get('scope')).toBe('instagram_business_basic,instagram_business_content_publish');
		expect(url.hostname).toBe('www.instagram.com');
	});
});
