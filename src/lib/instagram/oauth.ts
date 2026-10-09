/**
 * Instagram API with Instagram Login (Business Login)
 * https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login
 */

const GRAPH_IG = 'https://graph.instagram.com';

function instagramAppId(): string {
	const id = process.env.INSTAGRAM_APP_ID?.trim();
	if (!id) throw new Error('INSTAGRAM_APP_ID is not configured');
	return id;
}

function instagramAppSecret(): string {
	const secret = process.env.INSTAGRAM_APP_SECRET?.trim();
	if (!secret) throw new Error('INSTAGRAM_APP_SECRET is not configured');
	return secret;
}

export type InstagramRedirectVariant = 'connections' | 'meta';

export function instagramRedirectUri(variant: InstagramRedirectVariant = 'connections'): string {
	if (process.env.INSTAGRAM_OAUTH_REDIRECT_URI?.trim()) {
		return process.env.INSTAGRAM_OAUTH_REDIRECT_URI.trim();
	}
	const base = process.env.NEXT_PUBLIC_SITE_URL || 'https://app.crispdigital.io';
	return variant === 'meta'
		? `${base}/api/meta/instagram/callback`
		: `${base}/api/connections/instagram/callback`;
}

export function instagramOAuthScopes(): string[] {
	return ['instagram_business_basic', 'instagram_business_content_publish'];
}

export function instagramAuthorizeUrl(state: string, variant: InstagramRedirectVariant = 'connections'): string {
	const clientId = instagramAppId();
	const scopes = instagramOAuthScopes().join(',');
	const url = new URL('https://www.instagram.com/oauth/authorize');
	url.searchParams.set('client_id', clientId);
	url.searchParams.set('redirect_uri', instagramRedirectUri(variant));
	url.searchParams.set('response_type', 'code');
	url.searchParams.set('scope', scopes);
	url.searchParams.set('state', state);
	return url.toString();
}

export async function exchangeInstagramCode(code: string, redirectUri: string): Promise<{
	access_token: string;
	user_id: string;
}> {
	const clientId = instagramAppId();
	const clientSecret = instagramAppSecret();

	const body = new URLSearchParams();
	body.set('client_id', clientId);
	body.set('client_secret', clientSecret);
	body.set('grant_type', 'authorization_code');
	body.set('redirect_uri', redirectUri);
	body.set('code', code);

	const res = await fetch('https://api.instagram.com/oauth/access_token', {
		method: 'POST',
		body,
	});
	if (!res.ok) {
		throw new Error(`Instagram token exchange failed: ${await res.text()}`);
	}
	return res.json();
}

export async function exchangeInstagramLongLived(shortLivedToken: string): Promise<{
	access_token: string;
	expires_in: number;
}> {
	const clientSecret = instagramAppSecret();
	const url = new URL(`${GRAPH_IG}/access_token`);
	url.searchParams.set('grant_type', 'ig_exchange_token');
	url.searchParams.set('client_secret', clientSecret);
	url.searchParams.set('access_token', shortLivedToken);
	const res = await fetch(url.toString());
	if (!res.ok) {
		throw new Error(`Instagram long-lived exchange failed: ${await res.text()}`);
	}
	return res.json();
}

export async function refreshInstagramLongLived(accessToken: string): Promise<{
	access_token: string;
	expires_in: number;
}> {
	const url = new URL(`${GRAPH_IG}/refresh_access_token`);
	url.searchParams.set('grant_type', 'ig_refresh_token');
	url.searchParams.set('access_token', accessToken);
	const res = await fetch(url.toString());
	if (!res.ok) {
		throw new Error(`Instagram token refresh failed: ${await res.text()}`);
	}
	return res.json();
}

export async function fetchInstagramProfessionalProfile(accessToken: string): Promise<{
	id: string;
	username?: string;
	name?: string;
}> {
	const url = `${GRAPH_IG}/me?fields=id,username,name,profile_picture_url&access_token=${encodeURIComponent(accessToken)}`;
	const res = await fetch(url);
	if (!res.ok) {
		throw new Error(`Instagram profile fetch failed: ${await res.text()}`);
	}
	return res.json();
}

