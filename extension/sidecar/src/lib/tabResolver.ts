import {
	getTabUrl,
	isReadableWebTab,
	type TabTargetReason,
	type TabTargetSelection,
} from './readableTab';
import { isSupportedPlatformTab } from './supportedPlatforms';

export type ReadableTabMemory = {
	tabId: number | null;
	tabUrl: string | null;
};

function pickMostRecent(tabs: chrome.tabs.Tab[], filter: (t: chrome.tabs.Tab) => boolean): chrome.tabs.Tab | null {
	const matching = tabs.filter((t) => t.id != null && filter(t));
	if (matching.length === 0) return null;
	return matching.sort((a, b) => (b.lastAccessed ?? 0) - (a.lastAccessed ?? 0))[0] ?? null;
}

export function pickMostRecentSupportedPlatformTab(tabs: chrome.tabs.Tab[]): chrome.tabs.Tab | null {
	return pickMostRecent(tabs, isSupportedPlatformTab);
}

export function pickMostRecentReadableTab(tabs: chrome.tabs.Tab[]): chrome.tabs.Tab | null {
	return pickMostRecent(tabs, isReadableWebTab);
}

/**
 * Prefer supported platform tabs (X, LinkedIn, …) over other http(s) pages.
 * Never selects app.crispdigital.io (excluded in isReadableWebTab).
 */
export async function resolveReadableTargetTab(
	memory: ReadableTabMemory,
): Promise<TabTargetSelection> {
	const windows = await chrome.windows.getAll({ windowTypes: ['normal'] });
	const focusedWindow = windows.find((w) => w.focused) ?? windows[0];

	if (focusedWindow?.id != null) {
		const windowTabs = await chrome.tabs.query({ windowId: focusedWindow.id });

		const activeSupported = windowTabs.find((t) => t.active && isSupportedPlatformTab(t));
		if (activeSupported) {
			return { tab: activeSupported, reason: 'active_supported_platform_tab' };
		}
	}

	if (memory.tabId != null) {
		try {
			const remembered = await chrome.tabs.get(memory.tabId);
			if (isSupportedPlatformTab(remembered)) {
				return { tab: remembered, reason: 'last_supported_platform_tab' };
			}
		} catch {
			/* closed */
		}
	}

	if (focusedWindow?.id != null) {
		const windowTabs = await chrome.tabs.query({ windowId: focusedWindow.id });

		const recentSupported = pickMostRecentSupportedPlatformTab(windowTabs);
		if (recentSupported) {
			return { tab: recentSupported, reason: 'most_recent_supported_platform_tab' };
		}

		const activeReadable = windowTabs.find((t) => t.active && isReadableWebTab(t));
		if (activeReadable) {
			return { tab: activeReadable, reason: 'active_readable_in_focused_window' };
		}

		const highlightedReadable = windowTabs.find((t) => t.highlighted && isReadableWebTab(t));
		if (highlightedReadable) {
			return { tab: highlightedReadable, reason: 'highlighted_readable_in_focused_window' };
		}

		const recentReadable = pickMostRecentReadableTab(windowTabs);
		if (recentReadable) {
			return { tab: recentReadable, reason: 'most_recent_readable_tab' };
		}
	}

	const allTabs = await chrome.tabs.query({ url: ['http://*/*', 'https://*/*'] });
	const globalSupported = pickMostRecentSupportedPlatformTab(allTabs);
	if (globalSupported) {
		return { tab: globalSupported, reason: 'most_recent_supported_platform_tab' };
	}

	const globalReadable = pickMostRecentReadableTab(allTabs);
	if (globalReadable) {
		return { tab: globalReadable, reason: 'most_recent_readable_tab' };
	}

	return { tab: null, reason: 'none' };
}

export function selectionDebug(
	selection: TabTargetSelection,
	memory: ReadableTabMemory,
): {
	tabId: number | null;
	tabUrl: string;
	reason: TabTargetReason;
	lastReadableTabId: number | null;
	lastReadableTabUrl: string | null;
} {
	return {
		tabId: selection.tab?.id ?? null,
		tabUrl: selection.tab ? getTabUrl(selection.tab) : '',
		reason: selection.reason,
		lastReadableTabId: memory.tabId,
		lastReadableTabUrl: memory.tabUrl,
	};
}
