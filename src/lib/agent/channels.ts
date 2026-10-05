import { mediaSpecFor } from '@/lib/media/channelMedia';

export const CHANNEL_IDS = [
	'LINKEDIN_PERSONAL',
	'LINKEDIN_ORGANIZATION',
	'X',
	'THREADS',
	'INSTAGRAM_FEED',
	'INSTAGRAM_REEL',
	'INSTAGRAM_STORY',
	'FACEBOOK_PAGE',
	'BLOG',
	'NEWSLETTER',
	'CUSTOM',
] as const;

export type ChannelId = (typeof CHANNEL_IDS)[number];

export type CapabilityState =
	| 'SUPPORTED_BY_PLATFORM'
	| 'CONNECTED_AND_AUTHORIZED'
	| 'NOT_AUTHORIZED'
	| 'NOT_IMPLEMENTED'
	| 'CCE_NATIVE'
	| 'DISCONNECTED'
	| 'UNKNOWN';

export type ChannelCapability =
	| 'research'
	| 'draft'
	| 'media'
	| 'schedule'
	| 'publish'
	| 'comments'
	| 'replies'
	| 'mentions'
	| 'analytics'
	| 'paid_media';

export type ChannelDefinition = {
	id: ChannelId;
	label: string;
	family: string;
	pipelineChannel: string;
	adaptation: string;
	capabilities: Record<ChannelCapability, CapabilityState>;
	notes: string;
};

const socialGap = (overrides: Partial<Record<ChannelCapability, CapabilityState>> = {}): Record<ChannelCapability, CapabilityState> => ({
	research: 'NOT_IMPLEMENTED',
	draft: 'CCE_NATIVE',
	media: 'NOT_IMPLEMENTED',
	schedule: 'CCE_NATIVE',
	publish: 'NOT_IMPLEMENTED',
	comments: 'NOT_IMPLEMENTED',
	replies: 'NOT_IMPLEMENTED',
	mentions: 'NOT_IMPLEMENTED',
	analytics: 'NOT_IMPLEMENTED',
	paid_media: 'NOT_IMPLEMENTED',
	...overrides,
});

