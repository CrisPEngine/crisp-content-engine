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

/** CCE / local API hosts — never used as reply context. */
export const EXCLUDED_CONTEXT_HOSTS = new Set([
	'app.crispdigital.io',
	'localhost',
	'127.0.0.1',
]);

export function hostnameFromUrl(url: string): string {
	try {
		return new URL(url).hostname.toLowerCase().replace(/^www\./, '');
	} catch {
		return '';
	}
}

export function isSidecarApiPath(url: string): boolean {
	if (!url) return false;
	try {
		return new URL(url).pathname.startsWith('/api/sidecar/');
	} catch {
		return false;
	}
}

export function isExcludedContextUrl(url: string): boolean {
	if (!url || !isHttpUrl(url)) return true;
	if (isRestrictedScheme(url)) return true;
	if (isSidecarApiPath(url)) return true;
	const host = hostnameFromUrl(url);
	return EXCLUDED_CONTEXT_HOSTS.has(host);
}

/** Tabs Sidecar may read on Refresh (http(s) content pages, not CCE/API). */
export function isReadableWebTab(tab: chrome.tabs.Tab): boolean {
	const url = getTabUrl(tab);
	if (!url || !isHttpUrl(url)) return false;
	return !isExcludedContextUrl(url);
}

export type TabTargetReason =
	| 'active_supported_platform_tab'
	| 'last_supported_platform_tab'
	| 'most_recent_supported_platform_tab'
	| 'active_readable_in_focused_window'
	| 'last_readable_tab'
	| 'highlighted_readable_in_focused_window'
	| 'most_recent_readable_tab'
	| 'none';

export type TabTargetSelection = {
	tab: chrome.tabs.Tab | null;
	reason: TabTargetReason;
};
