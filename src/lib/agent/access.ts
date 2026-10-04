import { getIntelligenceStore } from '@/lib/intelligence/actions';
import type { AgentCredential } from './types';

/**
 * OWNER_ACCOUNT is resolved on each call from brands the credential owner currently owns.
 * The expanded id list is not stored on the credential and is never taken from another user.
 */
export async function credentialForInvocation(credential: AgentCredential): Promise<AgentCredential> {
	if (credential.scope !== 'OWNER_ACCOUNT') return credential;
	const brains = await getIntelligenceStore().listBrandBrains(credential.ownerUserId);
	return { ...credential, allowedBrandIds: brains.map((brain) => brain.id) };
}
