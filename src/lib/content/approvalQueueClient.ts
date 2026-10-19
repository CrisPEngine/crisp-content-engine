export const DEFAULT_APPROVAL_QUEUE_TIMEOUT_MS = 30_000;

export type NativeQueueFetchParams = {
	stage: 'approval' | 'schedule' | 'published';
	platform?: string | null;
	brandProfileId?: string | null;
	contentBriefId?: string | null;
};

export type NativeQueueFetchResult = {
	items: unknown[];
};

export class ApprovalQueueFetchError extends Error {
	constructor(
		message: string,
		readonly code: 'timeout' | 'aborted' | 'http' | 'network',
	) {
		super(message);
		this.name = 'ApprovalQueueFetchError';
	}
}

function buildNativeQueueUrl(params: NativeQueueFetchParams, origin: string): string {
	const nativeUrl = new URL('/api/content/native-queue', origin);
	nativeUrl.searchParams.set('stage', params.stage);
	if (params.platform) nativeUrl.searchParams.set('platform', params.platform);
	if (params.brandProfileId && params.brandProfileId !== 'all') {
		nativeUrl.searchParams.set('brand_profile_id', params.brandProfileId);
	}
	if (params.contentBriefId) nativeUrl.searchParams.set('content_brief_id', params.contentBriefId);
	return nativeUrl.pathname + nativeUrl.search;
}

/** Combine external abort with a timeout; either aborts the linked controller. */
export function linkedAbortWithTimeout(
	externalSignal: AbortSignal | undefined,
	timeoutMs: number,
): { signal: AbortSignal; dispose: () => void; didTimeout: () => boolean } {
	const controller = new AbortController();
	let timeoutId: ReturnType<typeof setTimeout> | undefined;
	let timedOut = false;

	const abortFrom = () => {
		if (controller.signal.aborted) return;
		controller.abort();
	};

	if (externalSignal?.aborted) {
		abortFrom();
	} else if (externalSignal) {
		externalSignal.addEventListener('abort', () => abortFrom(), { once: true });
	}

	timeoutId = setTimeout(() => {
		timedOut = true;
		abortFrom();
	}, timeoutMs);

	return {
		signal: controller.signal,
		dispose: () => {
			if (timeoutId) clearTimeout(timeoutId);
		},
		didTimeout: () => timedOut,
	};
}

export async function fetchNativeApprovalQueue(
	params: NativeQueueFetchParams,
	options?: {
		signal?: AbortSignal;
		timeoutMs?: number;
		origin?: string;
	},
): Promise<NativeQueueFetchResult> {
	const timeoutMs = options?.timeoutMs ?? DEFAULT_APPROVAL_QUEUE_TIMEOUT_MS;
	const origin = options?.origin ?? (typeof window !== 'undefined' ? window.location.origin : 'http://local');
	const linked = linkedAbortWithTimeout(options?.signal, timeoutMs);

	try {
		const res = await fetch(buildNativeQueueUrl(params, origin), {
			cache: 'no-store',
			credentials: 'include',
			signal: linked.signal,
		});
		if (!res.ok) {
			const data = await res.json().catch(() => ({}));
			const message =
				typeof data?.error === 'string' && data.error.trim()
					? data.error.trim()
					: 'Failed to load content queue';
			throw new ApprovalQueueFetchError(message, 'http');
		}
		const data = await res.json();
		return { items: Array.isArray(data.items) ? data.items : [] };
	} catch (error: unknown) {
		if (linked.signal.aborted) {
			if (linked.didTimeout()) {
				throw new ApprovalQueueFetchError(
					'Loading timed out. Check your connection and try again.',
					'timeout',
				);
			}
			throw new ApprovalQueueFetchError('Request cancelled', 'aborted');
		}
		if (error instanceof ApprovalQueueFetchError) throw error;
		throw new ApprovalQueueFetchError('Could not reach the server. Try again.', 'network');
	} finally {
		linked.dispose();
	}
}

/** Whether URL still asks us to poll for freshly generated content on this tab. */
export function shouldPollForGeneratingContent(
	generatingParam: boolean,
	itemCount: number,
): boolean {
	return generatingParam && itemCount === 0;
}
