import {
	getTabUrl,
	isReadableWebTab,
	type TabTargetReason,
	type TabTargetSelection,
} from './readableTab';

export type ReadableTabMemory = {
	tabId: number | null;
	tabUrl: string | null;
};

export function pickMostRecentReadableTab(tabs: chrome.tabs.Tab[]): chrome.tabs.Tab | null {
	const readable = tabs.filter((t) => t.id != null && isReadableWebTab(t));
	if (readable.length === 0) return null;
	return readable.sort((a, b) => (b.lastAccessed ?? 0) - (a.lastAccessed ?? 0))[0] ?? null;
}

/**
 * Choose the browser content tab for page context (side panel must not win).
 */
export async function resolveReadableTargetTab(
	memory: ReadableTabMemory,
): Promise<TabTargetSelection> {
	const windows = await chrome.windows.getAll({ windowTypes: ['normal'] });
	const focusedWindow = windows.find((w) => w.focused) ?? windows[0];

	if (focusedWindow?.id != null) {
		const windowTabs = await chrome.tabs.query({ windowId: focusedWindow.id });
		const activeReadable = windowTabs.find((t) => t.active && isReadableWebTab(t));
		if (activeReadable) {
			return { tab: activeReadable, reason: 'active_readable_in_focused_window' };
		}
	}

	if (memory.tabId != null) {
		try {
			const remembered = await chrome.tabs.get(memory.tabId);
			if (isReadableWebTab(remembered)) {
				return { tab: remembered, reason: 'last_readable_tab' };
			}
		} catch {
			/* closed */
		}
	}

	if (focusedWindow?.id != null) {
		const windowTabs = await chrome.tabs.query({ windowId: focusedWindow.id });
		const highlightedReadable = windowTabs.find((t) => t.highlighted && isReadableWebTab(t));
		if (highlightedReadable) {
			return { tab: highlightedReadable, reason: 'highlighted_readable_in_focused_window' };
		}

		const recentInWindow = pickMostRecentReadableTab(windowTabs);
		if (recentInWindow) {
			return { tab: recentInWindow, reason: 'most_recent_readable_tab' };
		}
	}

	const allTabs = await chrome.tabs.query({ url: ['http://*/*', 'https://*/*'] });
	const recent = pickMostRecentReadableTab(allTabs);
	if (recent) {
		return { tab: recent, reason: 'most_recent_readable_tab' };
	}

	return { tab: null, reason: 'none' };
}

export function selectionDebug(
	selection: TabTargetSelection,
	memory: ReadableTabMemory,
): { tabId: number | null; tabUrl: string; reason: TabTargetReason; lastReadableTabId: number | null; lastReadableTabUrl: string | null } {
	return {
		tabId: selection.tab?.id ?? null,
		tabUrl: selection.tab ? getTabUrl(selection.tab) : '',
		reason: selection.reason,
		lastReadableTabId: memory.tabId,
		lastReadableTabUrl: memory.tabUrl,
	};
}
