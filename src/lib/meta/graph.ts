/**
 * Meta Graph API Library
 * 
 * Handles:
 * - Token exchange (short-lived → long-lived)
 * - Facebook Page and Instagram account discovery
 * - Publishing to Facebook Pages (feed + photos)
 * - Publishing to Instagram (create container + media_publish)
 * 
 * API Version: v24.0
 */

import { encryptToken, decryptToken } from '@/lib/encryption';

const GRAPH_API_VERSION = 'v24.0';
const GRAPH_API_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

// ============================================
// Token Management
// ============================================

/**
 * Exchange authorization code for short-lived access token
 */
export async function exchangeCodeForToken(code: string, redirectUri: string): Promise<{
	access_token: string;
	token_type: string;
	expires_in?: number;
}> {
	const appId = process.env.META_APP_ID;
	const appSecret = process.env.META_APP_SECRET;

	if (!appId || !appSecret) {
		throw new Error('Meta app credentials not configured');
	}

	const url = new URL(`${GRAPH_API_BASE}/oauth/access_token`);
	url.searchParams.set('client_id', appId);
	url.searchParams.set('client_secret', appSecret);
	url.searchParams.set('redirect_uri', redirectUri);
	url.searchParams.set('code', code);

	const res = await fetch(url.toString());

	if (!res.ok) {
		const errorText = await res.text();
		throw new Error(`Meta token exchange failed: ${errorText}`);
	}

	return res.json();
}

/**
 * Exchange short-lived token for long-lived token (60 days)
 * https://developers.facebook.com/docs/facebook-login/guides/access-tokens/get-long-lived/
 */
export async function exchangeForLongLivedToken(shortLivedToken: string): Promise<{
	access_token: string;
	token_type: string;
	expires_in: number;
}> {
	const appId = process.env.META_APP_ID;
	const appSecret = process.env.META_APP_SECRET;

	if (!appId || !appSecret) {
		throw new Error('Meta app credentials not configured');
	}

	const url = new URL(`${GRAPH_API_BASE}/oauth/access_token`);
	url.searchParams.set('grant_type', 'fb_exchange_token');
	url.searchParams.set('client_id', appId);
	url.searchParams.set('client_secret', appSecret);
	url.searchParams.set('fb_exchange_token', shortLivedToken);

	const res = await fetch(url.toString());

	if (!res.ok) {
		const errorText = await res.text();
		throw new Error(`Long-lived token exchange failed: ${errorText}`);
	}

	return res.json();
}

/**
 * Get user info (Facebook user ID, name, email)
 */
export async function getUserInfo(accessToken: string): Promise<{
	id: string;
	name?: string;
	email?: string;
}> {
	const url = `${GRAPH_API_BASE}/me?fields=id,name,email&access_token=${accessToken}`;
	const res = await fetch(url);

	if (!res.ok) {
		const errorText = await res.text();
		throw new Error(`Failed to fetch user info: ${errorText}`);
	}

	return res.json();
}

// ============================================
// Page & Instagram Discovery
// ============================================

export interface FacebookPage {
	id: string;
	name: string;
	access_token: string;
	tasks?: string[];
}

/**
 * Get Facebook Pages user can manage
 * Returns all pages from /me/accounts with pagination support.
 * Pages returned by /me/accounts already require admin/editor access,
 * so no further task filtering is needed (task arrays are often empty for full admins).
 */
export async function getUserPages(userAccessToken: string): Promise<FacebookPage[]> {
	const allPages: FacebookPage[] = [];
	let nextUrl: string | null =
		`${GRAPH_API_BASE}/me/accounts?fields=id,name,access_token,tasks&limit=100&access_token=${userAccessToken}`;

	while (nextUrl) {
		const res = await fetch(nextUrl);

		if (!res.ok) {
			const errorText = await res.text();
			throw new Error(`Failed to fetch pages: ${errorText}`);
		}

		const data = await res.json();
		const pages: FacebookPage[] = data.data || [];
		allPages.push(...pages);

		// Follow pagination cursor if present
		nextUrl = data.paging?.next || null;
	}

	return allPages;
}

export interface InstagramAccount {
	id: string;
	username: string;
	pageId: string; // Connected Facebook Page ID
}

/**
 * Get Instagram Business account connected to a Facebook Page
 * Returns null if no IG account is connected
 */
