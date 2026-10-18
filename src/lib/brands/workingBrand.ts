export const WORKING_BRAND_STORAGE_KEY = 'cce.workingBrandId';

export function readWorkingBrandId(): string | null {
	if (typeof window === 'undefined') return null;
	return localStorage.getItem(WORKING_BRAND_STORAGE_KEY);
}

export function writeWorkingBrandId(airtableBrandId: string): void {
	if (typeof window === 'undefined') return;
	localStorage.setItem(WORKING_BRAND_STORAGE_KEY, airtableBrandId);
}

/** Apply working brand query param for pages that support brand scoping. */
export function hrefWithWorkingBrand(
	pathname: string,
	airtableBrandId: string,
	brainIdByAirtable?: Record<string, string>,
): string {
	if (pathname.startsWith('/intelligence')) {
		const url = new URL('http://local' + pathname);
		url.searchParams.set('brand_profile_id', airtableBrandId);
		return url.pathname + url.search;
	}
	if (pathname.startsWith('/connections')) {
		const brainId = brainIdByAirtable?.[airtableBrandId] ?? airtableBrandId;
		return `/connections?brand=${encodeURIComponent(brainId)}`;
	}
	if (pathname.startsWith('/strategy/')) {
		return `/strategy/${encodeURIComponent(airtableBrandId)}`;
	}
	return pathname;
}
