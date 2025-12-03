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
 * Returns error type: 'permanent' or 'transient'
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
		let errorData: any = {};
		try {
			errorData = JSON.parse(errorText);
		} catch {
			// Not JSON, use text as-is
		}

		// Check for permanent errors
		const errorCode = errorData.error || '';
		const permanentErrors = ['invalid_grant', 'invalid_client', 'unauthorized_client', 'invalid_request'];
		
		if (permanentErrors.includes(errorCode)) {
			const error = new Error(`LinkedIn token refresh failed (permanent): ${errorText}`);
			(error as any).isPermanent = true;
			(error as any).errorCode = errorCode;
			throw error;
		}

		// Transient error (network, rate limit, etc.)
		const error = new Error(`LinkedIn token refresh failed (transient): ${errorText}`);
		(error as any).isPermanent = false;
		throw error;
	}

	return res.json();
}

/**
 * Get and refresh LinkedIn connection for a user
 * Returns valid access token and person_urn or organization_urn
 */
export interface LinkedInConnectionResult {
	accessToken: string;
	personUrn: string;
	organizationUrn?: string; // For organization connections
	connectionType: 'member' | 'organization';
}

export interface LinkedInConnectionError {
	error: string;
	isPermanent: boolean;
	requiresReconnect: boolean;
}

/**
 * Get LinkedIn connection by brand_profile_id (preferred - uses brand assignment)
 * Falls back to finding appropriate connection type if no assigned connection exists
 */
export async function getLinkedInConnectionByBrand(
	brandProfileId: string
): Promise<LinkedInConnectionResult | LinkedInConnectionError | null> {
	const supabase = getSupabaseService();

	// First, try to fetch LinkedIn connection assigned to this brand
	const { data: connection, error } = await supabase
		.from('social_connections')
		.select('*')
		.eq('brand_profile_id', brandProfileId)
		.eq('provider', 'linkedin')
		.maybeSingle();

	if (connection && !error) {
		return await processLinkedInConnection(connection, supabase);
	}

	// Fallback: If no assigned connection, fetch brand profile to determine type
	// Then find an appropriate connection for the user
	try {
		const AIRTABLE_TOKEN = process.env.AIRTABLE_PAT;
		const BASE_ID = process.env.AIRTABLE_BASE_ID;
		const BRANDPROFILES_TABLE = process.env.AIRTABLE_BRANDPROFILES_TABLE;

		if (AIRTABLE_TOKEN && BASE_ID && BRANDPROFILES_TABLE) {
			const brandRes = await fetch(`https://api.airtable.com/v0/${BASE_ID}/${BRANDPROFILES_TABLE}/${brandProfileId}`, {
				headers: {
					Authorization: `Bearer ${AIRTABLE_TOKEN}`,
					'Content-Type': 'application/json',
				},
			});

			if (brandRes.ok) {
				const brandRecord = await brandRes.json();
				const brandType = brandRecord.fields?.brand_type || 'company';
				const userId = brandRecord.fields?.user_id;

				if (userId) {
					// Determine expected connection type based on brand type
					const expectedConnectionType = brandType === 'personal' ? 'member' : 'organization';

					// Try to find a connection of the appropriate type for this user
					const { data: fallbackConnection, error: fallbackError } = await supabase
						.from('social_connections')
						.select('*')
						.eq('user_id', userId)
						.eq('provider', 'linkedin')
						.eq('connection_type', expectedConnectionType)
						.maybeSingle();

					if (fallbackConnection && !fallbackError) {
						console.warn(`No connection assigned to brand ${brandProfileId}, using fallback ${expectedConnectionType} connection for user ${userId}`);
						return await processLinkedInConnection(fallbackConnection, supabase);
					}

					// Last resort: try any LinkedIn connection for this user
					const { data: anyConnection, error: anyError } = await supabase
						.from('social_connections')
						.select('*')
						.eq('user_id', userId)
						.eq('provider', 'linkedin')
						.maybeSingle();

					if (anyConnection && !anyError) {
						console.warn(`Using any available LinkedIn connection for user ${userId} (brand ${brandProfileId} has no assigned connection)`);
						return await processLinkedInConnection(anyConnection, supabase);
					}
				}
			}
		}
	} catch (fallbackError) {
		console.error('Error in fallback connection lookup:', fallbackError);
	}

	// If all fallbacks fail, return null
	console.error(`No LinkedIn connection found for brand ${brandProfileId}`);
	return null;
}

/**
 * Get LinkedIn connection for a user (legacy - for backward compatibility)
 * Now tries to get member connection first
 */
