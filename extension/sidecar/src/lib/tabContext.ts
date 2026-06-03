import { detectPlatformFromUrl } from './platform';
import {
	getTabUrl,
	hostnameFromUrl,
	isNormalWebTab,
	isRestrictedScheme,
	isSidecarApiUrl,
} from './normalTab';

export type PageContext = {
	selectedText: string;
	pageUrl: string;
	pageTitle: string;
	hostname: string;
	platform: ReturnType<typeof detectPlatformFromUrl>;
};

export type ContextCaptureResult =
	| { ok: true; context: PageContext; tabId: number }
	| {
			ok: false;
			kind: 'no_tab' | 'wrong_tab' | 'script_failed';
			message: string;
			tabId?: number;
			partial?: PageContext;
	  };

function contextFromTab(tab: chrome.tabs.Tab, selectedText = ''): PageContext {
	const pageUrl = getTabUrl(tab);
	return {
		selectedText,
		pageUrl,
		pageTitle: tab.title || '',
		hostname: hostnameFromUrl(pageUrl),
		platform: detectPlatformFromUrl(pageUrl),
	};
}

async function readPageContextFromTab(tab: chrome.tabs.Tab): Promise<ContextCaptureResult> {
	const tabUrl = getTabUrl(tab);
	const baseContext = contextFromTab(tab);

	if (!isNormalWebTab(tab)) {
		const isApiTab = isSidecarApiUrl(tabUrl);
		return {
			ok: false,
			kind: 'wrong_tab',
			message: isApiTab
				? 'Could not read the page you were on (Sidecar API tab was focused). Focus your X or LinkedIn tab, then click Refresh page context again.'
				: `Active tab is not a normal webpage (${tabUrl || tab.title || 'no URL'}). Open X, LinkedIn, or another https:// page first.`,
			tabId: tab.id,
			partial: baseContext.pageUrl ? baseContext : undefined,
		};
	}

	if (!tab.id) {
		return {
			ok: false,
			kind: 'no_tab',
			message: 'No readable webpage tab found. Focus a normal browser tab (e.g. x.com), then click Refresh again.',
		};
	}

	try {
		const [result] = await chrome.scripting.executeScript({
			target: { tabId: tab.id },
			func: () => {
				const href = window.location.href;
				return {
					selectedText: window.getSelection()?.toString().trim() || '',
					pageUrl: href,
					pageTitle: document.title || '',
				};
			},
		});

		if (result?.result) {
			const script = result.result as {
				selectedText: string;
				pageUrl: string;
				pageTitle: string;
			};
			const pageUrl = script.pageUrl || baseContext.pageUrl;
			if (isRestrictedScheme(pageUrl) || isSidecarApiUrl(pageUrl)) {
				return {
					ok: false,
					kind: 'wrong_tab',
					message:
						'Could not read the page you were on. Focus your X or LinkedIn tab, then click Refresh page context again.',
					tabId: tab.id,
					partial: baseContext,
				};
			}
			return {
				ok: true,
				context: {
					selectedText: script.selectedText,
					pageUrl,
					pageTitle: script.pageTitle || baseContext.pageTitle,
					hostname: hostnameFromUrl(pageUrl),
					platform: detectPlatformFromUrl(pageUrl),
				},
				tabId: tab.id,
			};
		}
	} catch (error) {
		const msg = error instanceof Error ? error.message : String(error);
		return {
			ok: false,
			kind: 'script_failed',
			message: `Could not read selection on ${tabUrl} (${msg}). Click the Sidecar toolbar icon on that tab, then Refresh.`,
			tabId: tab.id,
			partial: baseContext,
		};
	}

	return { ok: true, context: baseContext, tabId: tab.id };
}

/**
 * Resolve tab for context capture: current active normal tab, else last remembered normal tab.
 */
export async function capturePageContextWithTabResolver(
	resolveTab: () => Promise<chrome.tabs.Tab | null>,
): Promise<ContextCaptureResult> {
	const tab = await resolveTab();

	if (!tab?.id) {
		return {
			ok: false,
			kind: 'no_tab',
			message:
				'No readable webpage tab found. Open X or LinkedIn in a normal tab, click that tab once, then click Refresh page context.',
		};
	}

	return readPageContextFromTab(tab);
}
