import { getSupabaseService } from '@/lib/supabaseService';
import { connectionHealth } from '@/lib/social/destinations';
import { upsertAuthorizationSecrets } from '@/lib/social/authorizationSecrets';
import { purposeForChannel, type PublishChannel } from '@/lib/social/channels';

type Admin = ReturnType<typeof getSupabaseService>;

export async function upsertSocialAuthorization(input: {
	ownerUserId: string;
	provider: string;
	providerAccountId: string;
	scopes: string[];
	expiresAt?: string | null;
}): Promise<string> {
	const admin = getSupabaseService();
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
			.update({ scopes: input.scopes, expires_at: input.expiresAt ?? null, status })
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
	if (error || !data?.id) throw new Error(error?.message || 'Failed to create authorization');
	return data.id;
}

export async function upsertSocialDestination(input: {
	authorizationId: string;
	provider: string;
	destinationType: string;
	providerDestinationId: string;
	displayName: string;
	handle?: string | null;
}): Promise<string> {
	const admin = getSupabaseService();
	const { data: existing } = await admin
		.from('social_destinations')
		.select('id')
		.eq('authorization_id', input.authorizationId)
		.eq('provider_destination_id', input.providerDestinationId)
		.maybeSingle();

	if (existing?.id) {
		await admin
			.from('social_destinations')
			.update({
				display_name: input.displayName,
				handle: input.handle ?? null,
				status: 'CONNECTED',
				destination_type: input.destinationType,
				provider: input.provider,
			})
			.eq('id', existing.id);
		return existing.id;
	}

	const { data, error } = await admin
		.from('social_destinations')
		.insert({
			authorization_id: input.authorizationId,
			provider: input.provider,
			destination_type: input.destinationType,
			provider_destination_id: input.providerDestinationId,
			display_name: input.displayName,
			handle: input.handle ?? null,
			status: 'CONNECTED',
		})
		.select('id')
		.single();
	if (error || !data?.id) throw new Error(error?.message || 'Failed to create destination');
	return data.id;
}

export async function linkBrandDestination(brandId: string, destinationId: string, channel: PublishChannel): Promise<void> {
	const admin = getSupabaseService();
	await admin.from('brand_destinations').upsert(
		{
			brand_id: brandId,
			destination_id: destinationId,
			purpose: purposeForChannel(channel),
			enabled: true,
		},
		{ onConflict: 'brand_id,destination_id,purpose' }
	);
}

export async function persistOAuthAuthorization(input: {
	ownerUserId: string;
	provider: string;
	providerAccountId: string;
	scopes: string[];
	expiresAt?: string | null;
	accessToken: string;
	refreshToken?: string | null;
	destination: {
		destinationType: string;
		providerDestinationId: string;
		displayName: string;
		handle?: string | null;
	};
	brandId?: string | null;
	channel?: PublishChannel | null;
}): Promise<{ authorizationId: string; destinationId: string }> {
	const authorizationId = await upsertSocialAuthorization({
		ownerUserId: input.ownerUserId,
		provider: input.provider,
		providerAccountId: input.providerAccountId,
		scopes: input.scopes,
		expiresAt: input.expiresAt,
	});
	await upsertAuthorizationSecrets(authorizationId, {
		accessToken: input.accessToken,
		refreshToken: input.refreshToken,
		expiresAt: input.expiresAt,
	});
	const destinationId = await upsertSocialDestination({
		authorizationId,
		provider: input.provider,
		destinationType: input.destination.destinationType,
		providerDestinationId: input.destination.providerDestinationId,
		displayName: input.destination.displayName,
		handle: input.destination.handle,
	});
	if (input.brandId && input.channel) {
		const admin = getSupabaseService();
		const { data: brand } = await admin
			.from('brand_brains')
			.select('id')
			.eq('id', input.brandId)
			.eq('user_id', input.ownerUserId)
			.maybeSingle();
		if (brand) await linkBrandDestination(input.brandId, destinationId, input.channel);
	}
	return { authorizationId, destinationId };
}
