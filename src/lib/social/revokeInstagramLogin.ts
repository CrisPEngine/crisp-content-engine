import { revokeNativeAuthorizationByProviderAccountId } from '@/lib/social/revokeNativeAuthorization';
import { SOCIAL_PROVIDERS } from '@/lib/social/providers';

/**
 * Revoke Instagram Login authorization for an Instagram-scoped user id (Meta data deletion / deauthorize).
 * Does not touch legacy meta_connections, meta_pages, or page-linked Instagram rows.
 */
export async function revokeInstagramLoginByProviderAccountId(instagramUserId: string): Promise<{ removedAuthorizations: number }> {
	return revokeNativeAuthorizationByProviderAccountId(SOCIAL_PROVIDERS.INSTAGRAM, instagramUserId);
}
