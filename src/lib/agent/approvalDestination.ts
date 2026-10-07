import { resolvePublishDestination } from '@/lib/social/resolveDestination';
import { channelFromPlatform } from '@/lib/social/channels';
import {
	agentMetaJobIsArmed,
	agentMetaPlatformFromChannel,
	isAgentMetaMemory,
} from '@/lib/publish/agentMetaJob';
import { agentThreadsJobIsArmed, isAgentThreadsMemory } from '@/lib/publish/agentThreadsJob';
import type { ContentMemoryRecord } from '@/lib/intelligence/types';

export type ApprovalDestinationView = {
	ready: boolean;
	label: string | null;
	handle: string | null;
	message: string;
	publishQueued: boolean;
};

function platformLabel(channel: string): string {
	const c = channel.trim();
	if (!c) return 'Channel';
	return c.charAt(0).toUpperCase() + c.slice(1);
}

export async function resolveApprovalDestinationView(input: {
	userId: string;
	airtableBrandId: string;
	channel?: string;
	memory?: ContentMemoryRecord | null;
	schedule: boolean;
	contentScheduledOrApproved: boolean;
}): Promise<ApprovalDestinationView> {
	const channel = input.channel ?? input.memory?.channel ?? '';
	const platform = platformLabel(String(channel));
	const publishChannel = channelFromPlatform(String(channel));

	if (!publishChannel) {
		return {
			ready: false,
			label: null,
			handle: null,
			message: input.schedule ? `${platform} publishing is not configured in CCE.` : 'No publish destination for this channel.',
			publishQueued: false,
		};
	}

	const resolved = await resolvePublishDestination({
		userId: input.userId,
		airtableBrandId: input.airtableBrandId,
		platform: platformLabel(String(channel)),
	});

	let publishQueued = false;
	const memory = input.memory;
	if (memory && input.contentScheduledOrApproved) {
		if (isAgentThreadsMemory(memory)) {
			publishQueued = await agentThreadsJobIsArmed(input.userId, memory.id);
		} else if (isAgentMetaMemory(memory)) {
			const metaPlatform = agentMetaPlatformFromChannel(memory.channel);
			if (metaPlatform) {
				publishQueued = await agentMetaJobIsArmed(input.userId, memory.id, metaPlatform);
			}
		}
	}

	if (!resolved) {
		return {
			ready: false,
			label: null,
			handle: null,
			message: input.schedule
				? `Destination required before this can be scheduled. Assign ${platform} in Connections.`
				: `No ${platform} destination assigned for this brand.`,
			publishQueued,
		};
	}

	const handle = resolved.handle?.trim() || null;
	const label = handle ? `@${handle.replace(/^@/, '')}` : resolved.displayName;

	if (input.schedule && input.contentScheduledOrApproved && publishQueued) {
		return {
			ready: true,
			label,
			handle,
			message: `Queued to publish to ${label}.`,
			publishQueued: true,
		};
	}

	if (input.schedule && input.contentScheduledOrApproved && !publishQueued && isAgentMetaMemory(memory ?? { channel: '' })) {
		return {
			ready: true,
			label,
			handle,
			message: `Destination ${label} is ready. Publish queue will arm on the next sync.`,
			publishQueued: false,
		};
	}

	return {
		ready: true,
		label,
		handle,
		message: `Destination: ${label} (ready to publish).`,
		publishQueued,
	};
}
