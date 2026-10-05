import { getSupabaseService } from '@/lib/supabaseService';
import { purposeForChannel, type PublishChannel } from '@/lib/social/channels';
import { DESTINATION_TYPES, SOCIAL_PROVIDERS } from '@/lib/social/providers';
import { connectionHealth } from '@/lib/social/destinations';
import { brandNameFromIdentity, formatInstagramHandle } from '@/lib/social/brandBrainName';
import type { ConnectionPhase } from '@/lib/social/connectionStatus';
import { uiLabelForPhase } from '@/lib/social/connectionStatus';

export type BrandChannelView = {
	channel: PublishChannel;
	label: string;
	phase: ConnectionPhase;
	uiStatus: string;
	destinationLabel?: string;
	destinationId?: string;
	authorizationProvider?: string;
	authorizationLabel?: string;
	connectHref?: string;
	addAccountHref?: string;
	expiresAt?: string | null;
	advancedProviderId?: string;
};

const CHANNEL_DEFS: { channel: PublishChannel; label: string }[] = [
	{ channel: 'instagram', label: 'Instagram' },
	{ channel: 'threads', label: 'Threads' },
	{ channel: 'facebook', label: 'Facebook' },
	{ channel: 'linkedin', label: 'LinkedIn' },
];

function humanDestinationLabel(
	channel: PublishChannel,
	dest: { display_name: string; handle?: string | null; destination_type: string; provider: string }
): string {
	if (channel === 'instagram') return formatInstagramHandle(dest.handle, dest.display_name);
	if (channel === 'facebook') return dest.display_name || 'Facebook Page';
	if (channel === 'linkedin') return dest.display_name || 'LinkedIn';
	if (channel === 'threads') return formatInstagramHandle(dest.handle, dest.display_name);
	return dest.display_name;
}

function instagramDestinations(
	destinations: Array<{ id: string; provider: string; destination_type: string; display_name: string; handle?: string | null }>
) {
	return destinations.filter(
		(d) =>
			(d.provider === SOCIAL_PROVIDERS.INSTAGRAM && d.destination_type === DESTINATION_TYPES.INSTAGRAM_PROFESSIONAL) ||
			((d.provider === SOCIAL_PROVIDERS.META_LEGACY || d.provider === SOCIAL_PROVIDERS.FACEBOOK) &&
				(d.destination_type === DESTINATION_TYPES.INSTAGRAM_LINKED || d.destination_type === 'instagram'))
	);
}

function facebookDestinations(
	destinations: Array<{ id: string; provider: string; destination_type: string; display_name: string }>
) {
	return destinations.filter(
		(d) =>
			(d.provider === SOCIAL_PROVIDERS.META_LEGACY || d.provider === SOCIAL_PROVIDERS.FACEBOOK) &&
			(d.destination_type === DESTINATION_TYPES.FACEBOOK_PAGE || d.destination_type === 'page')
	);
}

function linkedInDestinations(
	destinations: Array<{ id: string; provider: string; destination_type: string; display_name: string }>
) {
	return destinations.filter((d) => d.provider === SOCIAL_PROVIDERS.LINKEDIN);
}

function destinationsForChannel(channel: PublishChannel, destinations: Array<{ id: string; provider: string; destination_type: string; display_name: string; handle?: string | null }>) {
	if (channel === 'instagram') return instagramDestinations(destinations);
	if (channel === 'facebook') return facebookDestinations(destinations);
	if (channel === 'linkedin') return linkedInDestinations(destinations);
	if (channel === 'threads') return destinations.filter((d) => d.provider === SOCIAL_PROVIDERS.THREADS);
	return [];
}

function authLabelForDestination(dest: { provider: string; destination_type: string }): string {
	if (dest.provider === SOCIAL_PROVIDERS.INSTAGRAM && dest.destination_type === DESTINATION_TYPES.INSTAGRAM_PROFESSIONAL) {
		return 'Instagram Login';
	}
	if (dest.provider === SOCIAL_PROVIDERS.META_LEGACY || dest.provider === SOCIAL_PROVIDERS.FACEBOOK) {
		return 'Facebook authorization';
	}
	if (dest.provider === SOCIAL_PROVIDERS.LINKEDIN) return 'LinkedIn authorization';
	return 'Connected account';
}

