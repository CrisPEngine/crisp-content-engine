import { isNormalWebTab } from './lib/normalTab';
import { capturePageContextWithTabResolver } from './lib/tabContext';

const STORAGE_KEY = 'sidecarLastNormalTabId';

let lastNormalTabId: number | null = null;

async function loadStoredTabId(): Promise<void> {
	try {
		const stored = await chrome.storage.session.get(STORAGE_KEY);
		const id = stored[STORAGE_KEY];
		if (typeof id === 'number') {
			const tab = await chrome.tabs.get(id);
			if (isNormalWebTab(tab)) {
				lastNormalTabId = id;
			}
		}
	} catch {
		lastNormalTabId = null;
	}
}

async function persistLastNormalTabId(tabId: number): Promise<void> {
	lastNormalTabId = tabId;
	try {
		await chrome.storage.session.set({ [STORAGE_KEY]: tabId });
	} catch {
		/* session storage may be unavailable */
	}
}

async function rememberTab(tabId: number): Promise<void> {
	try {
		const tab = await chrome.tabs.get(tabId);
		if (isNormalWebTab(tab)) {
			await persistLastNormalTabId(tabId);
		}
	} catch {
		/* tab closed */
	}
}

async function seedLastNormalTab(): Promise<void> {
	const tabs = await chrome.tabs.query({ url: ['http://*/*', 'https://*/*'] });
	for (const tab of tabs) {
		if (tab.id && isNormalWebTab(tab)) {
			await persistLastNormalTabId(tab.id);
			return;
		}
	}
}

async function resolveContextTab(): Promise<chrome.tabs.Tab | null> {
	const [active] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
	if (active?.id && isNormalWebTab(active)) {
		return active;
	}

	if (lastNormalTabId != null) {
		try {
			const tab = await chrome.tabs.get(lastNormalTabId);
			if (isNormalWebTab(tab)) {
				return tab;
			}
		} catch {
			lastNormalTabId = null;
		}
	}

	const windows = await chrome.windows.getAll({ windowTypes: ['normal'] });
	const ordered = [
		...windows.filter((w) => w.focused),
		...windows.filter((w) => !w.focused),
	];

	for (const win of ordered) {
		const tabs = win.tabs || [];
		const activeNormal = tabs.find((t) => t.active && isNormalWebTab(t));
		if (activeNormal) return activeNormal;
		const anyNormal = tabs.find((t) => isNormalWebTab(t));
		if (anyNormal) return anyNormal;
	}

	return null;
}

chrome.sidePanel
	.setPanelBehavior({ openPanelOnActionClick: true })
	.catch(() => {
		/* side panel may be unavailable on older Chrome */
	});

chrome.tabs.onActivated.addListener(({ tabId }) => {
	void rememberTab(tabId);
});

chrome.windows.onFocusChanged.addListener((windowId) => {
	if (windowId === chrome.windows.WINDOW_ID_NONE) return;
	void chrome.tabs.query({ active: true, windowId }).then(([tab]) => {
		if (tab?.id) void rememberTab(tab.id);
	});
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
	if (changeInfo.url || changeInfo.status === 'complete') {
		if (isNormalWebTab(tab)) void persistLastNormalTabId(tabId);
	}
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
	if (message?.type !== 'SIDECAR_CAPTURE_PAGE_CONTEXT') return false;
	void capturePageContextWithTabResolver(resolveContextTab).then(sendResponse);
	return true;
});

void (async () => {
	await loadStoredTabId();
	if (lastNormalTabId == null) {
		await seedLastNormalTab();
	}
})();
