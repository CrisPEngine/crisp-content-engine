export function getTabUrl(tab: chrome.tabs.Tab): string {
	return tab.url || tab.pendingUrl || '';
}

export function isHttpUrl(url: string): boolean {
	if (!url) return false;
	try {
		const parsed = new URL(url);
		return parsed.protocol === 'http:' || parsed.protocol === 'https:';
	} catch {
		return false;
	}
}

export function isRestrictedScheme(url: string): boolean {
	if (!url) return true;
	const lower = url.toLowerCase();
	return (
		lower.startsWith('chrome://') ||
		lower.startsWith('chrome-extension://') ||
		lower.startsWith('edge://') ||
		lower.startsWith('about:') ||
		lower.startsWith('devtools://') ||
		lower.startsWith('view-source:')
	);
}

/** Sidecar API responses opened as tabs (e.g. after fetch) — not user content pages. */
export function isSidecarApiUrl(url: string): boolean {
	if (!url) return false;
	try {
		const parsed = new URL(url);
		return parsed.pathname.startsWith('/api/sidecar/');
	} catch {
		return false;
	}
}

export function isNormalWebTab(tab: chrome.tabs.Tab): boolean {
	const url = getTabUrl(tab);
	if (!url || !isHttpUrl(url)) return false;
	if (isRestrictedScheme(url)) return false;
	if (isSidecarApiUrl(url)) return false;
	return true;
}

export function hostnameFromUrl(url: string): string {
	try {
		return new URL(url).hostname.replace(/^www\./i, '');
	} catch {
		return '';
	}
}
