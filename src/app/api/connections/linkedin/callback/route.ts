import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { getSupabaseService } from '@/lib/supabaseService';
import { encryptToken } from '@/lib/encryption';
import { retryFailedPostsAfterReconnection } from '@/lib/retryFailedPosts';

export const runtime = 'nodejs';

async function exchangeCodeForTokens(code: string, redirectUri: string) {
	const clientId = process.env.LINKEDIN_CLIENT_ID;
	const clientSecret = process.env.LINKEDIN_CLIENT_SECRET;

	if (!clientId || !clientSecret) {
		throw new Error('LinkedIn client credentials not configured');
	}

	const body = new URLSearchParams();
	body.set('grant_type', 'authorization_code');
	body.set('code', code);
	body.set('redirect_uri', redirectUri);
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
		throw new Error(`LinkedIn token exchange failed: ${errorText}`);
	}

	return res.json();
}

async function fetchLinkedInProfile(accessToken: string) {
	// Try the new OIDC userinfo endpoint first (for openid, profile, email scopes)
	let res = await fetch('https://api.linkedin.com/v2/userinfo', {
		headers: {
			Authorization: `Bearer ${accessToken}`,
		},
	});

	// If that fails, fall back to the legacy v2/me endpoint
	if (!res.ok) {
		res = await fetch('https://api.linkedin.com/v2/me?projection=(id,localizedFirstName,localizedLastName,profilePicture(displayImage~:playableStreams))', {
			headers: {
				Authorization: `Bearer ${accessToken}`,
			},
		});
	}

	if (!res.ok) {
		const errorText = await res.text();
		throw new Error(`Failed to fetch LinkedIn profile: ${errorText}`);
	}

	return res.json();
}

function extractProfileDetails(profile: any) {
	// Handle OIDC userinfo format (new)
	if (profile?.sub) {
		// OIDC format: sub is the user ID, given_name/family_name for names, picture for avatar
		const firstName = profile?.given_name ?? '';
		const lastName = profile?.family_name ?? '';
		const displayName = [firstName, lastName].filter(Boolean).join(' ').trim() || profile?.name || 'LinkedIn Member';
		const personUrn = profile?.sub ? `urn:li:person:${profile.sub}` : null;
		
		return {
			personUrn,
			displayName,
			avatarUrl: profile?.picture ?? null,
		};
	}

	// Handle legacy v2/me format (fallback)
	const firstName = profile?.localizedFirstName ?? '';
	const lastName = profile?.localizedLastName ?? '';
	const displayName = [firstName, lastName].filter(Boolean).join(' ').trim();
	const imageStreams = profile?.profilePicture?.['displayImage~']?.elements ?? [];
	const lastElement = imageStreams[imageStreams.length - 1];
	const avatarUrl = lastElement?.identifiers?.[0]?.identifier ?? null;

	return {
		personUrn: profile?.id ? `urn:li:person:${profile.id}` : null,
		displayName: displayName || 'LinkedIn Member',
		avatarUrl,
	};
}

/**
 * Fetch LinkedIn organizations where the user has admin access
 */
