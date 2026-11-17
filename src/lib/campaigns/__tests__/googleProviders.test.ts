import { afterEach, describe, expect, it, vi } from 'vitest';
import { analyticsSignals, searchConsoleSignals } from '@/lib/campaigns/analyticsSignals';
import { fetchGa4Report } from '@/lib/campaigns/ga4';
import { getGoogleAccessToken, parseServiceAccount } from '@/lib/campaigns/googleAuth';
import { resolveBrandProperties } from '@/lib/campaigns/googleConfig';
import { providerStatus } from '@/lib/campaigns/providers';
import { createMemoryOpportunityRepository, setOpportunityRepositoryForTests } from '@/lib/campaigns/repository';
import { fetchSearchConsoleReport } from '@/lib/campaigns/searchConsole';
import { testBrandAnalytics } from '@/lib/campaigns/service';
import { createMemoryNativeContentStore, setNativeContentStoreForTests } from '@/lib/media/store';

vi.mock('google-auth-library', () => ({
	JWT: class {
		email: string;
		key: string;
		scopes: string[];
		constructor(options: { email: string; key: string; scopes: string[] }) {
			this.email = options.email;
			this.key = options.key;
			this.scopes = options.scopes;
		}
		async getAccessToken() {
			if (this.key.includes('REJECT-THIS-KEY')) throw new Error(`invalid_grant ${this.key}`);
			return { token: 'ya29.mocked' };
		}
	},
}));

const secret = '-----BEGIN PRIVATE KEY-----\nREJECT-THIS-KEY\n-----END PRIVATE KEY-----';
const account = JSON.stringify({
	client_email: 'reader@example.iam.gserviceaccount.com',
	private_key: '-----BEGIN PRIVATE KEY-----\nnot-a-real-key\n-----END PRIVATE KEY-----',
});

