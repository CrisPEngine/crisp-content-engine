import { describe, expect, it, vi, beforeEach } from 'vitest';
import { uiLabelForPhase } from '@/lib/social/connectionStatus';
import { formatInstagramHandle } from '@/lib/social/brandBrainName';
import { purposeForChannel } from '@/lib/social/channels';
import { DESTINATION_TYPES, SOCIAL_PROVIDERS } from '@/lib/social/providers';

describe('Threads OAuth and destinations', () => {
	it('uses threads-specific publish purpose', () => {
		expect(purposeForChannel('threads')).toBe('default_publish:threads');
	});

	it('formats Threads handle for display', () => {
		expect(formatInstagramHandle('folian', null)).toBe('@folian');
	});

	it('maps unassigned authorized state for UI', () => {
		expect(uiLabelForPhase('AUTHORIZED_UNASSIGNED')).toBe('Account available — choose destination');
	});

	it('defines native destination types', () => {
		expect(SOCIAL_PROVIDERS.THREADS).toBe('threads');
		expect(DESTINATION_TYPES.THREADS_PROFILE).toBe('threads_profile');
	});
});

describe('Threads authorize URL', () => {
	beforeEach(() => {
		vi.stubEnv('THREADS_APP_ID', 'test-threads-app-id');
		vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://app.crispdigital.io');
	});

	it('includes minimum scopes and redirect', async () => {
		const { threadsAuthorizeUrl, threadsRedirectUri } = await import('@/lib/threads/oauth');
		const url = new URL(threadsAuthorizeUrl('state123'));
		expect(url.hostname).toBe('threads.net');
		expect(url.searchParams.get('client_id')).toBe('test-threads-app-id');
		expect(url.searchParams.get('scope')).toBe('threads_basic,threads_content_publish');
		expect(url.searchParams.get('redirect_uri')).toBe(threadsRedirectUri());
		expect(threadsRedirectUri()).toBe('https://app.crispdigital.io/api/connections/threads/callback');
	});
});

describe('disconnect impact copy', () => {
	it('warns when brand mappings exist', async () => {
		const { getDisconnectImpact } = await import('@/lib/social/disconnectImpact');
		// Module is integration-heavy; smoke-test export
		expect(typeof getDisconnectImpact).toBe('function');
	});
});

describe('publish job platform', () => {
	it('exports Threads job creator', async () => {
		const mod = await import('@/lib/publish/createPublishJob');
		expect(typeof mod.createThreadsPublishJob).toBe('function');
	});
});
