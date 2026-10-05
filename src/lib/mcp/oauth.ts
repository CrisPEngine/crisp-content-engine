import { createHash, randomBytes } from 'crypto';
import type { AgentCapability } from '@/lib/agent/policy';
import { CHIEF_OF_STAFF_CAPABILITIES } from '@/lib/agent/policy';
import { assertPublicHttpUrl } from '@/lib/research/policy';

export const MCP_RESOURCE_PATH = '/api/mcp';

export const OAUTH_SCOPES = [
	'cce:brands:read',
	'cce:research',
	'cce:content:read',
	'cce:content:draft',
	'cce:media:generate',
	'cce:approval:request',
	'cce:schedule',
] as const;

export type OAuthScope = (typeof OAUTH_SCOPES)[number];

const SCOPE_CAPABILITIES: Record<OAuthScope, AgentCapability[]> = {
	'cce:brands:read': ['system:read', 'brand:read', 'strategy:read'],
	'cce:research': ['research:create', 'content:read', 'opportunities:read'],
	'cce:content:read': ['content:read', 'media:read', 'performance:read', 'learning:read'],
	'cce:content:draft': ['content:create', 'content:revise', 'opportunities:create', 'media:propose', 'strategy:propose', 'learning:propose', 'feedback:write', 'experiments:read', 'experiments:propose', 'external:record', 'community:read', 'community:draft_reply', 'ads:read', 'ads:analyse', 'ads:propose'],
	'cce:media:generate': ['media:generate'],
	'cce:approval:request': ['content:submit_for_approval'],
	'cce:schedule': ['content:schedule_after_approval'],
};

const NEVER_GRANTED: AgentCapability[] = ['content:approve', 'content:publish', 'community:publish_reply', 'ads:activate'];

export function scopesFromRequest(value: string | null | undefined): OAuthScope[] {
	const requested = (value ?? '').split(/[\s,]+/).filter(Boolean);
	const known = requested.filter((scope): scope is OAuthScope => (OAUTH_SCOPES as readonly string[]).includes(scope));
	return known.length ? [...new Set(known)] : ['cce:brands:read', 'cce:research', 'cce:content:read', 'cce:content:draft'];
}

export function capabilitiesForScopes(scopes: readonly string[]): AgentCapability[] {
	const granted = new Set<AgentCapability>();
	for (const scope of scopes) {
		const mapped = SCOPE_CAPABILITIES[scope as OAuthScope];
		if (!mapped) continue;
		for (const capability of mapped) {
			if (!NEVER_GRANTED.includes(capability) && CHIEF_OF_STAFF_CAPABILITIES.includes(capability)) granted.add(capability);
		}
	}
	return [...granted];
}

export function deniedScopes(requested: string): string[] {
	return requested.split(/[\s,]+/).filter((scope) => scope && !(OAUTH_SCOPES as readonly string[]).includes(scope));
}

export type ClientMetadata = {
	client_id: string;
	client_name?: string;
	redirect_uris: string[];
	token_endpoint_auth_method?: string;
};

export function safeRedirectUri(value: string): boolean {
	try {
		const url = new URL(value);
		if (url.protocol === 'https:') return !url.username && !url.password;
		if (url.protocol === 'http:' && (url.hostname === 'localhost' || url.hostname === '127.0.0.1')) return true;
		return false;
	} catch {
		return false;
	}
}

export async function readClientMetadata(clientId: string, fetchImpl: typeof fetch = fetch): Promise<ClientMetadata> {
	const url = assertPublicHttpUrl(clientId, { allowHttp: clientId.startsWith('http://127.0.0.1') || clientId.startsWith('http://localhost') });
	const response = await fetchImpl(url, { headers: { Accept: 'application/json' } });
	if (!response.ok) throw new Error('client_metadata_unavailable');
	const body = (await response.json()) as Partial<ClientMetadata>;
	if (body.client_id !== clientId || !Array.isArray(body.redirect_uris)) throw new Error('client_metadata_invalid');
	const redirectUris = body.redirect_uris.filter((item) => typeof item === 'string' && safeRedirectUri(item));
	if (redirectUris.length === 0) throw new Error('client_redirect_rejected');
	return { client_id: clientId, client_name: body.client_name, redirect_uris: redirectUris, token_endpoint_auth_method: body.token_endpoint_auth_method };
}

