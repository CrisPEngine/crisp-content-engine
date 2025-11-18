/**
 * LinkedIn Publishing Utilities
 * Handles token refresh and publishing to LinkedIn API
 */

import { getSupabaseService } from '@/lib/supabaseService';
import { decryptToken, encryptToken } from '@/lib/encryption';

export interface LinkedInConnection {
	id: string;
	user_id: string;
	access_token: string;
	refresh_token: string | null;
	expires_at: string | null;
	person_urn: string | null;
	organisation_urn: string | null;
}

export interface PublishResult {
	success: boolean;
	published_url?: string;
	linkedin_post_id?: string;
	error?: string;
}

/**
 * Refresh LinkedIn access token
 */
async function refreshLinkedInToken(refreshToken: string): Promise<{
	access_token: string;
	refresh_token?: string;
	expires_in?: number;
}> {
	const clientId = process.env.LINKEDIN_CLIENT_ID;
	const clientSecret = process.env.LINKEDIN_CLIENT_SECRET;

	if (!clientId || !clientSecret) {
		throw new Error('LinkedIn client credentials not configured');
	}

	const body = new URLSearchParams();
	body.set('grant_type', 'refresh_token');
	body.set('refresh_token', refreshToken);
	body.set('client_id', clientId);
	body.set('client_secret', clientSecret);

	const res = await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/x-www-form-urlencoded',
		},
		body: body.toString(),
	});

	if (!res.ok) {
		const errorText = await res.text();
		throw new Error(`LinkedIn token refresh failed: ${errorText}`);
	}

	return res.json();
}

/**
 * Get and refresh LinkedIn connection for a user
 * Returns valid access token and person_urn
 */
export async function getLinkedInConnection(userId: string): Promise<{
	accessToken: string;
	personUrn: string;
} | null> {
	const supabase = getSupabaseService();

	// Fetch LinkedIn connection
	const { data: connection, error } = await supabase
		.from('social_connections')
		.select('*')
		.eq('user_id', userId)
		.eq('provider', 'linkedin')
		.maybeSingle();

	if (error || !connection) {
		return null;
	}

	let accessToken = decryptToken(connection.access_token);
	const refreshToken = connection.refresh_token ? decryptToken(connection.refresh_token) : null;

	if (!accessToken) {
		return null;
	}

	// Check if token needs refresh (refresh if expires within 5 minutes)
	const expiresAt = connection.expires_at ? new Date(connection.expires_at).getTime() : null;
	const now = Date.now();

	if (expiresAt && expiresAt - now < 5 * 60 * 1000 && refreshToken) {
		try {
			const refreshResponse = await refreshLinkedInToken(refreshToken);
			const newExpiresAt = refreshResponse.expires_in
				? now + refreshResponse.expires_in * 1000
				: null;
			const newRefreshToken = refreshResponse.refresh_token || refreshToken;

			accessToken = refreshResponse.access_token;

			// Update connection in Supabase
			await supabase
				.from('social_connections')
				.update({
					access_token: encryptToken(accessToken),
					refresh_token: newRefreshToken ? encryptToken(newRefreshToken) : null,
					expires_at: newExpiresAt ? new Date(newExpiresAt).toISOString() : null,
					updated_at: new Date().toISOString(),
				})
				.eq('id', connection.id);
		} catch (err) {
			console.error('Failed to refresh LinkedIn token:', err);
			// Continue with existing token if refresh fails
		}
	}

	// Get or fetch person_urn
	let personUrn = connection.person_urn;
	if (!personUrn) {
		try {
			// Fetch person URN from LinkedIn API
			// Use /v2/me endpoint which returns the person URN
			const profileRes = await fetch('https://api.linkedin.com/v2/me', {
				headers: {
					Authorization: `Bearer ${accessToken}`,
				},
			});

			if (profileRes.ok) {
				const profile = await profileRes.json();
				// LinkedIn returns id as "urn:li:person:{id}" format
				personUrn = profile.id || null;

				// Ensure it's in the correct format
				if (personUrn && !personUrn.startsWith('urn:li:person:')) {
					personUrn = `urn:li:person:${personUrn}`;
				}

				// Save person_urn for future use
				if (personUrn) {
					await supabase
						.from('social_connections')
						.update({ person_urn: personUrn })
						.eq('id', connection.id);
				}
			}
		} catch (err) {
			console.error('Failed to fetch person_urn:', err);
		}
	}

	if (!personUrn) {
		throw new Error('Could not determine LinkedIn person_urn');
	}

	return {
		accessToken,
		personUrn,
	};
}

/**
 * Publish a text post to LinkedIn
 * For Creator tier: text only, no images
 */
export async function publishToLinkedIn(
	accessToken: string,
	personUrn: string,
	content: {
		title?: string;
		body: string;
		hashtags?: string;
	}
): Promise<PublishResult> {
	// Build post text: combine title (if provided), body, and hashtags
	let postText = '';
	if (content.title && content.title.trim()) {
		postText += `${content.title}\n\n`;
	}
	postText += content.body.trim();

	// Add hashtags at the end if provided
	if (content.hashtags && content.hashtags.trim()) {
		// Ensure hashtags start with # and are space-separated
		const hashtagString = content.hashtags
			.split(/\s+/)
			.map((tag) => (tag.startsWith('#') ? tag : `#${tag}`))
			.join(' ');
		postText += `\n\n${hashtagString}`;
	}

	// Validate content is not empty
	if (!postText.trim()) {
		return {
			success: false,
			error: 'Post content cannot be empty',
		};
	}

	// Ensure person_urn is in correct format
	// LinkedIn API expects: urn:li:person:{id}
	let formattedPersonUrn = personUrn;
	if (!formattedPersonUrn.startsWith('urn:li:person:')) {
		formattedPersonUrn = `urn:li:person:${formattedPersonUrn}`;
	}

	// LinkedIn UGC Posts API payload
	// Using UGC Posts API (v2) for text posts
	const payload = {
		author: formattedPersonUrn,
		lifecycleState: 'PUBLISHED',
		specificContent: {
			'com.linkedin.ugc.ShareContent': {
				shareCommentary: {
					text: postText,
				},
				shareMediaCategory: 'NONE', // Text only, no media
			},
		},
		visibility: {
			'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC',
		},
	};

	try {
		const response = await fetch('https://api.linkedin.com/v2/ugcPosts', {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${accessToken}`,
				'Content-Type': 'application/json',
				'X-Restli-Protocol-Version': '2.0.0',
			},
			body: JSON.stringify(payload),
		});

		if (!response.ok) {
			const errorText = await response.text();
			console.error('LinkedIn API error:', errorText);
			return {
				success: false,
				error: `LinkedIn API error: ${response.status} ${errorText}`,
			};
		}

		const result = await response.json();
		const postId = result.id || result;

		// Build published URL (LinkedIn doesn't return direct URL, so we construct it)
		// Format: https://www.linkedin.com/feed/update/{postId}
		const publishedUrl = postId
			? `https://www.linkedin.com/feed/update/${postId.replace('urn:li:ugcPost:', '')}`
			: undefined;

		return {
			success: true,
			published_url: publishedUrl,
			linkedin_post_id: typeof postId === 'string' ? postId : JSON.stringify(postId),
		};
	} catch (error: any) {
		console.error('LinkedIn publish error:', error);
		return {
			success: false,
			error: error?.message || 'Failed to publish to LinkedIn',
		};
	}
}

