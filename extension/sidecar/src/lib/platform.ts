export type DetectedPlatform =
	| 'web'
	| 'reddit'
	| 'x'
	| 'linkedin'
	| 'facebook'
	| 'instagram'
	| 'youtube'
	| 'bluesky'
	| 'threads';

export function detectPlatformFromUrl(pageUrl: string): DetectedPlatform {
	try {
		const host = new URL(pageUrl).hostname.toLowerCase().replace(/^www\./, '');
		if (host.includes('linkedin.com')) return 'linkedin';
		if (host === 'x.com' || host.includes('twitter.com')) return 'x';
		if (host.includes('reddit.com')) return 'reddit';
		if (host.includes('facebook.com') || host === 'fb.com') return 'facebook';
		if (host.includes('instagram.com')) return 'instagram';
		if (host.includes('youtube.com') || host === 'youtu.be') return 'youtube';
		if (host.includes('bsky.app') || host.includes('bluesky.social')) return 'bluesky';
		if (host.includes('threads.net')) return 'threads';
		return 'web';
	} catch {
		return 'web';
	}
}
