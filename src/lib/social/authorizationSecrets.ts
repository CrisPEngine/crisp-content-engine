import { getSupabaseService } from '@/lib/supabaseService';
import { decryptMetaToken, encryptMetaToken } from '@/lib/meta/graph';

export type StoredAuthorizationTokens = {
	accessToken: string;
	refreshToken?: string | null;
	expiresAt?: string | null;
};

export async function upsertAuthorizationSecrets(
	authorizationId: string,
	tokens: StoredAuthorizationTokens
): Promise<void> {
	const admin = getSupabaseService();
	await admin.from('social_authorization_secrets').upsert(
		{
			authorization_id: authorizationId,
			access_token_encrypted: encryptMetaToken(tokens.accessToken),
			refresh_token_encrypted: tokens.refreshToken ? encryptMetaToken(tokens.refreshToken) : null,
			expires_at: tokens.expiresAt ?? null,
			updated_at: new Date().toISOString(),
		},
		{ onConflict: 'authorization_id' }
	);
}

export async function getAuthorizationSecrets(authorizationId: string): Promise<StoredAuthorizationTokens | null> {
	const admin = getSupabaseService();
	const { data } = await admin
		.from('social_authorization_secrets')
		.select('access_token_encrypted, refresh_token_encrypted, expires_at')
		.eq('authorization_id', authorizationId)
		.maybeSingle();
	if (!data?.access_token_encrypted) return null;
	const accessToken = decryptMetaToken(data.access_token_encrypted);
	if (!accessToken) return null;
	return {
		accessToken,
		refreshToken: data.refresh_token_encrypted ? decryptMetaToken(data.refresh_token_encrypted) ?? null : null,
		expiresAt: data.expires_at,
	};
}

export async function deleteAuthorizationSecrets(authorizationId: string): Promise<void> {
	const admin = getSupabaseService();
	await admin.from('social_authorization_secrets').delete().eq('authorization_id', authorizationId);
}
