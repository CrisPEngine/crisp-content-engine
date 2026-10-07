import type { ChannelMediaSpec } from './types';

const imagePost = (notes: string, required: boolean, ratios: string[], maxImages = 1): ChannelMediaSpec => ({
	textOnlySupported: !required,
	mediaRequired: required,
	supportedTypes: required ? ['IMAGE', 'CAROUSEL'] : ['IMAGE'],
	maxImages,
	aspectRatios: ratios,
	video: 'NOT_IMPLEMENTED',
	carousel: required ? 'NOT_IMPLEMENTED' : 'NOT_IMPLEMENTED',
	altText: false,
	implementation: required ? 'SUPPORTED_BY_PLATFORM' : 'SUPPORTED_BY_PLATFORM',
	notes,
});

export const CHANNEL_MEDIA: Record<string, ChannelMediaSpec> = {
	LINKEDIN_PERSONAL: imagePost(
		'Text-only founder posts are supported. The current publisher can attach one image from a public URL. Multi-image, video, and alt text are not implemented on this path.',
		false,
		['1.91:1', '1:1'],
		1,
	),
	LINKEDIN_ORGANIZATION: imagePost(
		'Same single-image publisher path as personal posts when an organisation author is connected. Text-only is supported.',
		false,
		['1.91:1', '1:1'],
		1,
	),
	X: {
		textOnlySupported: true,
		mediaRequired: false,
		supportedTypes: ['IMAGE'],
		maxImages: 4,
		aspectRatios: ['16:9', '1:1'],
		video: 'NOT_IMPLEMENTED',
		carousel: 'NOT_IMPLEMENTED',
		altText: true,
		implementation: 'NOT_IMPLEMENTED',
		notes: 'X can be text-only. No X media adapter is connected.',
	},
	THREADS: imagePost(
		'Text-only posts are supported. The Threads publisher can attach one public image URL. Carousel, video, and alt text are not implemented on this path.',
		false,
		['1:1', '4:5'],
		1,
	),
	INSTAGRAM_FEED: {
		textOnlySupported: false,
		mediaRequired: true,
		supportedTypes: ['IMAGE', 'CAROUSEL'],
		maxImages: 10,
		aspectRatios: ['4:5', '1:1'],
		video: 'NOT_IMPLEMENTED',
		carousel: 'NOT_IMPLEMENTED',
		altText: false,
		implementation: 'SUPPORTED_BY_PLATFORM',
		notes: 'The existing Instagram publisher requires a public image URL. Carousel and alt text are not implemented. Professional accounts only.',
	},
	INSTAGRAM_REEL: {
		textOnlySupported: false,
		mediaRequired: true,
		supportedTypes: ['VIDEO'],
		maxImages: 0,
		aspectRatios: ['9:16'],
		video: 'NOT_IMPLEMENTED',
		carousel: 'NOT_IMPLEMENTED',
		altText: false,
		implementation: 'NOT_IMPLEMENTED',
		notes: 'A Reel needs video. CCE does not generate or publish Reels in this phase.',
	},
	INSTAGRAM_STORY: {
		textOnlySupported: false,
		mediaRequired: true,
		supportedTypes: ['IMAGE', 'VIDEO'],
		maxImages: 1,
		aspectRatios: ['9:16'],
		video: 'NOT_IMPLEMENTED',
		carousel: 'NOT_IMPLEMENTED',
		altText: false,
		implementation: 'NOT_IMPLEMENTED',
		notes: 'Stories are not supported by the current publisher.',
	},
	FACEBOOK_PAGE: imagePost(
		'Page posts can be text-only. The existing Meta publisher can attach one public image URL.',
		false,
		['1.91:1', '1:1'],
		1,
	),
	BLOG: {
		textOnlySupported: true,
		mediaRequired: false,
		supportedTypes: ['HERO_IMAGE', 'INLINE_IMAGE', 'DIAGRAM', 'SCREENSHOT'],
		maxImages: 8,
		aspectRatios: ['16:9', '3:2'],
		video: 'NOT_IMPLEMENTED',
		carousel: 'NOT_IMPLEMENTED',
		altText: true,
		implementation: 'CCE_NATIVE',
		notes: 'A long-form article does not require a hero image. Planning can recommend one purposeful image. CMS adapters are not all implemented.',
	},
	NEWSLETTER: {
		textOnlySupported: true,
		mediaRequired: false,
		supportedTypes: ['HERO_IMAGE'],
		maxImages: 1,
		aspectRatios: ['16:9'],
		video: 'NOT_IMPLEMENTED',
		carousel: 'NOT_IMPLEMENTED',
		altText: true,
		implementation: 'NOT_IMPLEMENTED',
		notes: 'No newsletter sender is connected.',
	},
	CUSTOM: {
		textOnlySupported: true,
		mediaRequired: false,
		supportedTypes: ['IMAGE'],
		maxImages: 1,
		aspectRatios: [],
		video: 'NOT_IMPLEMENTED',
		carousel: 'NOT_IMPLEMENTED',
		altText: false,
		implementation: 'NOT_IMPLEMENTED',
		notes: 'Custom destinations are recorded only.',
	},
};

export function mediaSpecFor(channel: string | undefined): ChannelMediaSpec {
	if (!channel) return CHANNEL_MEDIA.CUSTOM;
	const direct = CHANNEL_MEDIA[channel] ?? CHANNEL_MEDIA[channel.toUpperCase()];
	if (direct) return direct;
	const legacy = channel.toLowerCase();
	if (legacy === 'linkedin') return CHANNEL_MEDIA.LINKEDIN_PERSONAL;
	if (legacy === 'instagram') return CHANNEL_MEDIA.INSTAGRAM_FEED;
	if (legacy === 'facebook') return CHANNEL_MEDIA.FACEBOOK_PAGE;
	if (legacy === 'threads') return CHANNEL_MEDIA.THREADS;
	if (legacy === 'blog' || legacy === 'article') return CHANNEL_MEDIA.BLOG;
	return CHANNEL_MEDIA.CUSTOM;
}
