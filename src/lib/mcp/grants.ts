import { hashAgentKey, issueAgentCredential } from '@/lib/agent/credentials';
import { getAgentStore } from '@/lib/agent/controlStore';
import type { CredentialScope } from '@/lib/agent/types';
import { getSupabaseService } from '@/lib/supabaseService';
import { capabilitiesForScopes, newSecret, parseComposite, scopesFromRequest, validPkce, type OAuthScope } from './oauth';

export type OAuthCode = {
	id: string;
	ownerUserId: string;
	codeHash: string;
	clientId: string;
	clientName?: string;
	redirectUri: string;
	challenge: string;
	scopes: OAuthScope[];
	brandIds: string[];
	credentialScope: CredentialScope;
	expiresAt: string;
	usedAt?: string;
};

export type OAuthRefresh = {
	id: string;
	ownerUserId: string;
	tokenHash: string;
	credentialId: string;
	clientId: string;
	scopes: OAuthScope[];
	brandIds: string[];
	credentialScope: CredentialScope;
	expiresAt: string;
	revokedAt?: string;
};

export type OAuthGrantStore = {
	saveCode(code: OAuthCode): Promise<void>;
	getCode(id: string): Promise<OAuthCode | null>;
	saveRefresh(token: OAuthRefresh): Promise<void>;
	getRefresh(id: string): Promise<OAuthRefresh | null>;
};

const memoryCodes = new Map<string, OAuthCode>();
const memoryRefresh = new Map<string, OAuthRefresh>();

export const memoryOauthStore: OAuthGrantStore = {
	async saveCode(code) {
		memoryCodes.set(code.id, code);
	},
	async getCode(id) {
		return memoryCodes.get(id) ?? null;
	},
	async saveRefresh(token) {
		memoryRefresh.set(token.id, token);
	},
	async getRefresh(id) {
		return memoryRefresh.get(id) ?? null;
	},
};

export function resetMemoryOauthStore(): void {
	memoryCodes.clear();
	memoryRefresh.clear();
}

async function saveGrant(id: string, ownerUserId: string, payload: OAuthCode | OAuthRefresh): Promise<void> {
	const { error } = await getSupabaseService().from('agent_records').upsert({
		id,
		owner_user_id: ownerUserId,
		brand_id: null,
		kind: 'mcp_oauth',
		payload,
	});
	if (error) throw new Error(error.message);
}

async function loadGrant<T>(id: string): Promise<T | null> {
	const { data, error } = await getSupabaseService().from('agent_records').select('payload').eq('id', id).eq('kind', 'mcp_oauth').maybeSingle();
	if (error) throw new Error(error.message);
	return (data?.payload as T | undefined) ?? null;
}

export const supabaseOauthStore: OAuthGrantStore = {
	saveCode: (code) => saveGrant(code.id, code.ownerUserId, code),
	getCode: (id) => loadGrant<OAuthCode>(id),
	saveRefresh: (token) => saveGrant(token.id, token.ownerUserId, token),
	getRefresh: (id) => loadGrant<OAuthRefresh>(id),
};

export function createAuthorizationCode(input: {
	ownerUserId: string;
	clientId: string;
	clientName?: string;
	redirectUri: string;
	challenge: string;
	scopes: OAuthScope[];
	brandIds: string[];
	credentialScope: CredentialScope;
}): { code: OAuthCode; publicCode: string } {
	const issued = newSecret('cce_ac_');
	const code: OAuthCode = {
		id: issued.id,
		ownerUserId: input.ownerUserId,
		codeHash: hashAgentKey(issued.secret),
		clientId: input.clientId,
		clientName: input.clientName,
		redirectUri: input.redirectUri,
		challenge: input.challenge,
		scopes: input.scopes,
		brandIds: input.brandIds,
		credentialScope: input.credentialScope,
		expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
	};
	return { code, publicCode: issued.publicValue };
}