async function fetchLinkedInOrganizations(accessToken: string) {
	try {
		// Fetch organizations where user is an admin
		const res = await fetch(
			'https://api.linkedin.com/v2/organizationalEntityAcls?q=roleAssignee&role=ADMINISTRATOR&state=APPROVED',
			{
				headers: {
					Authorization: `Bearer ${accessToken}`,
					'X-Restli-Protocol-Version': '2.0.0',
				},
			}
		);

		if (!res.ok) {
			const errorText = await res.text();
			console.warn('Failed to fetch organizations:', errorText);
			return [];
		}

		const data = await res.json();
		const organizations = data.elements || [];

		// Extract organization URNs
		const orgUrns = organizations
			.map((org: any) => org.organizationalTarget)
			.filter(Boolean);

		// Fetch details for each organization
		const orgDetails = await Promise.all(
			orgUrns.map(async (urn: string) => {
				try {
					// Extract organization ID from URN (format: urn:li:organization:123456)
					const orgId = urn.replace('urn:li:organization:', '');
					const orgRes = await fetch(
						`https://api.linkedin.com/v2/organizations/${orgId}?projection=(id,name,logoV2(original~:playableStreams))`,
						{
							headers: {
								Authorization: `Bearer ${accessToken}`,
								'X-Restli-Protocol-Version': '2.0.0',
							},
						}
					);

					if (orgRes.ok) {
						const orgData = await orgRes.json();
						const logoElements = orgData?.logoV2?.['original~']?.elements || [];
						const logoUrl = logoElements[logoElements.length - 1]?.identifiers?.[0]?.identifier || null;

						// Parse organization name - LinkedIn returns it in localized format
						let orgName = 'Company Page';
						if (orgData?.name) {
							let nameObj: any = orgData.name;
							
							// If name is a JSON string, parse it first
							if (typeof nameObj === 'string' && nameObj.trim().startsWith('{')) {
								try {
									nameObj = JSON.parse(nameObj);
								} catch {
									// If parsing fails, use the string as-is
									orgName = nameObj;
								}
							}
							
							// If it's already a parsed object with localized data
							if (typeof nameObj === 'object' && nameObj !== null) {
								if (nameObj.localized && typeof nameObj.localized === 'object') {
									// Try to get the preferred locale first
									const preferredLocale = nameObj.preferredLocale;
									if (preferredLocale?.language && preferredLocale?.country) {
										const localeKey = `${preferredLocale.language}_${preferredLocale.country}`;
										if (nameObj.localized[localeKey]) {
											orgName = nameObj.localized[localeKey];
										}
									}
									
									// Fall back to first available locale if preferred not found
									if (orgName === 'Company Page') {
										const locales = Object.keys(nameObj.localized);
										if (locales.length > 0) {
											orgName = nameObj.localized[locales[0]];
										}
									}
								} else if (typeof nameObj === 'string') {
									// If it's just a plain string after parsing
									orgName = nameObj;
								}
							} else if (typeof nameObj === 'string') {
								// If it's a plain string
								orgName = nameObj;
							}
						}

						return {
							urn,
							name: orgName,
							logoUrl,
						};
					}
				} catch (err) {
					console.warn(`Failed to fetch details for organization ${urn}:`, err);
				}

				return {
					urn,
					name: 'Company Page',
					logoUrl: null,
				};
			})
		);

		return orgDetails;
	} catch (error) {
		console.error('Error fetching organizations:', error);
		return [];
	}
}

