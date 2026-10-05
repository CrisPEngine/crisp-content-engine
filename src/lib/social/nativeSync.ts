import { getSupabaseService } from '@/lib/supabaseService';
import { connectionHealth } from '@/lib/social/destinations';
import { channelFromPlatform, purposeForChannel, type PublishChannel } from '@/lib/social/channels';

type Admin = ReturnType<typeof getSupabaseService>;
const META_PROVIDER = 'meta';
const LINKEDIN_PROVIDER = 'linkedin';

async function resolveBrandBrainId(admin: Admin, userId: string, airtableBrandId: string | null | undefined): Promise<string | null> {
	if (!airtableBrandId) return null;
	const { data } = await admin
		.from('brand_brains')
		.select('id')
		.eq('user_id', userId)
		.eq('airtable_brand_id', airtableBrandId)
		.maybeSingle();
	return data?.id ?? null;
}

async function upsertAuthorization(
	admin: Admin,
	input: {
		ownerUserId: string;
		provider: string;
		providerAccountId: string;
		scopes: string[];
		expiresAt?: string | null;
	}
): Promise<string> {
	const status = connectionHealth({ expiresAt: input.expiresAt ?? undefined });
	const { data: existing } = await admin
		.from('social_authorizations')
		.select('id')
		.eq('owner_user_id', input.ownerUserId)
		.eq('provider', input.provider)
		.eq('provider_account_id', input.providerAccountId)
		.maybeSingle();

	if (existing?.id) {
		await admin
			.from('social_authorizations')
			.update({
				scopes: input.scopes,
				expires_at: input.expiresAt ?? null,
				status,
			})
			.eq('id', existing.id);
		return existing.id;
	}

	const { data, error } = await admin
		.from('social_authorizations')
		.insert({
			owner_user_id: input.ownerUserId,
			provider: input.provider,
			provider_account_id: input.providerAccountId,
			scopes: input.scopes,
			expires_at: input.expiresAt ?? null,
			status,
		})
		.select('id')
		.single();

	if (error || !data?.id) {
		throw new Error(`Failed to insert social_authorizations: ${error?.message || 'unknown'}`);
	}
	return data.id as string;
}

async function upsertDestination(
	admin: Admin,
	input: {
		authorizationId: string;
		provider: string;
		destinationType: string;
		providerDestinationId: string;
		displayName: string;
		handle?: string | null;
	}
): Promise<string> {
	const { data, error } = await admin
		.from('social_destinations')
		.upsert(
			{
				authorization_id: input.authorizationId,
				provider: input.provider,
				destination_type: input.destinationType,
				provider_destination_id: input.providerDestinationId,
				display_name: input.displayName,
				handle: input.handle ?? null,
				status: 'CONNECTED',
			},
			{ onConflict: 'authorization_id,provider_destination_id' }
		)
		.select('id')
		.single();

	if (error || !data?.id) {
		throw new Error(`Failed to upsert social_destinations: ${error?.message || 'unknown'}`);
	}
	return data.id as string;
}

async function ensureBrandLink(
	admin: Admin,
	brandId: string,
	destinationId: string,
	channel: PublishChannel
): Promise<void> {
	const purpose = purposeForChannel(channel);
	await admin.from('brand_destinations').upsert(
		{
			brand_id: brandId,
			destination_id: destinationId,
			purpose,
			enabled: true,
		},
		{ onConflict: 'brand_id,destination_id,purpose' }
	);
}

/**
 * Mirror legacy Meta + LinkedIn rows into social_authorizations / social_destinations.
 * Creates brand_destinations only when legacy brand assignment is explicit (LinkedIn brand_profile_id)
 * or when linking selected Meta destinations to a brand that already has an explicit LinkedIn assignment
 * for the same user (CrisP path — selected workspace Meta + assigned LinkedIn org for canonical Airtable id).
 */
