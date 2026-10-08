/**
 * Threads API OAuth + publishing
 * https://developers.facebook.com/docs/threads/get-started
 */

import { threadsOAuthScopeString } from './scopes';

const GRAPH_THREADS = 'https://graph.threads.net';

function threadsAppId(): string {
	return process.env.THREADS_APP_ID || '';
}

function threadsAppSecret(): string {
	return process.env.THREADS_APP_SECRET || '';
}

export function threadsRedirectUri(): string {
	return (
		process.env.THREADS_OAUTH_REDIRECT_URI ||
		`${process.env.NEXT_PUBLIC_SITE_URL || 'https://app.crispdigital.io'}/api/connections/threads/callback`
	);
}

export function threadsAuthorizeUrl(state: string): string {
	const clientId = threadsAppId();
	if (!clientId) throw new Error('Threads app id not configured');
	const scopes = threadsOAuthScopeString();
	const url = new URL('https://threads.net/oauth/authorize');
	url.searchParams.set('client_id', clientId);
	url.searchParams.set('redirect_uri', threadsRedirectUri());
	url.searchParams.set('scope', scopes);
	url.searchParams.set('response_type', 'code');
	url.searchParams.set('state', state);
	return url.toString();
}

export async function exchangeThreadsCode(code: string): Promise<{
	access_token: string;
	user_id: number;
}> {
	const clientId = threadsAppId();
	const clientSecret = threadsAppSecret();
	if (!clientId || !clientSecret) {
		throw new Error('Threads app credentials not configured');
	}
	const body = new URLSearchParams();
	body.set('client_id', clientId);
	body.set('client_secret', clientSecret);
	body.set('grant_type', 'authorization_code');
	body.set('redirect_uri', threadsRedirectUri());
	body.set('code', code);

	const res = await fetch('https://graph.threads.net/oauth/access_token', {
		method: 'POST',
		body,
	});
	if (!res.ok) {
		throw new Error(`Threads token exchange failed: ${await res.text()}`);
	}
	return res.json();
}

export async function exchangeThreadsLongLived(shortLivedToken: string): Promise<{
	access_token: string;
	expires_in: number;
}> {
	const clientSecret = threadsAppSecret();
	const url = new URL(`${GRAPH_THREADS}/access_token`);
	url.searchParams.set('grant_type', 'th_exchange_token');
	url.searchParams.set('client_secret', clientSecret);
	url.searchParams.set('access_token', shortLivedToken);
	const res = await fetch(url.toString());
	if (!res.ok) {
		throw new Error(`Threads long-lived exchange failed: ${await res.text()}`);
	}
	return res.json();
}

export async function refreshThreadsLongLived(accessToken: string): Promise<{
	access_token: string;
	expires_in: number;
}> {
	const url = new URL(`${GRAPH_THREADS}/refresh_access_token`);
	url.searchParams.set('grant_type', 'th_refresh_token');
	url.searchParams.set('access_token', accessToken);
	const res = await fetch(url.toString());
	if (!res.ok) {
		throw new Error(`Threads token refresh failed: ${await res.text()}`);
	}
	return res.json();
}

export async function fetchThreadsProfile(accessToken: string): Promise<{
	id: string;
	username?: string;
	name?: string;
	threads_profile_picture_url?: string;
}> {
	const url = `${GRAPH_THREADS}/v1.0/me?fields=id,username,name,threads_profile_picture_url&access_token=${encodeURIComponent(accessToken)}`;
	const res = await fetch(url);
	if (!res.ok) {
		throw new Error(`Threads profile fetch failed: ${await res.text()}`);
	}
	return res.json();
}

export type ThreadsPublishInput = {
	threadsUserId: string;
	accessToken: string;
	text: string;
	imageUrl?: string;
	videoUrl?: string;
	/** When set, creates a reply container (requires threads_manage_replies). */
	replyToId?: string;
};

export async function publishThreadsPost(input: ThreadsPublishInput): Promise<{ success: boolean; postId?: string; error?: string }> {
	const { threadsUserId, accessToken, text, imageUrl, videoUrl, replyToId } = input;
	const containerBody: Record<string, string> = {
		access_token: accessToken,
		text,
	};
	if (replyToId) {
		containerBody.reply_to_id = replyToId;
	}
	if (videoUrl) {
		containerBody.media_type = 'VIDEO';
		containerBody.video_url = videoUrl;
	} else if (imageUrl) {
		containerBody.media_type = 'IMAGE';
		containerBody.image_url = imageUrl;
	} else {
		containerBody.media_type = 'TEXT';
	}

	const containerRes = await fetch(`${GRAPH_THREADS}/v1.0/${threadsUserId}/threads`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
		body: new URLSearchParams(containerBody),
	});
	if (!containerRes.ok) {
		return { success: false, error: await containerRes.text() };
	}
	const container = await containerRes.json();
	const creationId = container.id as string | undefined;
	if (!creationId) return { success: false, error: 'No Threads container id' };

	const publishRes = await fetch(`${GRAPH_THREADS}/v1.0/${threadsUserId}/threads_publish`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
		body: new URLSearchParams({ creation_id: creationId, access_token: accessToken }),
	});
	if (!publishRes.ok) {
		return { success: false, error: await publishRes.text() };
	}
	const published = await publishRes.json();
	return { success: true, postId: published.id };
}

/** Publishing status lookup when supported by API version. */
export async function getThreadsPublishingStatus(
	threadsUserId: string,
	accessToken: string,
	creationId: string
): Promise<{ status?: string; error?: string }> {
	const url = `${GRAPH_THREADS}/v1.0/${creationId}?fields=status&access_token=${encodeURIComponent(accessToken)}`;
	const res = await fetch(url);
	if (!res.ok) return { error: await res.text() };
	const data = await res.json();
	return { status: data.status };
}