export async function getLinkedInConnection(
	userId: string,
	connectionType?: 'member' | 'organization'
): Promise<LinkedInConnectionResult | LinkedInConnectionError | null> {
	const supabase = getSupabaseService();

	// Default to member connection if not specified
	const type = connectionType || 'member';

	// Fetch LinkedIn connection
	const { data: connection, error } = await supabase
		.from('social_connections')
		.select('*')
		.eq('user_id', userId)
		.eq('provider', 'linkedin')
		.eq('connection_type', type)
		.maybeSingle();

	if (error || !connection) {
		return null;
	}

	return await processLinkedInConnection(connection, supabase);
}

/**
 * Process LinkedIn connection: refresh token, get URN, return result
 */
async function processLinkedInConnection(
	connection: any,
	supabase: ReturnType<typeof getSupabaseService>
): Promise<LinkedInConnectionResult | LinkedInConnectionError | null> {
	let accessToken = decryptToken(connection.access_token);
	const refreshToken = connection.refresh_token ? decryptToken(connection.refresh_token) : null;

	if (!accessToken) {
		return null;
	}

	const connectionType = (connection.connection_type as 'member' | 'organization') || 'member';

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
		} catch (err: any) {
			console.error('Failed to refresh LinkedIn token:', err);
			
			// Check if it's a permanent error
			if (err.isPermanent) {
				return {
					error: `LinkedIn connection expired. Please reconnect your LinkedIn account. Error: ${err.message}`,
					isPermanent: true,
					requiresReconnect: true,
				};
			}

			// Transient error - continue with existing token (might still work)
		}
	}

	// For organization connections, use organization_urn
	if (connectionType === 'organization' && connection.organization_urn) {
		// For organization connections, person_urn is optional (it's the admin's URN)
		// We can proceed with just organization_urn
		const personUrn = connection.person_urn || '';
		
		console.log(`[LinkedIn Connection] Organization connection: orgUrn=${connection.organization_urn}, personUrn=${personUrn || 'not set'}`);
		
		return {
			accessToken,
			personUrn, // May be empty for organization connections
			organizationUrn: connection.organization_urn,
			connectionType: 'organization',
		};
	}

	// For member connections, get or fetch person_urn (required)
	let personUrn = connection.person_urn;
	if (!personUrn) {
		console.log('[LinkedIn Connection] person_urn not stored, fetching from LinkedIn API...');
		try {
			// Try multiple endpoints to get person URN
			// Method 1: OIDC userinfo endpoint
			let profileRes = await fetch('https://api.linkedin.com/v2/userinfo', {
				headers: {
					Authorization: `Bearer ${accessToken}`,
				},
			});

			if (profileRes.ok) {
				const profile = await profileRes.json();
				// OIDC userinfo returns sub as the user ID
				const userId = profile.sub || profile.id;
				if (userId) {
					personUrn = userId.startsWith('urn:li:person:') 
						? userId 
						: `urn:li:person:${userId}`;

					console.log(`[LinkedIn Connection] Fetched person_urn from userinfo: ${personUrn}`);

					// Save person_urn for future use
					await supabase
						.from('social_connections')
						.update({ person_urn: personUrn })
						.eq('id', connection.id);
				}
			} else {
				// Method 2: Try profile API endpoint
				console.log('[LinkedIn Connection] userinfo failed, trying profile API...');
				profileRes = await fetch('https://api.linkedin.com/v2/me', {
					headers: {
						Authorization: `Bearer ${accessToken}`,
						'X-Restli-Protocol-Version': '2.0.0',
					},
				});

				if (profileRes.ok) {
					const profile = await profileRes.json();
					// Profile API returns id as the person URN or ID
					const profileId = profile.id;
					if (profileId) {
						personUrn = profileId.startsWith('urn:li:person:') 
							? profileId 
							: `urn:li:person:${profileId}`;

						console.log(`[LinkedIn Connection] Fetched person_urn from profile API: ${personUrn}`);

						// Save person_urn for future use
						await supabase
							.from('social_connections')
							.update({ person_urn: personUrn })
							.eq('id', connection.id);
					}
				} else {
					const errorText = await profileRes.text();
					console.error('[LinkedIn Connection] Failed to fetch person_urn from both endpoints:', profileRes.status, errorText);
				}
			}
		} catch (err) {
			console.error('[LinkedIn Connection] Error fetching person_urn:', err);
		}
	}

	if (!personUrn) {
		// For member connections, person_urn is required
		console.error('[LinkedIn Connection] Could not determine person_urn for member connection:', {
			connectionId: connection.id,
			userId: connection.user_id,
			connectionType: connectionType,
			hasPersonUrn: !!connection.person_urn,
			hasOrganizationUrn: !!connection.organization_urn,
			accountName: connection.account_name,
			accessTokenLength: accessToken?.length || 0,
		});
		
		// Try one more time with a different approach - check if we can extract from metadata
		if (connection.metadata && typeof connection.metadata === 'object') {
			const metadata = connection.metadata as any;
			if (metadata.person_urn) {
				personUrn = metadata.person_urn;
				console.log(`[LinkedIn Connection] Found person_urn in metadata: ${personUrn}`);
				// Save it to the main field
				await supabase
					.from('social_connections')
					.update({ person_urn: personUrn })
					.eq('id', connection.id);
			} else if (metadata.sub) {
				// OIDC sub might be stored in metadata
				const sub = metadata.sub;
				personUrn = sub.startsWith('urn:li:person:') ? sub : `urn:li:person:${sub}`;
				console.log(`[LinkedIn Connection] Found person_urn from metadata.sub: ${personUrn}`);
				await supabase
					.from('social_connections')
					.update({ person_urn: personUrn })
					.eq('id', connection.id);
			}
		}
		
		if (!personUrn) {
			return {
				error: 'Could not determine LinkedIn person_urn. Please reconnect your LinkedIn account.',
				isPermanent: true,
				requiresReconnect: true,
			};
		}
	}

	console.log(`[LinkedIn Connection] Member connection: personUrn=${personUrn}`);
	
	return {
		accessToken,
		personUrn,
		connectionType: 'member',
	};
}

