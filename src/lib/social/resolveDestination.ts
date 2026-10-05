import { getSupabaseService } from '@/lib/supabaseService';
import { channelFromPlatform, purposeForChannel, type PublishChannel } from '@/lib/social/channels';
import { getLinkedInConnectionByBrand } from '@/lib/linkedin/publish';

export type ResolvedPublishDestination = {
	source: 'native' | 'legacy';
	channel: PublishChannel;
	provider: string;
	providerDestinationId: string;
	displayName: string;
	handle?: string | null;
	destinationId?: string;
	authorizationId?: string;
	/** Legacy LinkedIn connection row id when source=legacy */
	linkedInConnectionId?: string;
};

export type ResolveInput = {
	userId: string;
	/** Airtable BrandProfiles record id */
	airtableBrandId: string;
	platform: string;
};

export async function resolveBrandBrainId(userId: string, airtableBrandId: string): Promise<string | null> {
	const admin = getSupabaseService();
	const { data } = await admin
		.from('brand_brains')
		.select('id')
		.eq('user_id', userId)
		.eq('airtable_brand_id', airtableBrandId)
		.maybeSingle();
	return data?.id ?? null;
}

export async function resolvePublishDestination(input: ResolveInput): Promise<ResolvedPublishDestination | null> {
	const channel = channelFromPlatform(input.platform);
	if (!channel) return null;

	const admin = getSupabaseService();
	const brandId = await resolveBrandBrainId(input.userId, input.airtableBrandId);
	if (brandId) {
		const purpose = purposeForChannel(channel);
		const { data: link } = await admin
			.from('brand_destinations')
			.select('destination_id, purpose, enabled')
			.eq('brand_id', brandId)
			.eq('purpose', purpose)
			.eq('enabled', true)
			.maybeSingle();

		if (link?.destination_id) {
			const { data: destination } = await admin
				.from('social_destinations')
				.select('id, authorization_id, provider, destination_type, provider_destination_id, display_name, handle')
				.eq('id', link.destination_id)
				.maybeSingle();

			if (destination) {
				return {
					source: 'native',
					channel,
					provider: destination.provider,
					providerDestinationId: destination.provider_destination_id,
					displayName: destination.display_name,
					handle: destination.handle,
					destinationId: destination.id,
					authorizationId: destination.authorization_id,
				};
			}
		}
	}

	return resolveLegacyDestination(input, channel);
}

async function resolveLegacyDestination(
	input: ResolveInput,
	channel: PublishChannel
): Promise<ResolvedPublishDestination | null> {
	const admin = getSupabaseService();

	if (channel === 'facebook') {
		const { data: page } = await admin
			.from('meta_pages')
			.select('page_id, page_name')
			.eq('user_id', input.userId)
			.eq('is_selected', true)
			.maybeSingle();
		if (!page) return null;
		console.info('[publish:resolve] legacy Meta Facebook fallback', {
			userId: input.userId,
			brand: input.airtableBrandId,
			pageId: page.page_id,
		});
		return {
			source: 'legacy',
			channel,
			provider: 'meta',
			providerDestinationId: page.page_id,
			displayName: page.page_name,
		};
	}

	if (channel === 'instagram') {
		const { data: ig } = await admin
			.from('meta_instagram_accounts')
			.select('ig_user_id, ig_username')
			.eq('user_id', input.userId)
			.eq('is_selected', true)
			.maybeSingle();
		if (!ig) return null;
		console.info('[publish:resolve] legacy Meta Instagram fallback', {
			userId: input.userId,
			brand: input.airtableBrandId,
			igUserId: ig.ig_user_id,
		});
		return {
			source: 'legacy',
			channel,
			provider: 'meta',
			providerDestinationId: ig.ig_user_id,
			displayName: ig.ig_username ? `@${ig.ig_username.replace(/^@/, '')}` : 'Instagram',
			handle: ig.ig_username,
		};
	}

	if (channel === 'linkedin') {
		const connection = await getLinkedInConnectionByBrand(input.airtableBrandId);
		if (!connection || 'error' in connection) return null;
		console.info('[publish:resolve] legacy LinkedIn fallback', {
			brand: input.airtableBrandId,
			connectionId: connection.connectionId,
		});
		return {
			source: 'legacy',
			channel,
			provider: 'linkedin',
			providerDestinationId: connection.organizationUrn || connection.personUrn || connection.connectionId,
			displayName: 'LinkedIn',
			linkedInConnectionId: connection.connectionId,
		};
	}

	return null;
}

export async function describeDestinationForContent(input: {
	userId: string;
	airtableBrandId?: string | null;
	platform?: string | null;
}): Promise<{ label: string; required: boolean; missing: boolean }> {
	if (!input.platform || !input.airtableBrandId) {
		return { label: 'Destination required', required: true, missing: true };
	}
	const resolved = await resolvePublishDestination({
		userId: input.userId,
		airtableBrandId: input.airtableBrandId,
		platform: input.platform,
	});
	if (!resolved) {
		return { label: 'Destination required', required: true, missing: true };
	}
	return {
		label: `${resolved.displayName}${resolved.handle ? '' : ''}`,
		required: true,
		missing: false,
	};
}
