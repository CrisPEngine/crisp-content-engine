export type PageContext = {
	selectedText: string;
	pageUrl: string;
	pageTitle: string;
};

export type ContextCaptureResult =
	| { ok: true; context: PageContext; tabId: number }
	| {
			ok: false;
			kind: 'no_tab' | 'restricted_page' | 'script_failed';
			message: string;
			tabId?: number;
			partial?: PageContext;
	  };

function getTabUrl(tab: chrome.tabs.Tab): string {
	return tab.url || tab.pendingUrl || '';
}

function isBrowsableUrl(url: string): boolean {
	if (!url) return false;
	try {
		const parsed = new URL(url);
		return parsed.protocol === 'http:' || parsed.protocol === 'https:';
	} catch {
		return false;
	}
}

function isInternalUrl(url: string): boolean {
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

/**
 * Side panels steal focus from the page tab. Resolve the visible http(s) tab in the
 * focused browser window instead of relying on active+lastFocusedWindow alone.
 */
async function resolveTargetTab(): Promise<chrome.tabs.Tab | null> {
	const windows = await chrome.windows.getAll({ populate: true, windowTypes: ['normal'] });
	const ordered = [
		...windows.filter((w) => w.focused),
		...windows.filter((w) => !w.focused),
	];

	for (const win of ordered) {
		const tabs = win.tabs || [];
		if (tabs.length === 0) continue;

		const candidates = [
			tabs.find((t) => t.active && isBrowsableUrl(getTabUrl(t))),
			tabs.find((t) => t.highlighted && isBrowsableUrl(getTabUrl(t))),
			...tabs.filter((t) => isBrowsableUrl(getTabUrl(t))),
		];

		for (const tab of candidates) {
			if (tab?.id) return tab;
		}
	}

	const [fallback] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
	if (fallback?.id && isBrowsableUrl(getTabUrl(fallback))) {
		return fallback;
	}

	return null;
}

function contextFromTab(tab: chrome.tabs.Tab, selectedText = ''): PageContext {
	return {
		selectedText,
		pageUrl: getTabUrl(tab),
		pageTitle: tab.title || '',
	};
}

export async function captureActiveTabContext(): Promise<ContextCaptureResult> {
	const tab = await resolveTargetTab();

	if (!tab?.id) {
		return {
			ok: false,
			kind: 'no_tab',
			message:
				'No webpage tab found. Focus a normal browser tab (e.g. x.com or linkedin.com), then click Refresh again.',
		};
	}

	const tabUrl = getTabUrl(tab);

	if (!isBrowsableUrl(tabUrl) || isInternalUrl(tabUrl)) {
		return {
			ok: false,
			kind: 'restricted_page',
			message: `Active tab is not a normal webpage (${tabUrl || tab.title || 'no URL'}). Open LinkedIn, X, or another https:// page first.`,
			tabId: tab.id,
			partial: contextFromTab(tab),
		};
	}

	const baseContext = contextFromTab(tab);

	try {
		const [result] = await chrome.scripting.executeScript({
			target: { tabId: tab.id },
			func: () => ({
				selectedText: window.getSelection()?.toString().trim() || '',
				pageUrl: window.location.href,
				pageTitle: document.title || '',
			}),
		});

		if (result?.result) {
			const scriptContext = result.result as PageContext;
			return {
				ok: true,
				context: {
					selectedText: scriptContext.selectedText,
					pageUrl: scriptContext.pageUrl || baseContext.pageUrl,
					pageTitle: scriptContext.pageTitle || baseContext.pageTitle,
				},
				tabId: tab.id,
			};
		}
	} catch (error) {
		const msg = error instanceof Error ? error.message : String(error);
		return {
			ok: false,
			kind: 'script_failed',
			message: `Could not read selection on ${tabUrl} (${msg}). Page URL is shown below. Click the Sidecar toolbar icon on that tab, then Refresh.`,
			tabId: tab.id,
			partial: baseContext,
		};
	}

	return { ok: true, context: baseContext, tabId: tab.id };
}
