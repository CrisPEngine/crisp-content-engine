export type PublishChannel =
	| 'linkedin'
	| 'linkedin_organization'
	| 'facebook'
	| 'instagram'
	| 'x'
	| 'threads'
	| 'tiktok'
	| 'youtube'
	| 'pinterest'
	| 'blog';

/** Map content platform labels to native channel keys used in brand_destinations.purpose suffix. */
export function channelFromPlatform(platform: string): PublishChannel | null {
	const p = platform.trim().toLowerCase();
	if (p === 'linkedin') return 'linkedin';
	if (p === 'facebook') return 'facebook';
	if (p === 'instagram') return 'instagram';
	if (p === 'x' || p === 'twitter') return 'x';
	if (p === 'threads') return 'threads';
	if (p === 'tiktok') return 'tiktok';
	if (p === 'youtube') return 'youtube';
	if (p === 'pinterest') return 'pinterest';
	if (p === 'blog') return 'blog';
	return null;
}

export function purposeForChannel(channel: PublishChannel): string {
	return `default_publish:${channel}`;
}
