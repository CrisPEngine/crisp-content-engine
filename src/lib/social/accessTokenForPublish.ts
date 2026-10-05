import { getSupabaseService } from '@/lib/supabaseService';
import { decryptMetaToken } from '@/lib/meta/graph';
import { getAuthorizationSecrets } from '@/lib/social/authorizationSecrets';
import { DESTINATION_TYPES, SOCIAL_PROVIDERS } from '@/lib/social/providers';
import type { ResolvedPublishDestination } from '@/lib/social/resolveDestination';

export type PublishAccess = {
	accessToken: string;
	/** Instagram / Threads user id for Graph calls */
	providerUserId: string;
	source: 'instagram_login' | 'facebook_page' | 'threads_login';
};

export async function accessTokenForResolvedDestination(
	userId: string,
	resolved: ResolvedPublishDestination
): Promise<PublishAccess | null> {
	const admin = getSupabaseService();

	if (resolved.channel === 'instagram' && resolved.authorizationId) {
		const { data: destination } = await admin
			.from('social_destinations')
			.select('destination_type, authorization_id')
			.eq('id', resolved.destinationId || '')
			.maybeSingle();

		if (destination?.destination_type === DESTINATION_TYPES.INSTAGRAM_PROFESSIONAL) {
			const secrets = await getAuthorizationSecrets(resolved.authorizationId);
			if (!secrets) return null;
			return {
				accessToken: secrets.accessToken,
				providerUserId: resolved.providerDestinationId,
				source: 'instagram_login',
			};
		}
	}

	if (resolved.channel === 'threads' && resolved.authorizationId) {
		const secrets = await getAuthorizationSecrets(resolved.authorizationId);
		if (!secrets) return null;
		return {
			accessToken: secrets.accessToken,
			providerUserId: resolved.providerDestinationId,
			source: 'threads_login',
		};
	}

	if (resolved.channel === 'instagram' || resolved.channel === 'facebook') {
		const igUserId = resolved.channel === 'instagram' ? resolved.providerDestinationId : null;
		if (resolved.channel === 'instagram' && igUserId) {
			const { data: igAccount } = await admin
				.from('meta_instagram_accounts')
				.select('connected_page_id')
				.eq('user_id', userId)
				.eq('ig_user_id', igUserId)
				.maybeSingle();
			if (!igAccount) return null;
			const { data: page } = await admin
				.from('meta_pages')
				.select('page_access_token_encrypted')
				.eq('user_id', userId)
				.eq('page_id', igAccount.connected_page_id)
				.maybeSingle();
			if (!page?.page_access_token_encrypted) return null;
			const token = decryptMetaToken(page.page_access_token_encrypted);
			if (!token) return null;
			return {
				accessToken: token,
				providerUserId: igUserId,
				source: 'facebook_page',
			};
		}
		if (resolved.channel === 'facebook') {
			const { data: page } = await admin
				.from('meta_pages')
				.select('page_access_token_encrypted')
				.eq('user_id', userId)
				.eq('page_id', resolved.providerDestinationId)
				.maybeSingle();
			if (!page?.page_access_token_encrypted) return null;
			const token = decryptMetaToken(page.page_access_token_encrypted);
			if (!token) return null;
			return {
				accessToken: token,
				providerUserId: resolved.providerDestinationId,
				source: 'facebook_page',
			};
		}
	}

	if (resolved.provider === SOCIAL_PROVIDERS.INSTAGRAM && resolved.authorizationId) {
		const secrets = await getAuthorizationSecrets(resolved.authorizationId);
		if (!secrets) return null;
		return {
			accessToken: secrets.accessToken,
			providerUserId: resolved.providerDestinationId,
			source: 'instagram_login',
		};
	}

	return null;
}
