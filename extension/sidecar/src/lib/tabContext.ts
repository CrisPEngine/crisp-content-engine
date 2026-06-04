import { detectPlatformFromUrl } from './platform';
import {
	getTabUrl,
	hostnameFromUrl,
	isExcludedContextUrl,
	isReadableWebTab,
	type ReadableTabMemory,
	type TabTargetReason,
} from './readableTab';
import { selectionDebug, type TabTargetSelection } from './tabResolver';

export type PageContext = {
	selectedText: string;
	pageUrl: string;
	pageTitle: string;
	hostname: string;
	platform: ReturnType<typeof detectPlatformFromUrl>;
};

export type ContextCaptureDebug = {
	tabId: number | null;
	tabUrl: string;
	reason: TabTargetReason;
	lastReadableTabId: number | null;
	lastReadableTabUrl: string | null;
};

export type ContextCaptureResult =
	| { ok: true; context: PageContext; tabId: number; debug: ContextCaptureDebug }
	| {
			ok: false;
			kind: 'no_tab' | 'wrong_tab' | 'script_failed';
			message: string;
			tabId?: number;
			partial?: PageContext;
			debug: ContextCaptureDebug;
	  };

export const WRONG_TAB_MESSAGE =
	'Sidecar is targeting the wrong tab. Click the page you want to read, then click Refresh again.';

function contextFromUrl(
	pageUrl: string,
	pageTitle: string,
	selectedText = '',
): PageContext {
	return {
		selectedText,
		pageUrl,
		pageTitle,
		hostname: hostnameFromUrl(pageUrl),
		platform: detectPlatformFromUrl(pageUrl),
	};
}

function contextFromTab(tab: chrome.tabs.Tab, selectedText = ''): PageContext {
	const pageUrl = getTabUrl(tab);
	return contextFromUrl(pageUrl, tab.title || '', selectedText);
}

async function readPageContextFromTab(
	tab: chrome.tabs.Tab,
	debug: ContextCaptureDebug,
): Promise<ContextCaptureResult> {
	const tabUrl = getTabUrl(tab);
	const baseContext = contextFromTab(tab);

	if (!isReadableWebTab(tab) || isExcludedContextUrl(tabUrl)) {
		return {
			ok: false,
			kind: 'wrong_tab',
			message: WRONG_TAB_MESSAGE,
			tabId: tab.id,
			debug,
		};
	}

	if (!tab.id) {
		return {
			ok: false,
			kind: 'no_tab',
			message:
				'No readable webpage tab found. Open X or LinkedIn, click that tab once, then click Refresh page context.',
			debug,
		};
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

		if (result?.result) {
			const script = result.result as {
				selectedText: string;
				pageUrl: string;
				pageTitle: string;
			};
			const pageUrl = script.pageUrl || baseContext.pageUrl;
			if (isExcludedContextUrl(pageUrl)) {
				return {
					ok: false,
					kind: 'wrong_tab',
					message: WRONG_TAB_MESSAGE,
					tabId: tab.id,
					partial: baseContext,
					debug,
				};
			}
			return {
				ok: true,
				context: contextFromUrl(pageUrl, script.pageTitle || baseContext.pageTitle, script.selectedText),
				tabId: tab.id,
				debug,
			};
		}
	} catch (error) {
		const msg = error instanceof Error ? error.message : String(error);
		const wrongHost = isExcludedContextUrl(tabUrl);
		return {
			ok: false,
			kind: wrongHost ? 'wrong_tab' : 'script_failed',
			message: wrongHost
				? WRONG_TAB_MESSAGE
				: `Could not read selection on ${tabUrl} (${msg}). Reload the extension, click the page tab once, then Refresh.`,
			tabId: tab.id,
			partial: wrongHost ? undefined : baseContext,
			debug,
		};
	}

	return { ok: true, context: baseContext, tabId: tab.id, debug };
}

export async function capturePageContextWithTabResolver(
	selection: TabTargetSelection,
	memory: ReadableTabMemory,
): Promise<ContextCaptureResult> {
	const debug = selectionDebug(selection, memory);

	if (!selection.tab?.id) {
		return {
			ok: false,
			kind: 'no_tab',
			message:
				'No readable webpage tab found. Open X or LinkedIn, click that tab once, then click Refresh page context.',
			debug,
		};
	}

	return readPageContextFromTab(selection.tab, debug);
}