function jsonResponse(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

describe('Google provider credentials', () => {
	it('rejects invalid service account JSON without repeating the secret', () => {
		expect(() => parseServiceAccount('not-json')).toThrow(/not valid service-account JSON/);
		expect(() => parseServiceAccount(JSON.stringify({ client_email: 'reader@example.com', private_key: 'SECRET-VALUE-SHOULD-NOT-LEAK' }))).toThrow(/missing client_email or private_key/);
		try {
			parseServiceAccount(JSON.stringify({ client_email: 'reader@example.com', private_key: 'SECRET-VALUE-SHOULD-NOT-LEAK' }));
		} catch (error) {
			expect(error instanceof Error ? error.message : '').not.toContain('SECRET-VALUE-SHOULD-NOT-LEAK');
		}
	});

	it('mocked: exchanges a service account for an access token and keeps the OAuth access-token option', async () => {
		const token = await getGoogleAccessToken({ env: { GOOGLE_SERVICE_ACCOUNT_JSON: account }, scopes: ['https://www.googleapis.com/auth/webmasters.readonly'] });
		expect(token).toBe('ya29.mocked');
		const oauth = await getGoogleAccessToken({ env: { GOOGLE_SEARCH_CONSOLE_ACCESS_TOKEN: 'oauth-token' }, scopes: [] });
		expect(oauth).toBe('oauth-token');
	});

	it('mocked: hides the private key when the authentication library rejects the account', async () => {
		const env = { GOOGLE_SERVICE_ACCOUNT_JSON: JSON.stringify({ client_email: 'reader@example.iam.gserviceaccount.com', private_key: secret }) };
		await expect(getGoogleAccessToken({ env, scopes: ['https://www.googleapis.com/auth/webmasters.readonly'] })).rejects.toThrow(/rejected the service account credentials/);
		try {
			await getGoogleAccessToken({ env, scopes: ['https://www.googleapis.com/auth/webmasters.readonly'] });
		} catch (error) {
			expect(error instanceof Error ? error.message : '').not.toContain('REJECT-THIS-KEY');
		}
	});
});

describe('mocked Search Console retrieval', () => {
	it('paginates query and page rows and leaves missing metrics null', async () => {
		const fetchImpl = (async (_url: string, init?: RequestInit) => {
			const body = JSON.parse(String(init?.body)) as { dimensions: string[]; startRow: number };
			if (body.startRow > 0) return jsonResponse({ rows: [] });
			if (body.dimensions.join() === 'query') {
				return jsonResponse({ rows: [{ keys: ['plan a novel'], clicks: 4, impressions: 80, ctr: 0.05, position: 12 }, { keys: ['story bible'], clicks: 0 }] });
			}
			if (body.dimensions.join() === 'page') return jsonResponse({ rows: [{ keys: ['https://example.com/plan'], impressions: 80, clicks: 4, ctr: 0.05, position: 12 }] });
			return jsonResponse({ rows: [{ keys: ['plan a novel', 'https://example.com/plan'], impressions: 80, clicks: 4, ctr: 0.05, position: 12 }] });
		}) as typeof fetch;
		const report = await fetchSearchConsoleReport({
			siteUrl: 'sc-domain:example.com',
			startDate: '2026-10-01',
			endDate: '2026-10-28',
			accessToken: 'ya29.mocked',
			fetchImpl,
			pageSize: 2,
			maxRows: 10,
		});
		expect(report.queries).toEqual([
			{ query: 'plan a novel', clicks: 4, impressions: 80, ctr: 0.05, position: 12 },
			{ query: 'story bible', clicks: 0, impressions: null, ctr: null, position: null },
		]);
		expect(report.pages).toHaveLength(1);
		expect(report.queryPages[0]?.page).toBe('https://example.com/plan');
		expect(report.retrievedAt).toEqual(expect.any(String));
	});

	it('mocked: reports permission and quota failures', async () => {
		const forbidden = (async () => jsonResponse({ error: { message: 'User does not have sufficient permission.' } }, 403)) as typeof fetch;
		await expect(fetchSearchConsoleReport({
			siteUrl: 'sc-domain:example.com', startDate: '2026-10-01', endDate: '2026-10-28', accessToken: 'ya29.mocked', fetchImpl: forbidden,
		})).rejects.toMatchObject({ code: 'search_console_forbidden' });
		const quota = (async () => jsonResponse({ error: { message: 'Quota exceeded' } }, 429)) as typeof fetch;
		await expect(fetchSearchConsoleReport({
			siteUrl: 'sc-domain:example.com', startDate: '2026-10-01', endDate: '2026-10-28', accessToken: 'ya29.mocked', fetchImpl: quota,
		})).rejects.toMatchObject({ code: 'search_console_quota' });
	});
});

describe('mocked GA4 retrieval', () => {
	it('keeps an unconfigured key event unavailable and preserves a real zero', async () => {
		const fetchImpl = (async (url: string, init?: RequestInit) => {
			if (String(url).endsWith('/metadata')) return jsonResponse({ metrics: [{ apiName: 'sessions' }, { apiName: 'engagementRate' }] });
			const body = JSON.parse(String(init?.body)) as { dimensions?: unknown[] };
			if (body.dimensions) return jsonResponse({ rows: [] });
			return jsonResponse({ rows: [{ metricValues: [{ value: '0' }, { value: '0.5' }, { value: '' }] }] });
		}) as typeof fetch;
		const report = await fetchGa4Report({
			propertyId: 'properties/123456',
			startDate: '2026-10-01',
			endDate: '2026-10-28',
			accessToken: 'ya29.mocked',
			fetchImpl,
		});
		expect(report.propertyId).toBe('123456');
		expect(report.keyEvents).toBe('unavailable');
		expect(report.organic.sessions).toBe(0);
		expect(report.organic.keyEvents).toBeNull();
		expect(report.organic.averageSessionDuration).toBeNull();
	});

	it('mocked: paginates landing pages and reports permission failures', async () => {
		const calls: number[] = [];
		const fetchImpl = (async (url: string, init?: RequestInit) => {
			if (String(url).endsWith('/metadata')) return jsonResponse({ metrics: [{ apiName: 'keyEvents' }] });
			const body = JSON.parse(String(init?.body)) as { offset?: number; dimensions?: unknown[]; metrics?: Array<{ name: string }> };
			if (!body.dimensions) return jsonResponse({ rows: [{ metricValues: [{ value: '3' }, { value: '0.4' }, { value: '12' }, { value: '0' }] }] });
			if (body.metrics?.length === 1) return jsonResponse({ rows: [] });
			calls.push(body.offset ?? 0);
			if ((body.offset ?? 0) === 0) return jsonResponse({ rows: [{ dimensionValues: [{ value: '/journal' }], metricValues: [{ value: '3' }, { value: '0.8' }, { value: '20' }, { value: '1' }] }] });
			return jsonResponse({ rows: [] });
		}) as typeof fetch;
		const report = await fetchGa4Report({
			propertyId: '123456', startDate: '2026-10-01', endDate: '2026-10-28', accessToken: 'ya29.mocked', fetchImpl, pageSize: 1, maxRows: 5,
		});
		expect(calls).toEqual([0, 1]);
		expect(report.keyEvents).toBe('included');
		expect(report.organic.keyEvents).toBe(0);
		expect(report.landingPages[0]?.landingPage).toBe('/journal');
		const forbidden = (async () => jsonResponse({ error: { message: 'Permission denied' } }, 403)) as typeof fetch;
		await expect(fetchGa4Report({
			propertyId: '123456', startDate: '2026-10-01', endDate: '2026-10-28', accessToken: 'ya29.mocked', fetchImpl: forbidden,
		})).rejects.toMatchObject({ code: 'ga4_forbidden' });
	});
});

describe('brand-scoped analytics', () => {
	afterEach(() => {
		setOpportunityRepositoryForTests(undefined);
		setNativeContentStoreForTests(undefined);
	});

	it('does not let one brand read another brand property', async () => {
		const repository = createMemoryOpportunityRepository();
		setOpportunityRepositoryForTests(repository);
		setNativeContentStoreForTests(createMemoryNativeContentStore());
		const env = {
			GOOGLE_SERVICE_ACCOUNT_JSON: account,
			GOOGLE_SEARCH_CONSOLE_SITE_URL: 'sc-domain:one.example',
			GOOGLE_SEARCH_CONSOLE_BRAND_ID: 'brand-a',
			GOOGLE_ANALYTICS_PROPERTY_ID: '123456',
			GOOGLE_ANALYTICS_BRAND_ID: 'brand-a',
		};
		const calls: string[] = [];
		const fetchImpl = (async (url: string) => {
			calls.push(String(url));
			return jsonResponse({ error: { message: 'nope' } }, 500);
		}) as typeof fetch;
		const other = await testBrandAnalytics('user-1', 'brand-b', { env, fetchImpl });
		expect(other.searchConsole.property).toBeNull();
		expect(other.analytics.property).toBeNull();
		expect(calls).toEqual([]);
		expect(await repository.getBinding('user-1', 'brand-b')).toBeNull();
		await testBrandAnalytics('user-1', 'brand-a', { env, fetchImpl, tokenClient: { getAccessToken: async () => ({ token: 'ya29.mocked' }) } });
		expect(calls.some((url) => url.includes(encodeURIComponent('sc-domain:one.example')))).toBe(true);
		expect(calls.some((url) => url.includes('/properties/123456'))).toBe(true);
		expect(await repository.list('user-1', 'brand-a')).toEqual([]);
		const bound = await repository.getBinding('user-1', 'brand-a');
		expect(bound?.searchConsoleSiteUrl).toBe('sc-domain:one.example');
		expect(await repository.getBinding('user-1', 'brand-b')).toBeNull();
	});

	it('classifies observed search evidence separately from GA4 engagement', () => {
		const signals = searchConsoleSignals({
			siteUrl: 'sc-domain:example.com',
			startDate: '2026-10-01',
			endDate: '2026-10-28',
			retrievedAt: '2026-10-28T00:00:00.000Z',
			queries: [{ query: 'plan a novel', impressions: 80, clicks: 2, ctr: 0.025, position: 14 }],
			pages: [],
			queryPages: [{ query: 'plan a novel', page: 'https://example.com/journal/plan', impressions: 80, clicks: 2, ctr: 0.025, position: 14 }],
		}, [{ id: 'article-1', title: 'Plan', topic: 'Plan', keyword: null, intent: null, status: 'published', url: 'https://example.com/journal/plan' }]);
		expect(signals.map((item) => item.kind)).toEqual(['low_ctr', 'outside_leading_positions', 'improvement_candidate']);
		expect(signals.every((item) => item.impressions === 80)).toBe(true);
		const engagement = analyticsSignals({
			propertyId: '123',
			startDate: '2026-10-01',
			endDate: '2026-10-28',
			retrievedAt: '2026-10-28T00:00:00.000Z',
			keyEvents: 'unavailable',
			organic: { sessions: null, engagementRate: null, averageSessionDuration: null, keyEvents: null },
			landingPages: [{ landingPage: '/journal', sessions: 4, engagementRate: 0.8, averageSessionDuration: 20, keyEvents: null }],
			sources: [],
		});
		expect(engagement[0]?.rationale).toContain('not evidence of search demand');
	});

	it('shows connected, unavailable, and error states for the bound brand', () => {
		const env = { GOOGLE_SERVICE_ACCOUNT_JSON: account, GOOGLE_SEARCH_CONSOLE_BRAND_ID: 'brand-a', GOOGLE_SEARCH_CONSOLE_SITE_URL: 'sc-domain:one.example' };
		expect(resolveBrandProperties('brand-b', env, null).searchConsoleSiteUrl).toBeNull();
		const unavailable = providerStatus({ env, brandId: 'brand-a', binding: null }).find((item) => item.id === 'search_console');
		expect(unavailable?.state).toBe('unavailable');
		expect(unavailable?.property).toBe('sc-domain:one.example');
		const connected = providerStatus({
			env,
			brandId: 'brand-a',
			binding: {
				brandId: 'brand-a',
				searchConsoleSiteUrl: 'sc-domain:one.example',
				ga4PropertyId: null,
				searchConsoleLastSuccessAt: '2026-10-28T00:00:00.000Z',
				searchConsoleLastError: null,
				ga4LastSuccessAt: null,
				ga4LastError: null,
			},
		}).find((item) => item.id === 'search_console');
		expect(connected?.state).toBe('connected');
		const errored = providerStatus({
			env,
			brandId: 'brand-a',
			binding: {
				brandId: 'brand-a',
				searchConsoleSiteUrl: 'sc-domain:one.example',
				ga4PropertyId: '123',
				searchConsoleLastSuccessAt: null,
				searchConsoleLastError: 'Permission denied',
				ga4LastSuccessAt: null,
				ga4LastError: 'Permission denied',
			},
		});
		expect(errored.find((item) => item.id === 'search_console')?.state).toBe('error');
		expect(errored.find((item) => item.id === 'analytics')?.state).toBe('error');
	});
});
