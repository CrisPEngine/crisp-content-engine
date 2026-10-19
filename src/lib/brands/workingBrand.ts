export const WORKING_BRAND_STORAGE_KEY = 'cce.workingBrandId';

/** Query keys used for brand scoping on content approval (both supported for backward compatibility). */
export const APPROVAL_BRAND_QUERY_KEYS = ['brand', 'brand_profile_id'] as const;

export function readWorkingBrandId(): string | null {
	if (typeof window === 'undefined') return null;
	return localStorage.getItem(WORKING_BRAND_STORAGE_KEY);
}

export function writeWorkingBrandId(airtableBrandId: string): void {
	if (typeof window === 'undefined') return;
	localStorage.setItem(WORKING_BRAND_STORAGE_KEY, airtableBrandId);
	window.dispatchEvent(new CustomEvent('cce-working-brand', { detail: airtableBrandId }));
}

export function readApprovalBrandFromSearch(params: URLSearchParams): string | null {
	for (const key of APPROVAL_BRAND_QUERY_KEYS) {
		const value = params.get(key)?.trim();
		if (value) return value;
	}
	return null;
}

export function contentApprovalHref(airtableBrandId?: string | null): string {
	if (!airtableBrandId || airtableBrandId === 'all') return '/content/approval';
	return `/content/approval?brand=${encodeURIComponent(airtableBrandId)}`;
}

export function intelligenceStrategyHref(airtableBrandId: string): string {
	const url = new URL('http://local/intelligence');
	url.searchParams.set('brand_profile_id', airtableBrandId);
	url.searchParams.set('tab', 'strategy');
	return url.pathname + url.search;
}

/** Apply working brand query param for pages that support brand scoping. */
export function hrefWithWorkingBrand(
	pathname: string,
	airtableBrandId: string,
	brainIdByAirtable?: Record<string, string>,
): string {
	if (pathname.startsWith('/intelligence')) {
		return intelligenceStrategyHref(airtableBrandId);
	}
	if (pathname.startsWith('/connections')) {
		const brainId = brainIdByAirtable?.[airtableBrandId] ?? airtableBrandId;
		return `/connections?brand=${encodeURIComponent(brainId)}`;
	}
	if (pathname.startsWith('/strategy/')) {
		return `/strategy/${encodeURIComponent(airtableBrandId)}`;
	}
	if (pathname.startsWith('/content/generate')) {
		return `/content/generate?brand=${encodeURIComponent(airtableBrandId)}`;
	}
	if (pathname.startsWith('/content/approval')) {
		return contentApprovalHref(airtableBrandId);
	}
	if (pathname.startsWith('/content/brand-assets') && brainIdByAirtable?.[airtableBrandId]) {
		return `/content/brand-assets?brandId=${encodeURIComponent(brainIdByAirtable[airtableBrandId])}`;
	}
	if (pathname.startsWith('/dashboard')) {
		return '/dashboard';
	}
	return pathname;
}

/** Pick initial brand for a page: URL param, then stored working brand, then optional fallback. */
export function resolveWorkingBrandId(
	params: URLSearchParams,
	brandIds: string[],
	fallbackId?: string,
): string {
	const fromApproval = readApprovalBrandFromSearch(params);
	if (fromApproval && brandIds.includes(fromApproval)) return fromApproval;
	const fromIntelligence = params.get('brand_profile_id')?.trim();
	if (fromIntelligence && brandIds.includes(fromIntelligence)) return fromIntelligence;
	const fromGenerate = params.get('brand')?.trim();
	if (fromGenerate && brandIds.includes(fromGenerate)) return fromGenerate;
	const stored = readWorkingBrandId();
	if (stored && brandIds.includes(stored)) return stored;
	if (fallbackId && brandIds.includes(fallbackId)) return fallbackId;
	return brandIds[0] ?? '';
}
