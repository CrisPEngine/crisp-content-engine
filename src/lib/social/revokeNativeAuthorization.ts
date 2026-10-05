import { getSupabaseService } from '@/lib/supabaseService';
import { deleteAuthorizationSecrets } from '@/lib/social/authorizationSecrets';

/**
 * Remove a native OAuth authorization and its destinations.
 * Deletes brand_destinations links first; does not touch legacy Meta/LinkedIn tables.
 */
export async function revokeNativeAuthorizationById(
	ownerUserId: string,
	authorizationId: string
): Promise<{ removed: boolean }> {
	const admin = getSupabaseService();
	const { data: auth } = await admin
		.from('social_authorizations')
		.select('id, owner_user_id')
		.eq('id', authorizationId)
		.eq('owner_user_id', ownerUserId)
		.maybeSingle();

	if (!auth) return { removed: false };

	const { data: destinations } = await admin.from('social_destinations').select('id').eq('authorization_id', auth.id);
	const destIds = (destinations || []).map((d) => d.id);
	if (destIds.length > 0) {
		await admin.from('brand_destinations').delete().in('destination_id', destIds);
		await admin.from('social_destinations').delete().in('id', destIds);
	}

	await deleteAuthorizationSecrets(auth.id);
	await admin.from('social_authorizations').delete().eq('id', auth.id);
	return { removed: true };
}

export async function revokeNativeAuthorizationByProviderAccountId(
	provider: string,
	providerAccountId: string
): Promise<{ removedAuthorizations: number }> {
	const admin = getSupabaseService();
	const { data: auths } = await admin
		.from('social_authorizations')
		.select('id, owner_user_id')
		.eq('provider', provider)
		.eq('provider_account_id', String(providerAccountId));

	if (!auths?.length) return { removedAuthorizations: 0 };

	let removed = 0;
	for (const auth of auths) {
		const result = await revokeNativeAuthorizationById(auth.owner_user_id, auth.id);
		if (result.removed) removed++;
	}
	return { removedAuthorizations: removed };
}