export type InstagramProfessionalPublishMetaError = {
	responseStatus: number;
	graphCode?: number;
	graphSubcode?: number;
	graphMessage?: string;
};

function parseInstagramGraphError(responseStatus: number, bodyText: string): InstagramProfessionalPublishMetaError {
	let graphCode: number | undefined;
	let graphSubcode: number | undefined;
	let graphMessage: string | undefined;
	try {
		const parsed = JSON.parse(bodyText);
		const err = parsed?.error;
		if (err) {
			graphCode = typeof err.code === 'number' ? err.code : undefined;
			graphSubcode = typeof err.error_subcode === 'number' ? err.error_subcode : undefined;
			graphMessage = typeof err.message === 'string' ? err.message : undefined;
		}
	} catch {
		// body may not be JSON
	}
	return { responseStatus, graphCode, graphSubcode, graphMessage };
}

async function waitForInstagramContainerReady(
	creationId: string,
	accessToken: string,
): Promise<{ ok: true } | { ok: false; error: string; metaError?: InstagramProfessionalPublishMetaError }> {
	const MAX_POLLS = 8;
	const POLL_INTERVAL_MS = 3000;

	for (let poll = 0; poll < MAX_POLLS; poll++) {
		await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));

		const statusRes = await fetch(
			`${GRAPH_IG}/${creationId}?fields=status_code&access_token=${encodeURIComponent(accessToken)}`,
		);

		if (!statusRes.ok) {
			const body = await statusRes.text();
			return { ok: false, error: body, metaError: parseInstagramGraphError(statusRes.status, body) };
		}

		const statusData = await statusRes.json();
		const statusCode: string = statusData.status_code || '';

		if (statusCode === 'FINISHED') {
			return { ok: true };
		}
		if (statusCode === 'ERROR' || statusCode === 'EXPIRED') {
			return {
				ok: false,
				error: `Instagram container ${statusCode.toLowerCase()} — cannot publish. Re-queue the post to try again.`,
			};
		}
	}

	return {
		ok: false,
		error: 'Instagram container did not become ready in time (timed out after polling). Will retry.',
	};
}

export async function publishInstagramProfessional(input: {
	igUserId: string;
	accessToken: string;
	caption: string;
	imageUrl?: string;
}): Promise<{ success: boolean; mediaId?: string; error?: string; metaError?: InstagramProfessionalPublishMetaError }> {
	const { igUserId, accessToken, caption, imageUrl } = input;
	const containerUrl = `${GRAPH_IG}/${igUserId}/media`;
	const containerBody: Record<string, string> = {
		caption,
		access_token: accessToken,
	};
	if (imageUrl) {
		containerBody.image_url = imageUrl;
	} else {
		containerBody.media_type = 'TEXT';
	}

	const containerRes = await fetch(containerUrl, {
		method: 'POST',
		headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
		body: new URLSearchParams(containerBody),
	});
	if (!containerRes.ok) {
		const body = await containerRes.text();
		return { success: false, error: body, metaError: parseInstagramGraphError(containerRes.status, body) };
	}
	const container = await containerRes.json();
	const creationId = container.id as string | undefined;
	if (!creationId) return { success: false, error: 'No container id' };

	if (imageUrl) {
		const ready = await waitForInstagramContainerReady(creationId, accessToken);
		if (!ready.ok) {
			return { success: false, error: ready.error, metaError: ready.metaError };
		}
	}

	const publishRes = await fetch(`${GRAPH_IG}/${igUserId}/media_publish`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
		body: new URLSearchParams({ creation_id: creationId, access_token: accessToken }),
	});
	if (!publishRes.ok) {
		const body = await publishRes.text();
		return { success: false, error: body, metaError: parseInstagramGraphError(publishRes.status, body) };
	}
	const published = await publishRes.json();
	return { success: true, mediaId: published.id };
}