export async function getPageInstagramAccount(
	pageId: string,
	pageAccessToken: string
): Promise<InstagramAccount | null> {
	const url = `${GRAPH_API_BASE}/${pageId}?fields=instagram_business_account{id,username}&access_token=${pageAccessToken}`;
	const res = await fetch(url);

	if (!res.ok) {
		const errorText = await res.text();
		console.warn(`Failed to fetch IG account for page ${pageId}:`, errorText);
		return null;
	}

	const data = await res.json();
	const igAccount = data.instagram_business_account;

	if (!igAccount) {
		return null;
	}

	return {
		id: igAccount.id,
		username: igAccount.username,
		pageId,
	};
}

// ============================================
// Facebook Publishing
// ============================================

export interface FacebookPublishPayload {
	message: string; // Post text (with hashtags if included)
	imageUrl?: string; // Optional image URL (must be publicly accessible)
	scheduledTime?: Date; // Optional: schedule for future (must be 10 min to 75 days ahead)
}

export interface PublishResult {
	success: boolean;
	postId?: string;
	publishedUrl?: string;
	error?: string;
}

/**
 * Publish to Facebook Page feed
 * Supports text-only, text+image, and scheduled posts
 * 
 * If scheduledTime is provided and is >= 10 minutes in future, uses scheduled_publish_time
 * Otherwise publishes immediately
 */
export async function publishToFacebookPage(
	pageId: string,
	pageAccessToken: string,
	payload: FacebookPublishPayload
): Promise<PublishResult> {
	try {
		const now = new Date();
		const tenMinutesFromNow = new Date(now.getTime() + 10 * 60 * 1000);
		const seventyFiveDaysFromNow = new Date(now.getTime() + 75 * 24 * 60 * 60 * 1000);

		// Determine if we should schedule or publish immediately
		const shouldSchedule = payload.scheduledTime && 
			payload.scheduledTime >= tenMinutesFromNow && 
			payload.scheduledTime <= seventyFiveDaysFromNow;

		// If we have an image, use the /photos endpoint then link in feed
		// Otherwise use /feed directly
		if (payload.imageUrl) {
			// Step 1: Upload photo
			const photoUrl = `${GRAPH_API_BASE}/${pageId}/photos`;
			const photoBody: any = {
				url: payload.imageUrl,
				caption: payload.message,
				published: shouldSchedule ? 'false' : 'true',
				access_token: pageAccessToken,
			};

			if (shouldSchedule) {
				// Convert to Unix timestamp (seconds)
				photoBody.scheduled_publish_time = Math.floor(payload.scheduledTime!.getTime() / 1000);
			}

			const photoRes = await fetch(photoUrl, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify(photoBody),
			});

			if (!photoRes.ok) {
				const errorText = await photoRes.text();
				console.error('[Meta Publish] Photo upload failed:', errorText);
				return {
					success: false,
					error: `Failed to upload photo: ${errorText}`,
				};
			}

			const photoData = await photoRes.json();
			const postId = photoData.id || photoData.post_id;

			return {
				success: true,
				postId,
				publishedUrl: postId ? `https://www.facebook.com/${postId}` : undefined,
			};
		} else {
			// Text-only post to feed
			const feedUrl = `${GRAPH_API_BASE}/${pageId}/feed`;
			const feedBody: any = {
				message: payload.message,
				published: shouldSchedule ? 'false' : 'true',
				access_token: pageAccessToken,
			};

			if (shouldSchedule) {
				// Convert to Unix timestamp (seconds)
				feedBody.scheduled_publish_time = Math.floor(payload.scheduledTime!.getTime() / 1000);
			}

			const feedRes = await fetch(feedUrl, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify(feedBody),
			});

			if (!feedRes.ok) {
				const errorText = await feedRes.text();
				console.error('[Meta Publish] Feed post failed:', errorText);
				return {
					success: false,
					error: `Failed to create post: ${errorText}`,
				};
			}

			const feedData = await feedRes.json();
			const postId = feedData.id;

			return {
				success: true,
				postId,
				publishedUrl: postId ? `https://www.facebook.com/${postId}` : undefined,
			};
		}
	} catch (error: any) {
		console.error('[Meta Publish] Facebook publish error:', error);
		return {
			success: false,
			error: error?.message || 'Failed to publish to Facebook',
		};
	}
}

// ============================================
// Instagram Publishing
// ============================================