export async function brandChannelRows(userId: string, brandId: string): Promise<BrandChannelView[]> {
	const admin = getSupabaseService();
	const { data: brand } = await admin.from('brand_brains').select('id').eq('id', brandId).eq('user_id', userId).maybeSingle();
	if (!brand) return [];

	const { data: links } = await admin.from('brand_destinations').select('destination_id, purpose, enabled').eq('brand_id', brandId);
	const { data: authorizations } = await admin
		.from('social_authorizations')
		.select('id, provider, status, expires_at, provider_account_id, scopes')
		.eq('owner_user_id', userId);
	const authById = new Map((authorizations || []).map((a) => [a.id, a]));
	const authIds = (authorizations || []).map((a) => a.id);
	const { data: destinations } =
		authIds.length > 0
			? await admin
					.from('social_destinations')
					.select('id, authorization_id, provider, destination_type, provider_destination_id, display_name, handle, status')
					.in('authorization_id', authIds)
			: { data: [] as never[] };

	const destById = new Map((destinations || []).map((d) => [d.id, d]));
	const brandQ = `brand_id=${encodeURIComponent(brandId)}`;

	return CHANNEL_DEFS.map(({ channel, label }) => {
		const purpose = purposeForChannel(channel);
		const link = (links || []).find((l) => l.purpose === purpose && l.enabled);
		const linked = link ? destById.get(link.destination_id) : undefined;
		const connectHref = (() => {
			if (channel === 'instagram') return `/api/connections/instagram/authorize?${brandQ}`;
			if (channel === 'threads') return `/api/connections/threads/authorize?${brandQ}`;
			if (channel === 'facebook') return `/api/meta/oauth/start?${brandQ}`;
			if (channel === 'linkedin') return `/api/connections/linkedin/authorize?type=business&${brandQ}`;
			return undefined;
		})();
		const addAccountHref = (() => {
			if (channel === 'instagram') return `/api/connections/instagram/authorize?add_account=1&brand_id=${encodeURIComponent(brandId)}`;
			if (channel === 'facebook') return `/api/meta/oauth/start`;
			if (channel === 'linkedin') return `/api/connections/linkedin/authorize?type=business`;
			return connectHref;
		})();

		if (linked) {
			const auth = authById.get(linked.authorization_id);
			const health = connectionHealth({
				expiresAt: auth?.expires_at,
				disconnected: linked.status === 'DISCONNECTED',
				reconnectRequired: linked.status === 'ACTION_REQUIRED',
			});
			const hasPublishScope =
				channel !== 'instagram' ||
				(auth?.scopes || []).includes('instagram_business_content_publish') ||
				linked.destination_type !== DESTINATION_TYPES.INSTAGRAM_PROFESSIONAL;
			let phase: ConnectionPhase = 'ASSIGNED';
			if (health !== 'CONNECTED' || linked.status !== 'CONNECTED') phase = 'ACTION_REQUIRED';
			else if (hasPublishScope) phase = 'READY';
			else phase = 'ACTION_REQUIRED';

			return {
				channel,
				label,
				phase,
				uiStatus: uiLabelForPhase(phase),
				destinationLabel: humanDestinationLabel(channel, linked),
				destinationId: linked.id,
				authorizationProvider: linked.provider,
				authorizationLabel: authLabelForDestination(linked),
				connectHref,
				addAccountHref,
				expiresAt: auth?.expires_at ?? null,
				advancedProviderId: linked.provider_destination_id,
			};
		}

		const options = destinationsForChannel(channel, destinations || []);
		const phase: ConnectionPhase = options.length > 0 ? 'AUTHORIZED_UNASSIGNED' : 'NOT_CONNECTED';

		return {
			channel,
			label,
			phase,
			uiStatus: uiLabelForPhase(phase),
			connectHref,
			addAccountHref,
		};
	});
}

