import 'server-only';

import { getIntelligenceStore } from '@/lib/intelligence/actions';
import { resolvePublishDestination } from '@/lib/social/resolveDestination';
import { accessTokenForResolvedDestination } from '@/lib/social/accessTokenForPublish';
import { getSupabaseService } from '@/lib/supabaseService';

export async function threadsAccessForBrand(ownerUserId: string, brandId: string): Promise<{
	accessToken?: string;
	scopes: string[];
}> {
	try {
		const intelligence = getIntelligenceStore();
		const brain = await intelligence.getBrandBrainById(ownerUserId, brandId);
		if (!brain?.airtableBrandId) return { scopes: [] };

		const destination = await resolvePublishDestination({
			userId: ownerUserId,
			airtableBrandId: brain.airtableBrandId,
			platform: 'Threads',
		});
		if (!destination?.authorizationId) return { scopes: [] };

		const admin = getSupabaseService();
		const { data: auth } = await admin
			.from('social_authorizations')
			.select('scopes')
			.eq('id', destination.authorizationId)
			.maybeSingle();

		const scopes = Array.isArray(auth?.scopes) ? (auth.scopes as string[]) : [];
		const access = await accessTokenForResolvedDestination(ownerUserId, destination);
		return { accessToken: access?.accessToken, scopes };
	} catch {
		return { scopes: [] };
	}
}
