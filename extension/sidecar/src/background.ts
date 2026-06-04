import { capturePageContextWithTabResolver } from './lib/tabContext';
import { getTabUrl, isReadableWebTab } from './lib/readableTab';
import type { ReadableTabMemory } from './lib/readableTab';
import { pickMostRecentReadableTab, resolveReadableTargetTab } from './lib/tabResolver';

const STORAGE_TAB_ID = 'sidecarLastReadableTabId';
const STORAGE_TAB_URL = 'sidecarLastReadableTabUrl';

const memory: ReadableTabMemory = {
	tabId: null,
	tabUrl: null,
};

async function loadReadableTabMemory(): Promise<void> {
	try {
		const stored = await chrome.storage.session.get([STORAGE_TAB_ID, STORAGE_TAB_URL]);
		const id = stored[STORAGE_TAB_ID];
		const url = stored[STORAGE_TAB_URL];
		if (typeof id === 'number') {
			try {
				const tab = await chrome.tabs.get(id);
				if (isReadableWebTab(tab)) {
					memory.tabId = id;
					memory.tabUrl = typeof url === 'string' ? url : getTabUrl(tab);
					return;
				}
			} catch {
				/* tab gone */
			}
		}
	} catch {
		/* session storage unavailable */
	}
	memory.tabId = null;
	memory.tabUrl = null;
}

async function persistReadableTab(tabId: number, tabUrl: string): Promise<void> {
	memory.tabId = tabId;
	memory.tabUrl = tabUrl;
	try {
		await chrome.storage.session.set({
			[STORAGE_TAB_ID]: tabId,
			[STORAGE_TAB_URL]: tabUrl,
		});
	} catch {
		/* ignore */
	}
}

async function rememberReadableTab(tabId: number): Promise<void> {
	try {
		const tab = await chrome.tabs.get(tabId);
		if (!isReadableWebTab(tab)) return;
		await persistReadableTab(tabId, getTabUrl(tab));
	} catch {
		/* tab closed */
	}
}

async function seedReadableTabMemory(): Promise<void> {
	const tabs = await chrome.tabs.query({ url: ['http://*/*', 'https://*/*'] });
	const best = pickMostRecentReadableTab(tabs);
	if (best?.id) {
		await persistReadableTab(best.id, getTabUrl(best));
	}
}

chrome.sidePanel
	.setPanelBehavior({ openPanelOnActionClick: true })
	.catch(() => {
		/* side panel may be unavailable on older Chrome */
	});

chrome.tabs.onActivated.addListener(({ tabId }) => {
	void rememberReadableTab(tabId);
});

chrome.windows.onFocusChanged.addListener((windowId) => {
	if (windowId === chrome.windows.WINDOW_ID_NONE) return;
	void chrome.tabs.query({ active: true, windowId }).then(([tab]) => {
		if (tab?.id) void rememberReadableTab(tab.id);
	});
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
	if (message?.type !== 'SIDECAR_CAPTURE_PAGE_CONTEXT') return false;
	void (async () => {
		const selection = await resolveReadableTargetTab(memory);
		const result = await capturePageContextWithTabResolver(selection, memory);
		sendResponse(result);
	})();
	return true;
});

void (async () => {
	await loadReadableTabMemory();
	if (memory.tabId == null) {
		await seedReadableTabMemory();
	}
})();