/**
 * Upload an image to LinkedIn Assets API
 * Returns the asset URN needed for image posts
 * Based on LinkedIn UGC Posts API documentation
 */
async function uploadImageToLinkedIn(
	accessToken: string,
	ownerUrn: string, // Can be person or organization URN
	imageUrl: string
): Promise<{ asset: string }> {
	try {
		// Ensure URN is in correct format (could be person or organization)
		let formattedOwnerUrn = ownerUrn;
		if (!formattedOwnerUrn.startsWith('urn:li:')) {
			// If not in URN format, assume it's an ID and format based on whether it looks like an org
			formattedOwnerUrn = formattedOwnerUrn.includes('organization') 
				? `urn:li:organization:${formattedOwnerUrn.replace(/urn:li:organization:/g, '')}`
				: `urn:li:person:${formattedOwnerUrn.replace(/urn:li:person:/g, '')}`;
		}

		// Step 1: Register the image upload with LinkedIn
		const registerResponse = await fetch('https://api.linkedin.com/v2/assets?action=registerUpload', {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${accessToken}`,
				'Content-Type': 'application/json',
				'X-Restli-Protocol-Version': '2.0.0',
			},
			body: JSON.stringify({
				registerUploadRequest: {
					recipes: ['urn:li:digitalmediaRecipe:feedshare-image'],
					owner: formattedOwnerUrn, // Use formatted owner URN (person or organization)
					serviceRelationships: [
						{
							relationshipType: 'OWNER',
							identifier: 'urn:li:userGeneratedContent',
						},
					],
				},
			}),
		});

		if (!registerResponse.ok) {
			const errorText = await registerResponse.text();
			console.error('LinkedIn register upload error:', errorText);
			throw new Error(`Failed to register image upload: ${errorText}`);
		}

		const registerData = await registerResponse.json();
		const uploadUrl = registerData.value?.uploadMechanism?.['com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest']?.uploadUrl;
		const asset = registerData.value?.asset;

		if (!uploadUrl || !asset) {
			console.error('Invalid register response:', registerData);
			throw new Error('Invalid response from LinkedIn image registration');
		}

		// Step 2: Download the image from Cloudinary
		const imageResponse = await fetch(imageUrl);
		if (!imageResponse.ok) {
			throw new Error(`Failed to download image from ${imageUrl}: ${imageResponse.statusText}`);
		}
		
		// Get content type from response or default to jpeg
		const contentType = imageResponse.headers.get('content-type') || 'image/jpeg';
		const imageBuffer = await imageResponse.arrayBuffer();

		// Step 3: Upload the image to LinkedIn using the upload URL
		const uploadResponse = await fetch(uploadUrl, {
			method: 'PUT',
			headers: {
				'Content-Type': contentType,
			},
			body: imageBuffer,
		});

		if (!uploadResponse.ok) {
			const errorText = await uploadResponse.text();
			console.error('LinkedIn image upload error:', errorText);
			throw new Error(`Failed to upload image to LinkedIn: ${errorText}`);
		}

		return { asset };
	} catch (error: any) {
		console.error('LinkedIn image upload error:', error);
		throw new Error(`Failed to upload image to LinkedIn: ${error?.message || 'Unknown error'}`);
	}
}

/**
 * Publish a post to LinkedIn (text or with image)
 * @param idempotencyKey - Optional idempotency key to prevent duplicate posts (uses record ID)
 * @param imageUrl - Optional image URL to include in the post
 */
export async function publishToLinkedIn(
	accessToken: string,
	personUrn: string,
	content: {
		title?: string;
		body: string;
		hashtags?: string;
		imageUrl?: string;
	},
	idempotencyKey?: string,
	organizationUrn?: string
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

	// Determine which URN to use as author
	// For organization posts, use organization_urn; otherwise use person_urn
	const authorUrn = organizationUrn || personUrn;
	
	if (!authorUrn) {
		console.error('[LinkedIn Publish] No author URN available:', { personUrn, organizationUrn });
		return {
			success: false,
			error: 'No author URN available. Please check your LinkedIn connection.',
		};
	}
	
	// Ensure URN is in correct format
	let formattedAuthorUrn = authorUrn;
	if (organizationUrn) {
		// Organization URN format: urn:li:organization:{id}
		if (!formattedAuthorUrn.startsWith('urn:li:organization:')) {
			formattedAuthorUrn = `urn:li:organization:${formattedAuthorUrn.replace('urn:li:organization:', '')}`;
		}
	} else {
		// Person URN format: urn:li:person:{id}
		if (!formattedAuthorUrn.startsWith('urn:li:person:')) {
			formattedAuthorUrn = `urn:li:person:${formattedAuthorUrn}`;
		}
	}

	// Handle image upload if image URL is provided
	// Use authorUrn (organization or person) for image upload ownership
	let mediaAsset: string | undefined;
	if (content.imageUrl && content.imageUrl.trim()) {
		try {
			const imageUploadResult = await uploadImageToLinkedIn(accessToken, formattedAuthorUrn, content.imageUrl);
			mediaAsset = imageUploadResult.asset;
		} catch (error: any) {
			console.error('Failed to upload image, publishing text-only post:', error);
			// Continue with text-only post if image upload fails
		}
	}

	// LinkedIn UGC Posts API payload
	// Using UGC Posts API (v2) for text posts or posts with images
	const shareContent: any = {
		shareCommentary: {
			text: postText,
		},
		shareMediaCategory: mediaAsset ? 'IMAGE' : 'NONE',
	};

	// Add media if image was uploaded successfully
	if (mediaAsset) {
		shareContent.media = [
			{
				status: 'READY',
				media: mediaAsset,
			},
		];
	}

	const payload = {
		author: formattedAuthorUrn, // Use organization or person URN
		lifecycleState: 'PUBLISHED',
		specificContent: {
			'com.linkedin.ugc.ShareContent': shareContent,
		},
		visibility: {
			'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC',
		},
	};

	try {
		const headers: Record<string, string> = {
			Authorization: `Bearer ${accessToken}`,
			'Content-Type': 'application/json',
			'X-Restli-Protocol-Version': '2.0.0',
		};

		// Add idempotency key if provided (prevents duplicate posts)
		if (idempotencyKey) {
			headers['X-Restli-Idempotency-Key'] = idempotencyKey;
		}

		const response = await fetch('https://api.linkedin.com/v2/ugcPosts', {
			method: 'POST',
			headers,
			body: JSON.stringify(payload),
		});

		if (!response.ok) {
			const errorText = await response.text();
			let errorData: any = {};
			try {
				errorData = JSON.parse(errorText);
			} catch {
				// Not JSON
			}

			// Check if post already exists (idempotency - treat as success)
			if (response.status === 409 || errorData.message?.includes('already exists')) {
				console.log('Post already exists (idempotency):', idempotencyKey);
				// Extract post ID from error if available, or use a placeholder
				const existingPostId = errorData.id || idempotencyKey;
				return {
					success: true,
					linkedin_post_id: existingPostId,
					published_url: `https://www.linkedin.com/feed/update/${existingPostId.replace('urn:li:ugcPost:', '')}`,
				};
			}

			console.error('[LinkedIn Publish] API error:', {
				status: response.status,
				statusText: response.statusText,
				errorText,
				errorData,
				authorUrn: formattedAuthorUrn,
				hasImage: !!content.imageUrl,
				postLength: postText.length,
				idempotencyKey: idempotencyKey || 'none',
			});
			return {
				success: false,
				error: `LinkedIn API error (${response.status}): ${errorText}`,
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


