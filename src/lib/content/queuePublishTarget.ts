import 'server-only';

import type { BrandBrain } from '@/lib/intelligence/types';
import { channelFromPlatform } from '@/lib/social/channels';
import { formatInstagramHandle } from '@/lib/social/brandBrainName';
import { resolvePublishDestination } from '@/lib/social/resolveDestination';

function displayPlatform(channel: string): string {
	const c = String(channel).toLowerCase();
	if (c === 'linkedin') return 'LinkedIn';
	if (c === 'instagram') return 'Instagram';
	if (c === 'facebook') return 'Facebook';
	if (c === 'threads') return 'Threads';
	return channel;
}

export type QueuePublishTarget = {
	label: string | null;
	ready: boolean;
};

export function channelRequiresPublishDestination(channel: string): boolean {
	const publishChannel = channelFromPlatform(displayPlatform(channel));
	if (!publishChannel) return false;
	return publishChannel === 'linkedin' || publishChannel === 'facebook' || publishChannel === 'instagram' || publishChannel === 'threads';
}

function formatDestinationLabel(channel: string, resolved: NonNullable<Awaited<ReturnType<typeof resolvePublishDestination>>>): string {
	const publishChannel = channelFromPlatform(displayPlatform(channel));
	if (publishChannel === 'instagram' || publishChannel === 'threads') {
		return formatInstagramHandle(resolved.handle, resolved.displayName);
	}
	return resolved.displayName?.trim() || 'Connected destination';
}

/** Brand- and channel-scoped publish destination for approval queue rows. */
export async function resolveQueuePublishTarget(input: {
	userId: string;
	brandBrain: Pick<BrandBrain, 'id' | 'airtableBrandId'>;
	channel: string;
}): Promise<QueuePublishTarget> {
	if (!channelRequiresPublishDestination(input.channel)) {
		return { label: null, ready: true };
	}

	const brandKey = input.brandBrain.airtableBrandId?.trim() || input.brandBrain.id;
	const resolved = await resolvePublishDestination({
		userId: input.userId,
		airtableBrandId: brandKey,
		platform: displayPlatform(input.channel),
	});

	if (!resolved) {
		return { label: null, ready: false };
	}

	return {
		label: formatDestinationLabel(input.channel, resolved),
		ready: true,
	};
}
