import { detectPlatformFromUrl, type DetectedPlatform } from './platform';
import { getTabUrl, isReadableWebTab } from './readableTab';

/**
 * Manifest host_permissions for executeScript on Refresh (keep in sync with this list).
 */
export const PLATFORM_HOST_PERMISSIONS = [
	'https://x.com/*',
	'https://twitter.com/*',
	'https://www.linkedin.com/*',
	'https://www.reddit.com/*',
	'https://reddit.com/*',
	'https://www.facebook.com/*',
	'https://www.instagram.com/*',
	'https://www.youtube.com/*',
	'https://bsky.app/*',
	'https://www.threads.net/*',
] as const;

const SUPPORTED_PLATFORMS = new Set<DetectedPlatform>([
	'x',
	'linkedin',
	'reddit',
	'facebook',
	'instagram',
	'youtube',
	'bluesky',
	'threads',
]);

export function isSupportedPlatformUrl(url: string): boolean {
	if (!url) return false;
	return SUPPORTED_PLATFORMS.has(detectPlatformFromUrl(url));
}

export function isSupportedPlatformTab(tab: chrome.tabs.Tab): boolean {
	const url = getTabUrl(tab);
	if (!isReadableWebTab(tab)) return false;
	return isSupportedPlatformUrl(url);
}