export function pkceChallenge(verifier: string): string {
	return createHash('sha256').update(verifier).digest('base64url');
}

export function validPkce(verifier: string, challenge: string, method: string): boolean {
	if (method !== 'S256') return false;
	if (verifier.length < 43 || verifier.length > 128) return false;
	return pkceChallenge(verifier) === challenge;
}

export function resourceMatches(resource: string | null, origin: string): boolean {
	if (!resource) return false;
	try {
		const url = new URL(resource);
		const expected = new URL(MCP_RESOURCE_PATH, origin);
		return url.origin === expected.origin && url.pathname === expected.pathname;
	} catch {
		return false;
	}
}

export function protectedResourceMetadata(origin: string) {
	return {
		resource: new URL(MCP_RESOURCE_PATH, origin).toString(),
		authorization_servers: [origin],
		scopes_supported: [...OAUTH_SCOPES],
		bearer_methods_supported: ['header'],
		resource_documentation: new URL('/settings/ai-connections', origin).toString(),
	};
}

export function authorizationServerMetadata(origin: string) {
	return {
		issuer: origin,
		authorization_endpoint: new URL('/oauth/authorize', origin).toString(),
		token_endpoint: new URL('/oauth/token', origin).toString(),
		revocation_endpoint: new URL('/oauth/revoke', origin).toString(),
		response_types_supported: ['code'],
		grant_types_supported: ['authorization_code', 'refresh_token'],
		code_challenge_methods_supported: ['S256'],
		token_endpoint_auth_methods_supported: ['none'],
		scopes_supported: [...OAUTH_SCOPES],
	};
}

export function newSecret(prefix: string): { id: string; secret: string; publicValue: string } {
	const id = crypto.randomUUID();
	const secret = randomBytes(32).toString('base64url');
	return { id, secret, publicValue: `${prefix}${id}.${secret}` };
}

export function parseComposite(value: string, prefix: string): { id: string; secret: string } | null {
	if (!value.startsWith(prefix)) return null;
	const rest = value.slice(prefix.length);
	const split = rest.indexOf('.');
	if (split <= 0) return null;
	return { id: rest.slice(0, split), secret: rest.slice(split + 1) };
}

export const CLIENT_COMPATIBILITY = [
	{
		client: 'Grok',
		status: 'SUPPORTED',
		auth: 'Existing bearer credential. OAuth consent is available when the client can complete authorization-code + PKCE.',
		evidence: 'live bearer on production MCP; OAuth follows the MCP authorization specification and was not live-tested inside Grok in this phase',
		checkedOn: '2026-10-05',
	},
	{
		client: 'ChatGPT',
		status: 'PARTIALLY_SUPPORTED',
		auth: 'Custom MCP connectors that support OAuth protected-resource metadata can use the CCE authorization server. Plans that cannot add a remote MCP server cannot connect.',
		evidence: 'documentation only',
		checkedOn: '2026-10-05',
	},
	{
		client: 'Claude',
		status: 'PARTIALLY_SUPPORTED',
		auth: 'Claude custom connectors that support remote MCP OAuth can use the same endpoint. This was not live-tested in Claude.',
		evidence: 'documentation only',
		checkedOn: '2026-10-05',
	},
	{
		client: 'Cursor',
		status: 'MANUAL_SETUP',
		auth: 'Add the MCP URL and a bearer credential, or complete OAuth if the installed Cursor build supports remote MCP authorization.',
		evidence: 'documentation only',
		checkedOn: '2026-10-05',
	},
	{
		client: 'Codex',
		status: 'MANUAL_SETUP',
		auth: 'Use the generic MCP endpoint with a bearer credential. OAuth was not live-tested in Codex.',
		evidence: 'documentation only',
		checkedOn: '2026-10-05',
	},
	{
		client: 'Generic MCP',
		status: 'SUPPORTED',
		auth: 'POST JSON-RPC to /api/mcp. Bearer credentials remain supported. OAuth uses PKCE, protected resource metadata, and authorization-server metadata.',
		evidence: 'implementation and existing MCP tests',
		checkedOn: '2026-10-05',
	},
] as const;