export async function GET(request: Request) {
	const url = new URL(request.url);
	const code = url.searchParams.get('code');
	const state = url.searchParams.get('state');
	const error = url.searchParams.get('error');

	const redirectBase = process.env.NEXT_PUBLIC_SITE_URL || 'https://app.crispdigital.io';
	const redirectUri = process.env.LINKEDIN_REDIRECT_URI || `${redirectBase}/api/connections/linkedin/callback`;

	if (error) {
		console.error('LinkedIn OAuth error:', error);
		return NextResponse.redirect(`${redirectBase}/connections?error=${encodeURIComponent(error)}`);
	}

	if (!code || !state) {
		return NextResponse.redirect(`${redirectBase}/connections?error=invalid_response`);
	}

	const cookieStore = await cookies();
	const storedState = cookieStore.get('linkedin_oauth_state')?.value;
	const connectionType = cookieStore.get('linkedin_connection_type')?.value || 'personal';
	cookieStore.set('linkedin_oauth_state', '', { path: '/', maxAge: 0 });
	cookieStore.set('linkedin_connection_type', '', { path: '/', maxAge: 0 });

	if (!storedState || storedState !== state) {
		return NextResponse.redirect(`${redirectBase}/connections?error=state_mismatch`);
	}

	const supabase = await createClient();
	const {
		data: { user },
	} = await supabase.auth.getUser();

	if (!user) {
		return NextResponse.redirect(`${redirectBase}/sign-in`);
	}

	try {
		const tokenResponse = await exchangeCodeForTokens(code, redirectUri);
		const accessToken = tokenResponse.access_token as string;
		const refreshToken = tokenResponse.refresh_token as string | undefined;
		const expiresIn = tokenResponse.expires_in as number | undefined;
		const expiresAt = expiresIn ? new Date(Date.now() + expiresIn * 1000) : null;

		const profile = await fetchLinkedInProfile(accessToken);
		const details = extractProfileDetails(profile);
		if (!details.personUrn) {
			throw new Error('Missing LinkedIn person URN');
		}

		const admin = getSupabaseService();

		// Determine connection type: 'member' for personal, 'organization' for business
		const dbConnectionType: 'member' | 'organization' = connectionType === 'business' ? 'organization' : 'member';

		if (connectionType === 'business') {
			// Fetch organizations
			const organizations = await fetchLinkedInOrganizations(accessToken);
			
			if (organizations.length === 0) {
				return NextResponse.redirect(`${redirectBase}/connections?error=no_organizations&details=${encodeURIComponent('No company pages found. You must be an administrator of at least one LinkedIn company page.')}`);
			}

			// Store organizations in a cookie/session so the user can select which one
			// For now, we'll redirect to a selection page
			// Store the access token temporarily in a cookie (encrypted) for the selection step
			const cookieStore = await import('next/headers').then(m => m.cookies());
			
			// Store organizations list and tokens temporarily for organization selection
			// We'll store in a cookie with short expiration (5 minutes)
			cookieStore.set('linkedin_org_selection', JSON.stringify({
				organizations: organizations,
				accessToken: encryptToken(accessToken),
				refreshToken: refreshToken ? encryptToken(refreshToken) : null,
				expiresAt: expiresAt?.toISOString() ?? null,
				personUrn: details.personUrn,
				profile: profile,
			}), {
				httpOnly: true,
				secure: true,
				path: '/',
				maxAge: 300, // 5 minutes
			});

			// Redirect to organization selection page
			return NextResponse.redirect(`${redirectBase}/connections/select-organization`);
		} else {
			// Personal connection (member)
			const connectionData: any = {
				user_id: user.id,
				provider: 'linkedin',
				connection_type: dbConnectionType,
				access_token: encryptToken(accessToken),
				refresh_token: refreshToken ? encryptToken(refreshToken) : null,
				expires_at: expiresAt?.toISOString() ?? null,
				person_urn: details.personUrn,
				account_name: details.displayName,
				account_avatar: details.avatarUrl,
				metadata: {
					...profile,
				},
				needs_reauth: false, // Clear reauth flag on successful connection
				oauth_reconnect_email_sent_at: null, // Reset email sent flag
				updated_at: new Date().toISOString(),
			};

			// Check if connection already exists (by user_id, provider, connection_type)
			// Note: This requires the database migration to be run first
			let existingConnection: { id: string } | null = null;
			try {
				const { data } = await admin
					.from('social_connections')
					.select('id')
					.eq('user_id', user.id)
					.eq('provider', 'linkedin')
					.eq('connection_type', dbConnectionType)
					.maybeSingle();
				existingConnection = data;
			} catch (queryError: any) {
				// If connection_type column doesn't exist, provide helpful error
				if (queryError?.message?.includes('connection_type') || queryError?.message?.includes('column')) {
					throw new Error(`Database migration required: Please run the SQL migration in database_migrations/add_linkedin_connection_types.sql first. See DATABASE_MIGRATION_INSTRUCTIONS.md for details.`);
				}
				throw queryError;
			}

			let connectionId: string;
			let wasReconnection = false;
			let existingBrandProfileIds: string[] = [];

			if (existingConnection) {
				// Check if this was a reconnection (connection had needs_reauth: true)
				const { data: existingConnData } = await admin
					.from('social_connections')
					.select('needs_reauth, brand_profile_id')
					.eq('id', existingConnection.id)
					.single();

				wasReconnection = existingConnData?.needs_reauth === true;
				
				// Get brand_profile_id if it exists
				if (existingConnData?.brand_profile_id) {
					existingBrandProfileIds = Array.isArray(existingConnData.brand_profile_id)
						? existingConnData.brand_profile_id
						: [existingConnData.brand_profile_id];
				}

				// Update existing connection
				const { error: updateError } = await admin
					.from('social_connections')
					.update(connectionData)
					.eq('id', existingConnection.id);
				
				if (updateError) {
					if (updateError.message.includes('connection_type') || updateError.message.includes('organization_urn')) {
						throw new Error(`Database migration required: Please run the SQL migration in database_migrations/add_linkedin_connection_types.sql first. See DATABASE_MIGRATION_INSTRUCTIONS.md for details.`);
					}
					throw new Error(`Failed to update connection: ${updateError.message}`);
				}
				connectionId = existingConnection.id;
			} else {
				// Insert new connection
				const { data: newConnection, error: insertError } = await admin
					.from('social_connections')
					.insert(connectionData)
					.select('id')
					.single();
				
				if (insertError || !newConnection) {
					if (insertError?.message?.includes('connection_type') || insertError?.message?.includes('organization_urn') || insertError?.message?.includes('constraint')) {
						throw new Error(`Database migration required: Please run the SQL migration in database_migrations/add_linkedin_connection_types.sql first. See DATABASE_MIGRATION_INSTRUCTIONS.md for details. Original error: ${insertError.message}`);
					}
					throw new Error(`Failed to save connection: ${insertError?.message || 'Unknown error'}`);
				}
				connectionId = newConnection.id;
			}

			// If this was a reconnection, retry failed posts
			// Do this in a non-blocking way so it doesn't delay the redirect
			if (wasReconnection) {
				console.log(`[LinkedIn Callback] Reconnection detected for connection ${connectionId}, retrying failed posts...`);
				console.log(`[LinkedIn Callback] Brand profile IDs: ${existingBrandProfileIds.length > 0 ? existingBrandProfileIds.join(', ') : 'none (will query by user_id)'}`);
				
				retryFailedPostsAfterReconnection({
					connectionId,
					brandProfileIds: existingBrandProfileIds,
					userId: user.id, // Pass user_id as fallback if no brand_profile_ids
				}).then((result) => {
					console.log(`[LinkedIn Callback] Retry completed: ${result.reset} posts reset, ${result.errors.length} errors`);
					if (result.errors.length > 0) {
						console.error(`[LinkedIn Callback] Retry errors:`, result.errors);
					}
				}).catch((error) => {
					console.error(`[LinkedIn Callback] Failed to retry posts after reconnection:`, error);
					// Don't throw - this is non-critical
				});
			} else {
				console.log(`[LinkedIn Callback] Not a reconnection (wasReconnection=${wasReconnection}), skipping retry`);
			}

			// Redirect to brand assignment page
			return NextResponse.redirect(`${redirectBase}/connections/assign-brand?connection_id=${connectionId}&type=personal&redirect_to=connections`);
		}
	} catch (err: any) {
		console.error('LinkedIn OAuth callback error:', err);
		console.error('Error details:', {
			message: err?.message,
			stack: err?.stack,
			name: err?.name,
		});
		// Include error message in URL for debugging (will be visible in browser console)
		const errorMsg = err?.message ? encodeURIComponent(err.message.substring(0, 100)) : 'linkedin_auth_failed';
		return NextResponse.redirect(`${redirectBase}/connections?error=linkedin_auth_failed&details=${errorMsg}`);
	}
}