export const CHANNEL_REGISTRY: ChannelDefinition[] = [
	{
		id: 'LINKEDIN_PERSONAL',
		label: 'LinkedIn personal',
		family: 'linkedin',
		pipelineChannel: 'linkedin',
		adaptation: 'Professional founder or brand narrative. Not a blog and not a thread.',
		capabilities: socialGap({
			publish: 'SUPPORTED_BY_PLATFORM',
			schedule: 'SUPPORTED_BY_PLATFORM',
			comments: 'NOT_AUTHORIZED',
			analytics: 'NOT_IMPLEMENTED',
			paid_media: 'NOT_IMPLEMENTED',
		}),
		notes: 'The existing LinkedIn publisher can post when a human sets Ready To Publish in the approval queue. Community Management and Ads APIs are not treated as authorised. Connection state is not inferred from documentation.',
	},
	{
		id: 'LINKEDIN_ORGANIZATION',
		label: 'LinkedIn organization',
		family: 'linkedin',
		pipelineChannel: 'linkedin',
		adaptation: 'Organisation page narrative, distinct from a personal founder post.',
		capabilities: socialGap({
			publish: 'SUPPORTED_BY_PLATFORM',
			comments: 'NOT_AUTHORIZED',
			analytics: 'NOT_IMPLEMENTED',
		}),
		notes: 'Organisation publishing depends on a connected organisation author. Not assumed from a personal token.',
	},
	{
		id: 'X',
		label: 'X',
		family: 'x',
		pipelineChannel: 'x',
		adaptation: 'Sharp insight or thread. Not LinkedIn cadence.',
		capabilities: socialGap(),
		notes: 'Architecture is reserved for posts, replies, search, and analytics. No X adapter is connected in this phase. Grok may research outside CCE and submit an opportunity.',
	},
	{
		id: 'THREADS',
		label: 'Threads',
		family: 'threads',
		pipelineChannel: 'threads',
		adaptation: 'Conversational discussion. Not an Instagram caption and not a LinkedIn post.',
		capabilities: socialGap({
			publish: 'SUPPORTED_BY_PLATFORM',
			schedule: 'SUPPORTED_BY_PLATFORM',
			replies: 'NOT_IMPLEMENTED',
		}),
		notes: 'Threads uses native OAuth (threads_basic, threads_content_publish). Reply automation is not enabled; architecture allows future reply APIs.',
	},
	{
		id: 'INSTAGRAM_FEED',
		label: 'Instagram feed',
		family: 'instagram',
		pipelineChannel: 'instagram',
		adaptation: 'Visual-first concept and caption.',
		capabilities: socialGap({ publish: 'SUPPORTED_BY_PLATFORM', media: 'SUPPORTED_BY_PLATFORM' }),
		notes: 'Only professional accounts are API-publishable. Existing Meta publishing remains on its current path. Agent publish is not granted.',
	},
	{
		id: 'INSTAGRAM_REEL',
		label: 'Instagram Reel',
		family: 'instagram',
		pipelineChannel: 'instagram',
		adaptation: 'Short-form visual concept, not a feed caption pasted into a Reel.',
		capabilities: socialGap({ publish: 'UNKNOWN', media: 'SUPPORTED_BY_PLATFORM' }),
		notes: 'Reel publishing is not claimed until the connected account and permissions are checked.',
	},
	{
		id: 'INSTAGRAM_STORY',
		label: 'Instagram Story',
		family: 'instagram',
		pipelineChannel: 'instagram',
		adaptation: 'Ephemeral visual frame, not a feed post.',
		capabilities: socialGap(),
		notes: 'Stories are unsupported until account and API capability are confirmed.',
	},
	{
		id: 'FACEBOOK_PAGE',
		label: 'Facebook Page',
		family: 'facebook',
		pipelineChannel: 'facebook',
		adaptation: 'Page and community framing, not a copy of the LinkedIn post.',
		capabilities: socialGap({ publish: 'SUPPORTED_BY_PLATFORM', media: 'SUPPORTED_BY_PLATFORM' }),
		notes: 'Existing Meta Page publishing stays in place. Comments, replies, and insights are not exposed as authorised.',
	},
	{
		id: 'BLOG',
		label: 'Blog',
		family: 'blog',
		pipelineChannel: 'blog',
		adaptation: 'Deep argument with search value. Not a social post.',
		capabilities: socialGap({
			draft: 'CCE_NATIVE',
			publish: 'NOT_IMPLEMENTED',
		}),
		notes: 'ArticlePublisher can target a webhook destination. Framer, Webflow, WordPress, Payload, and a Folian CMS adapter are not implemented. The action contract does not need to change when they are added.',
	},
	{
		id: 'NEWSLETTER',
		label: 'Newsletter',
		family: 'newsletter',
		pipelineChannel: 'newsletter',
		adaptation: 'Letter to the reader, not a social caption.',
		capabilities: socialGap(),
		notes: 'No newsletter sender is connected.',
	},
	{
		id: 'CUSTOM',
		label: 'Custom',
		family: 'custom',
		pipelineChannel: 'custom',
		adaptation: 'Channel-native treatment must be stated in the brief.',
		capabilities: socialGap(),
		notes: 'Custom destinations are recorded only. Arbitrary URL publish is rejected.',
	},
];

const byId = new Map(CHANNEL_REGISTRY.map((channel) => [channel.id, channel]));
const byPipeline = new Map(CHANNEL_REGISTRY.map((channel) => [channel.pipelineChannel, channel]));

export function resolveChannel(value: string | undefined): ChannelDefinition | null {
	if (!value) return null;
	const direct = byId.get(value as ChannelId) ?? byId.get(value.toUpperCase() as ChannelId);
	if (direct) return direct;
	const legacy = value.toLowerCase();
	if (legacy === 'linkedin') return byId.get('LINKEDIN_PERSONAL') ?? null;
	if (legacy === 'instagram') return byId.get('INSTAGRAM_FEED') ?? null;
	if (legacy === 'facebook') return byId.get('FACEBOOK_PAGE') ?? null;
	return byPipeline.get(legacy) ?? null;
}

export function channelCatalog() {
	return CHANNEL_REGISTRY.map((channel) => ({
		id: channel.id,
		label: channel.label,
		family: channel.family,
		adaptation: channel.adaptation,
		capabilities: channel.capabilities,
		notes: channel.notes,
		media: mediaSpecFor(channel.id),
	}));
}