export interface InstagramPublishPayload {
	caption: string; // Caption with hashtags
	imageUrl: string; // Required for Phase 1 (image posts only)
}

/**
 * Publish to Instagram (two-step: create container + publish)
 *
 * Step 1: POST /{ig_user_id}/media with image_url (must be publicly accessible: no auth, no robots blocking).
 * Step 2: POST /{ig_user_id}/media_publish with creation_id from step 1.
 *
 * Instagram does NOT support native scheduling via Graph API.
 * All posts are immediate; scheduling is handled by CRISP queue + cron.
 *
 * Rate limit: 50 posts per 24 hours per IG account.
 * For video, a different (stricter/slower) video publish flow is required.
 */
export async function publishToInstagram(
	igUserId: string,
	pageAccessToken: string, // Use Page token (IG is linked to Page)
	payload: InstagramPublishPayload
): Promise<PublishResult> {
	try {
		// Step 1: Create media container
		const containerUrl = `${GRAPH_API_BASE}/${igUserId}/media`;
		const containerBody = {
			image_url: payload.imageUrl,
			caption: payload.caption,
			access_token: pageAccessToken,
		};

		const containerRes = await fetch(containerUrl, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify(containerBody),
		});

		if (!containerRes.ok) {
			const errorText = await containerRes.text();
			console.error('[Meta Publish] Instagram container creation failed:', errorText);
			return {
				success: false,
				error: `Failed to create Instagram media container: ${errorText}`,
			};
		}

		const containerData = await containerRes.json();
		const containerId = containerData.id;

		if (!containerId) {
			return {
				success: false,
				error: 'No container ID returned from Instagram',
			};
		}

		// Step 2: Publish the container
		const publishUrl = `${GRAPH_API_BASE}/${igUserId}/media_publish`;
		const publishBody = {
			creation_id: containerId,
			access_token: pageAccessToken,
		};

		const publishRes = await fetch(publishUrl, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify(publishBody),
		});

		if (!publishRes.ok) {
			const errorText = await publishRes.text();
			console.error('[Meta Publish] Instagram publish failed:', errorText);
			return {
				success: false,
				error: `Failed to publish Instagram media: ${errorText}`,
			};
		}

		const publishData = await publishRes.json();
		const mediaId = publishData.id;

		return {
			success: true,
			postId: mediaId,
			publishedUrl: mediaId ? `https://www.instagram.com/p/${mediaId}/` : undefined,
		};
	} catch (error: any) {
		console.error('[Meta Publish] Instagram publish error:', error);
		return {
			success: false,
			error: error?.message || 'Failed to publish to Instagram',
		};
	}
}

// ============================================
// Token Encryption Helpers
// ============================================

/**
 * Encrypt Meta token using META_TOKEN_ENCRYPTION_KEY
 * Falls back to LINKEDIN_ENCRYPTION_KEY if not set (for simpler setup)
 */
export function encryptMetaToken(plainText: string): string {
	// Use dedicated META key or fall back to shared LINKEDIN key
	const originalKey = process.env.LINKEDIN_ENCRYPTION_KEY;
	const metaKey = process.env.META_TOKEN_ENCRYPTION_KEY;
	
	if (metaKey) {
		// Temporarily override for this call
		process.env.LINKEDIN_ENCRYPTION_KEY = metaKey;
		const encrypted = encryptToken(plainText);
		process.env.LINKEDIN_ENCRYPTION_KEY = originalKey;
		return encrypted;
	}
	
	// Fall back to shared encryption key
	return encryptToken(plainText);
}

/**
 * Decrypt Meta token using META_TOKEN_ENCRYPTION_KEY
 * Falls back to LINKEDIN_ENCRYPTION_KEY if not set
 */
export function decryptMetaToken(cipherText: string | null | undefined): string | null {
	if (!cipherText) return null;
	
	const originalKey = process.env.LINKEDIN_ENCRYPTION_KEY;
	const metaKey = process.env.META_TOKEN_ENCRYPTION_KEY;
	
	if (metaKey) {
		// Temporarily override for this call
		process.env.LINKEDIN_ENCRYPTION_KEY = metaKey;
		const decrypted = decryptToken(cipherText);
		process.env.LINKEDIN_ENCRYPTION_KEY = originalKey;
		return decrypted;
	}
	
	// Fall back to shared encryption key
	return decryptToken(cipherText);
}
