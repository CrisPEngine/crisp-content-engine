export type { ContextCaptureDebug, ContextCaptureResult, PageContext } from './tabContext';
export { WRONG_TAB_MESSAGE } from './tabContext';

import type { ContextCaptureResult } from './tabContext';

export async function captureActiveTabContext(): Promise<ContextCaptureResult> {
	try {
		const result = await chrome.runtime.sendMessage({ type: 'SIDECAR_CAPTURE_PAGE_CONTEXT' });
		if (result && typeof result === 'object' && 'ok' in result) {
			return result as ContextCaptureResult;
		}
	} catch {
		/* fall through */
	}

	return {
		ok: false,
		kind: 'no_tab',
		message:
			'Sidecar could not reach the extension background. Reload the extension at chrome://extensions, then try again.',
		debug: {
			tabId: null,
			tabUrl: '',
			reason: 'none',
			lastReadableTabId: null,
			lastReadableTabUrl: null,
		},
	};
}
