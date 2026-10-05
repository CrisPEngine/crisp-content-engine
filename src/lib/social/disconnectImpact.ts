import { getSupabaseService } from '@/lib/supabaseService';
import { brandNameFromIdentity } from '@/lib/social/brandBrainName';
import { SOCIAL_PROVIDERS } from '@/lib/social/providers';

export type DisconnectImpactLine = {
	brandName: string;
	channel: string;
	destinationLabel: string;
};

export type DisconnectImpact = {
	authorizationId: string;
	provider: string;
	accountLabel: string;
	lines: DisconnectImpactLine[];
	warning: string;
};

function channelLabelFromPurpose(purpose: string): string {
	const suffix = purpose.replace(/^default_publish:/, '');
	const map: Record<string, string> = {
		instagram: 'Instagram',
		threads: 'Threads',
		facebook: 'Facebook',
		linkedin: 'LinkedIn',
	};
	return map[suffix] || suffix;
}

export async function getDisconnectImpact(ownerUserId: string, authorizationId: string): Promise<DisconnectImpact | null> {
	const admin = getSupabaseService();
	const { data: auth } = await admin
		.from('social_authorizations')
		.select('id, provider, provider_account_id')
		.eq('id', authorizationId)
		.eq('owner_user_id', ownerUserId)
		.maybeSingle();
	if (!auth) return null;

	const { data: destinations } = await admin
		.from('social_destinations')
		.select('id, display_name, handle, provider, destination_type')
		.eq('authorization_id', auth.id);

	const destIds = (destinations || []).map((d) => d.id);
	if (destIds.length === 0) {
		return {
			authorizationId: auth.id,
			provider: auth.provider,
			accountLabel: auth.provider,
			lines: [],
			warning: 'Disconnecting this account will remove its OAuth authorization. No brand destinations are currently mapped.',
		};
	}

	const { data: links } = await admin
		.from('brand_destinations')
		.select('brand_id, purpose, destination_id')
		.in('destination_id', destIds);

	const brandIds = [...new Set((links || []).map((l) => l.brand_id))];
	const { data: brands } =
		brandIds.length > 0
			? await admin.from('brand_brains').select('id, identity').in('id', brandIds)
			: { data: [] as { id: string; identity: unknown }[] };
	const brandNameById = new Map((brands || []).map((b) => [b.id, brandNameFromIdentity(b.identity)]));

	const destById = new Map((destinations || []).map((d) => [d.id, d]));
	const lines: DisconnectImpactLine[] = [];
	for (const link of links || []) {
		const dest = destById.get(link.destination_id);
		if (!dest) continue;
		lines.push({
			brandName: brandNameById.get(link.brand_id) || 'Brand',
			channel: channelLabelFromPurpose(link.purpose),
			destinationLabel: dest.display_name || dest.handle || 'Destination',
		});
	}

	const primaryDest = destinations?.[0];
	let accountLabel = primaryDest?.display_name || 'Connected account';
	if (auth.provider === SOCIAL_PROVIDERS.META_LEGACY || auth.provider === SOCIAL_PROVIDERS.FACEBOOK) {
		accountLabel = 'Facebook Login';
	} else if (auth.provider === SOCIAL_PROVIDERS.LINKEDIN) {
		accountLabel = primaryDest?.display_name || 'LinkedIn';
	}

	const warning =
		lines.length > 0
			? 'Disconnecting it will prevent new posts on the channels above until you connect again and reassign destinations.'
			: 'This account is authorized but not assigned to any brand channel. Disconnecting removes the authorization only.';

	return {
		authorizationId: auth.id,
		provider: auth.provider,
		accountLabel,
		lines,
		warning,
	};
}
