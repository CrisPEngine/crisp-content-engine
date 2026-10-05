import { getSupabaseService } from '@/lib/supabaseService';
import { deleteAuthorizationSecrets } from '@/lib/social/authorizationSecrets';
import { SOCIAL_PROVIDERS } from '@/lib/social/providers';

/**
 * Revoke Instagram Login authorization for an Instagram-scoped user id (Meta data deletion / deauthorize).
 * Does not touch legacy meta_connections, meta_pages, or page-linked Instagram rows.
 */
export async function revokeInstagramLoginByProviderAccountId(instagramUserId: string): Promise<{ removedAuthorizations: number }> {
	const admin = getSupabaseService();
	const { data: auths } = await admin
		.from('social_authorizations')
		.select('id, owner_user_id')
		.eq('provider', SOCIAL_PROVIDERS.INSTAGRAM)
		.eq('provider_account_id', String(instagramUserId));

	if (!auths?.length) {
		return { removedAuthorizations: 0 };
	}

	let removed = 0;
	for (const auth of auths) {
		const { data: destinations } = await admin
			.from('social_destinations')
			.select('id')
			.eq('authorization_id', auth.id);

		const destIds = (destinations || []).map((d) => d.id);
		if (destIds.length > 0) {
			await admin.from('brand_destinations').delete().in('destination_id', destIds);
			await admin.from('social_destinations').delete().in('id', destIds);
		}

		await deleteAuthorizationSecrets(auth.id);
		await admin.from('social_authorizations').delete().eq('id', auth.id);
		removed++;
	}

	return { removedAuthorizations: removed };
}
