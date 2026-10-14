import { CHANNELS } from '@/lib/channels/registry';
import type { ChannelId } from '@/lib/channels/types';

export function resolveChannelId(channel: string): ChannelId | null {
	const id = String(channel).toLowerCase();
	if (id in CHANNELS) return id as ChannelId;
	return null;
}

export function channelBodyCharLimit(channel: string): number | null {
	const id = resolveChannelId(channel);
	if (!id) return null;
	return CHANNELS[id].constraints.maxCharsPerPost ?? null;
}

export function channelTitleCharLimit(channel: string): number | null {
	const id = resolveChannelId(channel);
	if (id === 'reddit') return 300;
	return null;
}