export async function syncNativeSocialForUser(userId: string): Promise<{ authorizations: number; destinations: number; brandLinks: number }> {
	const admin = getSupabaseService();
	let authorizations = 0;
	let destinations = 0;
	let brandLinks = 0;

	const { data: metaConnections } = await admin.from('meta_connections').select('*').eq('user_id', userId);
	for (const conn of metaConnections || []) {
		const authId = await upsertAuthorization(admin, {
			ownerUserId: userId,
			provider: META_PROVIDER,
			providerAccountId: conn.facebook_user_id,
			scopes: Array.isArray((conn.scopes_granted as any)?.scopes)
				? (conn.scopes_granted as any).scopes
				: [],
			expiresAt: conn.token_expires_at,
		});
		authorizations++;

		const { data: pages } = await admin
			.from('meta_pages')
			.select('page_id, page_name, is_selected, meta_connection_id')
			.eq('user_id', userId);

		for (const page of pages || []) {
			if (conn.meta_connection_id && page.meta_connection_id && page.meta_connection_id !== conn.id) continue;
			if (!conn.meta_connection_id && metaConnections!.length > 1) {
				// Without connection scoping, skip ambiguous multi-auth pages
				continue;
			}
			const destId = await upsertDestination(admin, {
				authorizationId: authId,
				provider: META_PROVIDER,
				destinationType: 'page',
				providerDestinationId: page.page_id,
				displayName: page.page_name,
			});
			destinations++;

			if (page.is_selected) {
				const crispBrain = await resolveBrandBrainForSelectedMeta(admin, userId);
				if (crispBrain) {
					await ensureBrandLink(admin, crispBrain, destId, 'facebook');
					brandLinks++;
				}
			}
		}

		const { data: igAccounts } = await admin
			.from('meta_instagram_accounts')
			.select('ig_user_id, ig_username, is_selected, meta_connection_id')
			.eq('user_id', userId);

		for (const ig of igAccounts || []) {
			if (conn.meta_connection_id && ig.meta_connection_id && ig.meta_connection_id !== conn.id) continue;
			if (!conn.meta_connection_id && metaConnections!.length > 1) continue;
			const destId = await upsertDestination(admin, {
				authorizationId: authId,
				provider: META_PROVIDER,
				destinationType: 'instagram',
				providerDestinationId: ig.ig_user_id,
				displayName: ig.ig_username ? `@${ig.ig_username.replace(/^@/, '')}` : 'Instagram',
				handle: ig.ig_username,
			});
			destinations++;

			if (ig.is_selected) {
				const crispBrain = await resolveBrandBrainForSelectedMeta(admin, userId);
				if (crispBrain) {
					await ensureBrandLink(admin, crispBrain, destId, 'instagram');
					brandLinks++;
				}
			}
		}
	}

	const { data: linkedInConnections } = await admin
		.from('social_connections')
		.select('*')
		.eq('user_id', userId)
		.eq('provider', 'linkedin');

	for (const connection of linkedInConnections || []) {
		const accountKey = connection.organisation_urn || connection.person_urn || connection.id;
		const authId = await upsertAuthorization(admin, {
			ownerUserId: userId,
			provider: LINKEDIN_PROVIDER,
			providerAccountId: accountKey,
			scopes: [],
			expiresAt: connection.expires_at,
		});
		authorizations++;

		const isOrg = connection.connection_type === 'organization' || !!connection.organisation_urn;
		const providerDestinationId = isOrg
			? String(connection.organisation_urn || connection.id)
			: String(connection.person_urn || connection.id);

		const destId = await upsertDestination(admin, {
			authorizationId: authId,
			provider: LINKEDIN_PROVIDER,
			destinationType: isOrg ? 'organization' : 'profile',
			providerDestinationId,
			displayName: connection.account_name || (isOrg ? 'LinkedIn Company Page' : 'LinkedIn Profile'),
		});
		destinations++;

		if (connection.brand_profile_id) {
			const brandId = await resolveBrandBrainId(admin, userId, connection.brand_profile_id);
			if (brandId) {
				await ensureBrandLink(admin, brandId, destId, 'linkedin');
				brandLinks++;
			}
		}
	}

	return { authorizations, destinations, brandLinks };
}

/** When legacy Meta is_selected is workspace-global, only auto-map to a brand with an assigned LinkedIn org connection. */
async function resolveBrandBrainForSelectedMeta(admin: Admin, userId: string): Promise<string | null> {
	const { data: assigned } = await admin
		.from('social_connections')
		.select('brand_profile_id')
		.eq('user_id', userId)
		.eq('provider', 'linkedin')
		.not('brand_profile_id', 'is', null)
		.limit(1)
		.maybeSingle();

	if (!assigned?.brand_profile_id) return null;
	return resolveBrandBrainId(admin, userId, assigned.brand_profile_id);
}

export async function assignBrandDestination(input: {
	userId: string;
	brandId: string;
	destinationId: string;
	channel: PublishChannel;
}): Promise<void> {
	const admin = getSupabaseService();

	const { data: brand } = await admin
		.from('brand_brains')
		.select('id')
		.eq('id', input.brandId)
		.eq('user_id', input.userId)
		.maybeSingle();
	if (!brand) throw new Error('Brand not found');

	const { data: destination } = await admin
		.from('social_destinations')
		.select('id, authorization_id')
		.eq('id', input.destinationId)
		.maybeSingle();
	if (!destination) throw new Error('Destination not found');

	const { data: auth } = await admin
		.from('social_authorizations')
		.select('owner_user_id')
		.eq('id', destination.authorization_id)
		.maybeSingle();
	if (!auth || auth.owner_user_id !== input.userId) throw new Error('Destination not available for this user');

	await ensureBrandLink(admin, input.brandId, input.destinationId, input.channel);
}

export function channelForDestinationType(destinationType: string, provider: string): PublishChannel | null {
	if (provider === META_PROVIDER) {
		if (destinationType === 'page') return 'facebook';
		if (destinationType === 'instagram') return 'instagram';
	}
	if (provider === LINKEDIN_PROVIDER) {
		if (destinationType === 'organization' || destinationType === 'profile') return 'linkedin';
	}
	return channelFromPlatform(destinationType);
}