export type AccountAuthorizationView = {
	id: string;
	provider: string;
	providerLabel: string;
	primaryLabel: string;
	expiresAt?: string | null;
	status: string;
	destinations: { id: string; label: string; type: string }[];
	usedByBrands: string[];
	advancedAccountId?: string;
};

export async function listAccountAuthorizations(userId: string): Promise<AccountAuthorizationView[]> {
	const admin = getSupabaseService();
	const { data: brands } = await admin.from('brand_brains').select('id, identity').eq('user_id', userId);
	const brandName = new Map((brands || []).map((b) => [b.id, brandNameFromIdentity(b.identity)]));

	const { data: authorizations } = await admin
		.from('social_authorizations')
		.select('id, provider, provider_account_id, expires_at, status, scopes')
		.eq('owner_user_id', userId)
		.order('created_at', { ascending: false });

	const { data: links } = await admin
		.from('brand_destinations')
		.select('brand_id, destination_id')
		.in('brand_id', (brands || []).map((b) => b.id));

	const authIds = (authorizations || []).map((a) => a.id);
	const { data: destinations } =
		authIds.length > 0
			? await admin.from('social_destinations').select('id, authorization_id, provider, destination_type, display_name, handle').in('authorization_id', authIds)
			: { data: [] as never[] };

	const destToBrands = new Map<string, string[]>();
	for (const link of links || []) {
		const names = destToBrands.get(link.destination_id) || [];
		const n = brandName.get(link.brand_id);
		if (n && !names.includes(n)) names.push(n);
		destToBrands.set(link.destination_id, names);
	}

	return (authorizations || []).map((auth) => {
		const dests = (destinations || []).filter((d) => d.authorization_id === auth.id);
		const used = new Set<string>();
		for (const d of dests) {
			for (const name of destToBrands.get(d.id) || []) used.add(name);
		}
		const primary =
			auth.provider === SOCIAL_PROVIDERS.INSTAGRAM
				? formatInstagramHandle(dests[0]?.handle, dests[0]?.display_name)
				: auth.provider === SOCIAL_PROVIDERS.META_LEGACY || auth.provider === SOCIAL_PROVIDERS.FACEBOOK
					? 'Facebook Login'
					: auth.provider === SOCIAL_PROVIDERS.LINKEDIN
						? dests[0]?.display_name || 'LinkedIn'
						: auth.provider;

		const providerLabel =
			auth.provider === SOCIAL_PROVIDERS.INSTAGRAM
				? 'Instagram Login'
				: auth.provider === SOCIAL_PROVIDERS.META_LEGACY || auth.provider === SOCIAL_PROVIDERS.FACEBOOK
					? 'Meta / Facebook'
					: auth.provider === SOCIAL_PROVIDERS.LINKEDIN
						? 'LinkedIn'
						: auth.provider;

		return {
			id: auth.id,
			provider: auth.provider,
			providerLabel,
			primaryLabel: primary,
			expiresAt: auth.expires_at,
			status: auth.status,
			destinations: dests.map((d) => ({
				id: d.id,
				label: humanDestinationLabel(
					d.destination_type === DESTINATION_TYPES.INSTAGRAM_PROFESSIONAL ? 'instagram' : d.destination_type === 'page' ? 'facebook' : 'linkedin',
					d
				),
				type: d.destination_type,
			})),
			usedByBrands: [...used],
			advancedAccountId: auth.provider_account_id ?? undefined,
		};
	});
}

export async function mcpBrandChannelSummary(userId: string, brandId: string) {
	const rows = await brandChannelRows(userId, brandId);
	return rows.map((row) => ({
		channel: row.label,
		status: row.uiStatus,
		destination: row.destinationLabel ?? null,
		canPublish: row.phase === 'READY',
	}));
}
