/**
 * Channel Registry
 * 
 * Central registry of all supported channels.
 * Provides type-safe access to channel definitions.
 */

import type { ChannelDefinition, ChannelId } from './types';
import { LinkedInChannel } from './linkedin';
import { XChannel } from './x';
import { InstagramChannel, FacebookChannel } from './meta';
import { BlogChannel } from './blog';

/**
 * All channel definitions indexed by ID
 */
export const CHANNELS: Record<ChannelId, ChannelDefinition> = {
	linkedin: LinkedInChannel,
	x: XChannel,
	instagram: InstagramChannel,
	facebook: FacebookChannel,
	blog: BlogChannel,
};

/**
 * Get channel definition by ID
 */
export function getChannel(id: ChannelId): ChannelDefinition {
	return CHANNELS[id];
}

/**
 * Get channel definition by Airtable platform value
 */
export function getChannelByPlatform(platform: string): ChannelDefinition | null {
	const channelId = Object.keys(CHANNELS).find((id) => {
		const channel = CHANNELS[id as ChannelId];
		return channel.airtablePlatformValues.includes(platform);
	});

	return channelId ? CHANNELS[channelId as ChannelId] : null;
}

/**
 * Get all channel IDs
 */
export function getAllChannelIds(): ChannelId[] {
	return Object.keys(CHANNELS) as ChannelId[];
}

/**
 * Check if a channel is publishable (vs export-only)
 * V1: X threads are export-only
 */
export function isPublishable(platform: string, postType: string): boolean {
	// X threads are export-only in V1
	if (platform === 'X' && postType === 'thread') {
		return false;
	}

	// Blog is export-only in V1
	if (platform === 'Blog') {
		return false;
	}

	// All others are publishable (if Buffer connected)
	return true;
}

/**
 * Check if scheduling/publishing is allowed for a content item
 * Returns { allowed: boolean, reason?: string }
 */
export function canScheduleOrPublish(platform: string, postType: string, charCount?: number): {
	allowed: boolean;
	reason?: string;
} {
	// X threads are export-only
	if (platform === 'X' && postType === 'thread') {
		return {
			allowed: false,
			reason: 'X threads are export-only in V1. Copy and paste manually to publish.',
		};
	}

	// X singles must be <= 280 chars
	if (platform === 'X' && postType === 'single') {
		if (charCount && charCount > 280) {
			return {
				allowed: false,
				reason: `Tweet is ${charCount} characters (max 280). Edit before scheduling.`,
			};
		}
	}

	// Blog is export-only
	if (platform === 'Blog') {
		return {
			allowed: false,
			reason: 'Blog posts are export-only. Copy and publish to your blog manually.',
		};
	}

	return { allowed: true };
}
