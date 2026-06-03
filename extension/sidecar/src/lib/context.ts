export type PageContext = {
	selectedText: string;
	pageUrl: string;
	pageTitle: string;
};

export async function captureActiveTabContext(): Promise<PageContext | null> {
	const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
	if (!tab?.id || tab.url?.startsWith('chrome://') || tab.url?.startsWith('chrome-extension://')) {
		return null;
	}

	try {
		const [result] = await chrome.scripting.executeScript({
			target: { tabId: tab.id },
			func: () => ({
				selectedText: window.getSelection()?.toString().trim() || '',
				pageUrl: window.location.href,
				pageTitle: document.title || '',
			}),
		});

		if (!result?.result) return null;
		return result.result as PageContext;
	} catch {
		return {
			selectedText: '',
			pageUrl: tab.url || '',
			pageTitle: tab.title || '',
		};
	}
}
