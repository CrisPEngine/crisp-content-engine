import { createHash, randomBytes } from 'crypto';
import { AgentError } from './errors';
import type { AgentCapability, RateLimitPolicy } from './policy';
import { DEFAULT_RATE_LIMIT } from './policy';
import type { AgentCredential, AgentEnvironment, PublicAgentCredential } from './types';
import { getAgentStore } from './controlStore';

export function hashAgentKey(secret: string): string {
	const pepper = process.env.AGENT_KEY_PEPPER;
	const material = pepper ? `${pepper}:${secret}` : secret;
	return createHash('sha256').update(material).digest('hex');
}

export function generateAgentSecret(): { secret: string; keyHash: string; keyPrefix: string } {
	const secret = `cce_agent_${randomBytes(32).toString('base64url')}`;
	return { secret, keyHash: hashAgentKey(secret), keyPrefix: secret.slice(0, 18) };
}

export function toPublicCredential(credential: AgentCredential): PublicAgentCredential {
	return Object.fromEntries(Object.entries(credential).filter(([key]) => key !== 'keyHash')) as PublicAgentCredential;
}

export function assertCredentialUsable(credential: AgentCredential, now = Date.now()): void {
	if (credential.revokedAt) {
		throw new AgentError('revoked_key', 'This agent credential has been revoked.', 401);
	}
	if (credential.expiresAt && Date.parse(credential.expiresAt) <= now) {
		throw new AgentError('expired_key', 'This agent credential has expired.', 401);
	}
}

export async function issueAgentCredential(input: {
	name: string;
	ownerUserId: string;
	organisationId?: string;
	allowedBrandIds: string[];
	capabilities: AgentCapability[];
	environment?: AgentEnvironment;
	expiresAt?: string;
	rateLimit?: RateLimitPolicy;
}): Promise<{ credential: PublicAgentCredential; secret: string }> {
	const { secret, keyHash, keyPrefix } = generateAgentSecret();
	const credential: AgentCredential = {
		id: crypto.randomUUID(),
		name: input.name,
		ownerUserId: input.ownerUserId,
		organisationId: input.organisationId,
		allowedBrandIds: input.allowedBrandIds,
		capabilities: input.capabilities,
		environment: input.environment ?? 'production',
		keyHash,
		keyPrefix,
		rateLimit: input.rateLimit ?? DEFAULT_RATE_LIMIT,
		createdAt: new Date().toISOString(),
		expiresAt: input.expiresAt,
	};
	await getAgentStore().insertCredential(credential);
	return { credential: toPublicCredential(credential), secret };
}

export async function resolveAgentCredential(authorization: string | null): Promise<AgentCredential> {
	const header = authorization?.trim() ?? '';
	const secret = header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : '';
	if (!secret || !secret.startsWith('cce_agent_')) {
		throw new AgentError('unauthenticated', 'Agent credentials use Authorization: Bearer cce_agent_…', 401);
	}
	const credential = await getAgentStore().findCredentialByHash(hashAgentKey(secret));
	if (!credential) {
		throw new AgentError('unauthenticated', 'Agent credential was not recognised.', 401);
	}
	assertCredentialUsable(credential);
	await getAgentStore().updateCredential(credential.id, { lastUsedAt: new Date().toISOString() });
	credential.lastUsedAt = new Date().toISOString();
	return credential;
}