export async function exchangeAuthorizationCode(store: OAuthGrantStore, input: { code: string; verifier: string; redirectUri: string; clientId: string; resource: string }): Promise<{ accessToken: string; refreshToken: string; expiresIn: number; scope: string; credentialId: string }> {
	const parsed = parseComposite(input.code, 'cce_ac_');
	if (!parsed) throw new Error('invalid_grant');
	const code = await store.getCode(parsed.id);
	if (!code || code.usedAt || Date.parse(code.expiresAt) <= Date.now()) throw new Error('invalid_grant');
	if (code.clientId !== input.clientId || code.redirectUri !== input.redirectUri) throw new Error('invalid_grant');
	if (hashAgentKey(parsed.secret) !== code.codeHash) throw new Error('invalid_grant');
	if (!validPkce(input.verifier, code.challenge, 'S256')) throw new Error('invalid_grant');
	code.usedAt = new Date().toISOString();
	await store.saveCode(code);
	return issueConnectionToken(store, code);
}

export async function refreshConnection(store: OAuthGrantStore, refreshToken: string): Promise<{ accessToken: string; refreshToken: string; expiresIn: number; scope: string; credentialId: string }> {
	const parsed = parseComposite(refreshToken, 'cce_rt_');
	if (!parsed) throw new Error('invalid_grant');
	const stored = await store.getRefresh(parsed.id);
	if (!stored || stored.revokedAt || Date.parse(stored.expiresAt) <= Date.now()) throw new Error('invalid_grant');
	if (hashAgentKey(parsed.secret) !== stored.tokenHash) throw new Error('invalid_grant');
	stored.revokedAt = new Date().toISOString();
	await store.saveRefresh(stored);
	await getAgentStore().updateCredential(stored.credentialId, { revokedAt: stored.revokedAt });
	return issueConnectionToken(store, stored);
}

async function issueConnectionToken(store: OAuthGrantStore, grant: Pick<OAuthCode, 'ownerUserId' | 'clientId' | 'clientName' | 'scopes' | 'brandIds' | 'credentialScope'>): Promise<{ accessToken: string; refreshToken: string; expiresIn: number; scope: string; credentialId: string }> {
	const capabilities = capabilitiesForScopes(grant.scopes);
	if (capabilities.length === 0) throw new Error('invalid_scope');
	const expiresIn = 60 * 60;
	const issued = await issueAgentCredential({
		name: `AI connection: ${grant.clientName || 'MCP client'}`,
		ownerUserId: grant.ownerUserId,
		allowedBrandIds: grant.credentialScope === 'OWNER_ACCOUNT' ? [] : grant.brandIds,
		scope: grant.credentialScope,
		capabilities,
		expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(),
	});
	const refresh = newSecret('cce_rt_');
	await store.saveRefresh({
		id: refresh.id,
		ownerUserId: grant.ownerUserId,
		tokenHash: hashAgentKey(refresh.secret),
		credentialId: issued.credential.id,
		clientId: grant.clientId,
		scopes: grant.scopes,
		brandIds: grant.brandIds,
		credentialScope: grant.credentialScope,
		expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
	});
	return { accessToken: issued.secret, refreshToken: refresh.publicValue, expiresIn, scope: grant.scopes.join(' '), credentialId: issued.credential.id };
}

export async function revokeRefresh(store: OAuthGrantStore, token: string): Promise<void> {
	const parsed = parseComposite(token, 'cce_rt_');
	if (!parsed) return;
	const stored = await store.getRefresh(parsed.id);
	if (!stored || hashAgentKey(parsed.secret) !== stored.tokenHash) return;
	stored.revokedAt = new Date().toISOString();
	await store.saveRefresh(stored);
	await getAgentStore().updateCredential(stored.credentialId, { revokedAt: stored.revokedAt });
}

export function requestedScopes(value: string | null): OAuthScope[] {
	return scopesFromRequest(value);
}
