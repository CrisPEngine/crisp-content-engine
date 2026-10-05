import { getSupabaseService } from '@/lib/supabaseService';
import { purposeForChannel, type PublishChannel } from '@/lib/social/channels';
import { DESTINATION_TYPES, SOCIAL_PROVIDERS } from '@/lib/social/providers';

export type ChannelConnectionState = 'CONNECTED' | 'NOT_CONNECTED' | 'NOT_ASSIGNED' | 'ACTION_REQUIRED';

export type BrandChannelRow = {
	channel: PublishChannel;
	label: string;
	state: ChannelConnectionState;
	destinationLabel?: string;
	destinationId?: string;
	authorizationProvider?: string;
	connectHref?: string;
	addAccountHref?: string;
};

const CHANNEL_DEFS: { channel: PublishChannel; label: string }[] = [
	{ channel: 'instagram', label: 'Instagram' },
	{ channel: 'threads', label: 'Threads' },
	{ channel: 'facebook', label: 'Facebook' },
	{ channel: 'linkedin', label: 'LinkedIn' },
];

function instagramDestinations(
	destinations: Array<{ id: string; provider: string; destination_type: string; display_name: string; handle?: string | null }>
) {
	return destinations.filter(
		(d) =>
			(d.provider === SOCIAL_PROVIDERS.INSTAGRAM && d.destination_type === DESTINATION_TYPES.INSTAGRAM_PROFESSIONAL) ||
			((d.provider === SOCIAL_PROVIDERS.META_LEGACY || d.provider === SOCIAL_PROVIDERS.FACEBOOK) &&
				d.destination_type === DESTINATION_TYPES.INSTAGRAM_LINKED)
	);
}

export async function brandChannelRows(userId: string, brandId: string): Promise<BrandChannelRow[]> {
	const admin = getSupabaseService();
	const { data: brand } = await admin.from('brand_brains').select('id').eq('id', brandId).eq('user_id', userId).maybeSingle();
	if (!brand) return [];

	const { data: links } = await admin.from('brand_destinations').select('destination_id, purpose, enabled').eq('brand_id', brandId);
	const { data: authorizations } = await admin
		.from('social_authorizations')
		.select('id, provider, status')
		.eq('owner_user_id', userId);
	const authIds = (authorizations || []).map((a) => a.id);
	const { data: destinations } =
		authIds.length > 0
			? await admin
					.from('social_destinations')
					.select('id, authorization_id, provider, destination_type, display_name, handle, status')
					.in('authorization_id', authIds)
			: { data: [] as never[] };

	const destById = new Map((destinations || []).map((d) => [d.id, d]));

	return CHANNEL_DEFS.map(({ channel, label }) => {
		const purpose = purposeForChannel(channel);
		const link = (links || []).find((l) => l.purpose === purpose && l.enabled);
		const linked = link ? destById.get(link.destination_id) : undefined;

		if (linked) {
			return {
				channel,
				label,
				state: linked.status === 'CONNECTED' ? 'CONNECTED' : 'ACTION_REQUIRED',
				destinationLabel: linked.display_name,
				destinationId: linked.id,
				authorizationProvider: linked.provider,
			};
		}

		const available = (() => {
			if (channel === 'instagram') return instagramDestinations(destinations || []).length > 0;
			if (channel === 'threads') return (destinations || []).some((d) => d.provider === SOCIAL_PROVIDERS.THREADS);
			if (channel === 'facebook')
				return (destinations || []).some((d) => d.destination_type === DESTINATION_TYPES.FACEBOOK_PAGE);
			if (channel === 'linkedin') return (destinations || []).some((d) => d.provider === SOCIAL_PROVIDERS.LINKEDIN);
			return false;
		})();

		const brandQ = `brand_id=${encodeURIComponent(brandId)}`;
		const connectHref = (() => {
			if (channel === 'instagram') return `/api/connections/instagram/authorize?${brandQ}`;
			if (channel === 'threads') return `/api/connections/threads/authorize?${brandQ}`;
			if (channel === 'facebook') return `/api/meta/oauth/start`;
			if (channel === 'linkedin') return `/api/connections/linkedin/authorize?type=business`;
			return undefined;
		})();

		return {
			channel,
			label,
			state: available ? 'NOT_ASSIGNED' : 'NOT_CONNECTED',
			connectHref,
			addAccountHref:
				channel === 'instagram' || channel === 'threads'
					? connectHref
					: channel === 'facebook'
						? '/api/meta/oauth/start'
						: connectHref,
		};
	});
}

export async function mcpBrandChannelSummary(userId: string, brandId: string) {
	const rows = await brandChannelRows(userId, brandId);
	return rows.map((row) => ({
		channel: row.label,
		status: row.state === 'CONNECTED' ? 'CONNECTED' : row.state === 'NOT_ASSIGNED' ? 'AVAILABLE_UNASSIGNED' : 'NOT_CONNECTED',
		destination: row.destinationLabel ?? null,
		canPublish: row.state === 'CONNECTED',
	}));
}
