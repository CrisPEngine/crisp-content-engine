export type IndexNowReceipt = {
	submitted: boolean;
	status: number | null;
	endpoint: string;
	urls: string[];
	error: string | null;
	at: string;
};

export async function submitIndexNow(input: {
	host: string;
	key: string | null | undefined;
	keyLocation?: string | null;
	urls: string[];
	endpoint?: string;
	fetchImpl?: typeof fetch;
}): Promise<IndexNowReceipt> {
	const at = new Date().toISOString();
	const endpoint = input.endpoint ?? 'https://api.indexnow.org/indexnow';
	const urls = [...new Set(input.urls.map((url) => url.trim()).filter(Boolean))].slice(0, 100);
	if (!input.key?.trim()) {
		return { submitted: false, status: null, endpoint, urls, error: 'IndexNow is not configured.', at };
	}
	if (!urls.length) return { submitted: false, status: null, endpoint, urls, error: 'No URLs were supplied.', at };
	const fetchImpl = input.fetchImpl ?? fetch;
	const response = await fetchImpl(endpoint, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			host: input.host,
			key: input.key.trim(),
			keyLocation: input.keyLocation ?? `https://${input.host}/${input.key.trim()}.txt`,
			urlList: urls,
		}),
	});
	return {
		submitted: response.ok,
		status: response.status,
		endpoint,
		urls,
		error: response.ok ? null : `IndexNow returned HTTP ${response.status}.`,
		at,
	};
}
