import { googleAuthMode, serviceAccountEmail } from './googleAuth';
import { resolveBrandProperties } from './googleConfig';
import type { AnalyticsBinding, ProviderAvailability } from './types';

function googleState(input: { configured: boolean; bound: boolean; lastSuccessAt: string | null; lastError: string | null; bindingError: string | null }): 'connected' | 'unavailable' | 'error' {
	if (input.bindingError || input.lastError) return 'error';
	if (input.configured && input.bound && input.lastSuccessAt) return 'connected';
	return 'unavailable';
}

export function providerStatus(input: {
	env?: Record<string, string | undefined>;
	brandId: string;
	binding?: AnalyticsBinding | null;
}): ProviderAvailability[] {
	const env = input.env ?? process.env;
	const searchConfigured = Boolean(env.TAVILY_API_KEY?.trim() || env.BRAVE_SEARCH_API_KEY?.trim());
	const auth = googleAuthMode(env);
	const properties = resolveBrandProperties(input.brandId, env, input.binding ?? null);
	const account = serviceAccountEmail(env);
	const searchConsoleState = googleState({
		configured: auth !== 'none',
		bound: Boolean(properties.searchConsoleSiteUrl),
		lastSuccessAt: input.binding?.searchConsoleLastSuccessAt ?? null,
		lastError: input.binding?.searchConsoleLastError ?? null,
		bindingError: properties.bindingError,
	});
	const analyticsState = googleState({
		configured: auth !== 'none',
		bound: Boolean(properties.ga4PropertyId),
		lastSuccessAt: input.binding?.ga4LastSuccessAt ?? null,
		lastError: input.binding?.ga4LastError ?? null,
		bindingError: properties.bindingError,
	});
	return [
		{ id: 'inventory', label: 'Existing articles', state: 'available', detail: 'Overlap uses articles already stored for the selected brand.' },
		{ id: 'strategy', label: 'Approved strategy and themes', state: 'available', detail: 'Themes can be recorded as strategic suggestions. They are not treated as measured demand.' },
		{
			id: 'search',
			label: 'Search research',
			state: searchConfigured ? 'available' : 'unavailable',
			detail: searchConfigured
				? `Using ${env.RESEARCH_SEARCH_PROVIDER?.trim() || 'tavily'}. Results are evidence of coverage, not keyword volume.`
				: 'Set TAVILY_API_KEY or BRAVE_SEARCH_API_KEY, and optionally RESEARCH_SEARCH_PROVIDER, to retrieve public search results.',
		},
		{
			id: 'search_console',
			label: 'Google Search Console',
			state: searchConsoleState,
			property: properties.searchConsoleSiteUrl,
			lastSuccessAt: input.binding?.searchConsoleLastSuccessAt ?? null,
			error: input.binding?.searchConsoleLastError ?? properties.bindingError,
			detail: searchConsoleDetail(auth, properties.searchConsoleSiteUrl, properties.bindingError, input.binding ?? null, account),
		},
		{
			id: 'community',
			label: 'Public community discussions',
			state: searchConfigured ? 'available' : 'unavailable',
			detail: searchConfigured
				? 'Public discussions are retrieved through the configured search provider and stored with their URLs.'
				: 'Community research uses the same search provider. Configure it before discussions can be retrieved.',
		},
		{
			id: 'analytics',
			label: 'Google Analytics',
			state: analyticsState,
			property: properties.ga4PropertyId,
			lastSuccessAt: input.binding?.ga4LastSuccessAt ?? null,
			error: input.binding?.ga4LastError ?? properties.bindingError,
			detail: analyticsDetail(auth, properties.ga4PropertyId, properties.bindingError, input.binding ?? null, account),
		},
	];
}

function searchConsoleDetail(auth: ReturnType<typeof googleAuthMode>, property: string | null, bindingError: string | null, binding: AnalyticsBinding | null, account: string | null): string {
	if (bindingError) return bindingError;
	if (binding?.searchConsoleLastError) return binding.searchConsoleLastError;
	if (auth === 'none') return 'Set GOOGLE_SERVICE_ACCOUNT_JSON, or the existing OAuth token variables, and bind GOOGLE_SEARCH_CONSOLE_SITE_URL to one brand with GOOGLE_SEARCH_CONSOLE_BRAND_ID. No query data is available until this is configured.';
	if (!property) return 'Credentials are present, but this brand has no Search Console property. Set GOOGLE_SEARCH_CONSOLE_BRAND_ID to this brand id, or store a binding for this brand only.';
	const checked = binding?.searchConsoleLastSuccessAt ? ` Last successful retrieval ${binding.searchConsoleLastSuccessAt}.` : ' Run the read-only connection test before treating it as connected.';
	return `Property ${property}. Authentication ${auth === 'service_account' ? `service account${account ? ` ${account}` : ''}` : 'OAuth'}.${checked}`;
}

function analyticsDetail(auth: ReturnType<typeof googleAuthMode>, property: string | null, bindingError: string | null, binding: AnalyticsBinding | null, account: string | null): string {
	if (bindingError) return bindingError;
	if (binding?.ga4LastError) return binding.ga4LastError;
	if (auth === 'none') return 'Set GOOGLE_SERVICE_ACCOUNT_JSON and bind GOOGLE_ANALYTICS_PROPERTY_ID to one brand with GOOGLE_ANALYTICS_BRAND_ID. Page behaviour will not be invented.';
	if (!property) return 'Credentials are present, but this brand has no GA4 property. Set GOOGLE_ANALYTICS_BRAND_ID to this brand id, or store a binding for this brand only.';
	const checked = binding?.ga4LastSuccessAt ? ` Last successful retrieval ${binding.ga4LastSuccessAt}.` : ' Run the read-only connection test before treating it as connected.';
	return `Property ${property}. Authentication ${auth === 'service_account' ? `service account${account ? ` ${account}` : ''}` : 'OAuth'}.${checked}`;
}

export function gscConfigured(env: Record<string, string | undefined> = process.env): boolean {
	return googleAuthMode(env) !== 'none' && Boolean(env.GOOGLE_SEARCH_CONSOLE_SITE_URL?.trim() || env.GOOGLE_PROPERTY_BINDINGS?.trim());
}

export function providerAvailability(env: Record<string, string | undefined> = process.env): ProviderAvailability[] {
	return providerStatus({ env, brandId: '', binding: null });
}
