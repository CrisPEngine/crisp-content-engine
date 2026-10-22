export type ParsedJsonResponse<T> = {
	status: number;
	ok: boolean;
	data: T | null;
	errorMessage: string | null;
};

/** Parse a fetch Response body as JSON when possible; surface readable errors for HTML/plain failures (e.g. Vercel 413). */
export async function readJsonResponse<T extends { error?: string }>(
	response: Response,
): Promise<ParsedJsonResponse<T>> {
	const status = response.status;
	const ok = response.ok;
	const contentType = (response.headers.get('content-type') ?? '').toLowerCase();

	let text = '';
	try {
		text = await response.text();
	} catch {
		return {
			status,
			ok,
			data: null,
			errorMessage: defaultHttpMessage(status),
		};
	}

	if (!text.trim()) {
		return {
			status,
			ok,
			data: null,
			errorMessage: defaultHttpMessage(status),
		};
	}

	const looksJson = contentType.includes('json') || text.trimStart().startsWith('{') || text.trimStart().startsWith('[');
	if (!looksJson) {
		return {
			status,
			ok,
			data: null,
			errorMessage: defaultHttpMessage(status),
		};
	}

	try {
		const data = JSON.parse(text) as T;
		const fromBody = typeof data?.error === 'string' && data.error.trim() ? data.error.trim() : null;
		return {
			status,
			ok,
			data,
			errorMessage: ok ? null : fromBody ?? defaultHttpMessage(status),
		};
	} catch {
		return {
			status,
			ok,
			data: null,
			errorMessage: defaultHttpMessage(status),
		};
	}
}

export function defaultHttpMessage(status: number): string {
	if (status === 413) {
		return 'This file is too large to send to the server. The app will compress photos before upload; if you still see this, try a smaller image.';
	}
	if (status === 401) return 'Sign in again to upload files.';
	if (status === 503) return 'Upload service is temporarily unavailable. Try again in a moment.';
	if (status >= 500) return 'Server error during upload. Try again or contact support if it persists.';
	if (status >= 400) return 'Upload was rejected. Check the file type and size.';
	return 'Unexpected response from the server.';
}
