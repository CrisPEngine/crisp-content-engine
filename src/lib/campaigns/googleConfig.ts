import type { AnalyticsBinding } from './types';

export type BrandGoogleProperties = {
	searchConsoleSiteUrl: string | null;
	ga4PropertyId: string | null;
};

type BindingMap = Record<string, { searchConsoleSiteUrl?: string; ga4PropertyId?: string }>;

export function propertyBindings(env: Record<string, string | undefined>): { map: BindingMap; error: string | null } {
	const raw = env.GOOGLE_PROPERTY_BINDINGS?.trim();
	if (!raw) return { map: {}, error: null };
	try {
		const parsed = JSON.parse(raw) as unknown;
		if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
			return { map: {}, error: 'GOOGLE_PROPERTY_BINDINGS must be a JSON object keyed by brand id.' };
		}
		return { map: parsed as BindingMap, error: null };
	} catch {
		return { map: {}, error: 'GOOGLE_PROPERTY_BINDINGS is not valid JSON.' };
	}
}

export function resolveBrandProperties(brandId: string, env: Record<string, string | undefined>, stored: Pick<AnalyticsBinding, 'searchConsoleSiteUrl' | 'ga4PropertyId'> | null): BrandGoogleProperties & { bindingError: string | null } {
	const { map, error } = propertyBindings(env);
	const mapped = map[brandId];
	const siteFromBrand = env.GOOGLE_SEARCH_CONSOLE_BRAND_ID?.trim() === brandId ? env.GOOGLE_SEARCH_CONSOLE_SITE_URL?.trim() || null : null;
	const ga4FromBrand = env.GOOGLE_ANALYTICS_BRAND_ID?.trim() === brandId ? env.GOOGLE_ANALYTICS_PROPERTY_ID?.trim() || null : null;
	return {
		searchConsoleSiteUrl: stored?.searchConsoleSiteUrl?.trim() || mapped?.searchConsoleSiteUrl?.trim() || siteFromBrand,
		ga4PropertyId: stored?.ga4PropertyId?.trim() || mapped?.ga4PropertyId?.trim() || ga4FromBrand,
		bindingError: error,
	};
}
