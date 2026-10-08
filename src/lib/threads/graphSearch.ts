const GRAPH_THREADS = 'https://graph.threads.net';

export type ThreadsMediaSummary = {
	id: string;
	text?: string;
	permalink?: string;
	username?: string;
	timestamp?: string;
};

async function graphGet<T>(path: string, accessToken: string, params: Record<string, string> = {}): Promise<T> {
	const url = new URL(`${GRAPH_THREADS}/v1.0/${path}`);
	for (const [key, value] of Object.entries(params)) {
		url.searchParams.set(key, value);
	}
	url.searchParams.set('access_token', accessToken);
	const res = await fetch(url.toString());
	if (!res.ok) {
		const body = await res.text();
		throw new Error(`Threads API ${path} failed (${res.status}): ${body.slice(0, 400)}`);
	}
	return res.json() as Promise<T>;
}

export async function lookupThreadsProfileId(accessToken: string, username: string): Promise<string | null> {
	try {
		const data = await graphGet<{ id?: string }>('profile_lookup', accessToken, {
			username: username.replace(/^@/, ''),
		});
		return data.id ?? null;
	} catch {
		return null;
	}
}

export async function fetchProfileThreadsPosts(
	accessToken: string,
	threadsUserId: string,
	limit = 25,
): Promise<ThreadsMediaSummary[]> {
	try {
		const data = await graphGet<{ data?: ThreadsMediaSummary[] }>(`${threadsUserId}/threads`, accessToken, {
			fields: 'id,text,permalink,timestamp,username',
			limit: String(limit),
		});
		return data.data ?? [];
	} catch {
		return [];
	}
}

export async function keywordSearchThreadsPosts(
	accessToken: string,
	query: string,
	limit = 25,
): Promise<ThreadsMediaSummary[]> {
	try {
		const data = await graphGet<{ data?: ThreadsMediaSummary[] }>('keyword_search', accessToken, {
			q: query,
			search_type: 'TEXT',
			fields: 'id,text,permalink,timestamp,username',
			limit: String(limit),
		});
		return data.data ?? [];
	} catch {
		return [];
	}
}

export function permalinkMatchesShortcode(permalink: string | undefined, shortcode: string): boolean {
	if (!permalink) return false;
	return permalink.includes(`/${shortcode}`) || permalink.endsWith(shortcode);
}
