import { mediaSpecFor } from './channelMedia';
import type { MediaDecision, MediaType, PublicAsset } from './types';

const VISUAL_TOPIC = /\b(diagram|screenshot|chart|infographic|before and after|interface|canvas|timeline)\b/i;

function tokens(text: string): string[] {
	return text.toLowerCase().split(/[^a-z0-9]+/).filter((word) => word.length > 3);
}

function matchingAsset(topic: string, assets: PublicAsset[]): PublicAsset | undefined {
	const wanted = new Set(tokens(topic));
	return assets.find((asset) => tokens(`${asset.title ?? ''} ${asset.altText ?? ''} ${asset.caption ?? ''}`).some((word) => wanted.has(word)));
}

export function planMedia(input: {
	channel: string;
	topic?: string;
	objective?: string;
	contentType?: string;
	assets?: PublicAsset[];
}): MediaDecision {
	const spec = mediaSpecFor(input.channel);
	const topic = input.topic ?? input.objective ?? '';
	const visualTopic = VISUAL_TOPIC.test(topic);
	const existing = matchingAsset(topic, input.assets ?? []);
	const article = input.contentType === 'article' || spec.supportedTypes.includes('HERO_IMAGE');

	if (spec.mediaRequired) {
		return {
			mediaRequired: true,
			mediaRecommended: true,
			mediaRole: 'REQUIRED_BY_CHANNEL',
			mediaType: spec.supportedTypes[0] ?? 'IMAGE',
			reason: `${input.channel} cannot be published as text alone. The visual has to carry the idea, not decorate a caption.`,
			preferredSource: existing ? 'existing' : 'generate',
			visualConcept: conceptFor(topic, spec.aspectRatios[0] ?? '1:1'),
			aspectRatio: spec.aspectRatios[0] ?? null,
			textOverlayRecommendation: 'No text baked into the image. Put the argument in the caption and alt text.',
			altTextDirection: `Describe the concrete visual for ${topic || 'this post'}, not a slogan.`,
			existingAssetId: existing?.id ?? null,
			generateNow: false,
		};
	}

	if (article && !visualTopic) {
		return {
			mediaRequired: false,
			mediaRecommended: true,
			mediaRole: 'SUPPORTING',
			mediaType: 'HERO_IMAGE',
			reason: 'The article can stand without an image. One hero can show the distinction the piece argues. Extra images would be decoration.',
			preferredSource: existing ? 'existing' : 'generate',
			visualConcept: conceptFor(topic, '16:9'),
			aspectRatio: '16:9',
			textOverlayRecommendation: 'No headline burned into the hero. The title already does that work.',
			altTextDirection: 'Describe the scene or diagram a reader needs if they cannot see it.',
			existingAssetId: existing?.id ?? null,
			generateNow: false,
		};
	}

	if (visualTopic) {
		const type: MediaType = /diagram/i.test(topic) ? 'DIAGRAM' : /screenshot/i.test(topic) ? 'SCREENSHOT' : 'IMAGE';
		return {
			mediaRequired: false,
			mediaRecommended: true,
			mediaRole: 'SUPPORTING',
			mediaType: type,
			reason: 'The topic is easier to understand visually. Text remains valid on this channel.',
			preferredSource: existing ? 'existing' : type === 'SCREENSHOT' ? 'screenshot' : 'generate',
			visualConcept: conceptFor(topic, spec.aspectRatios[0] ?? '1:1'),
			aspectRatio: spec.aspectRatios[0] ?? null,
			textOverlayRecommendation: 'Label only what the reader cannot infer.',
			altTextDirection: 'State what the visual shows.',
			existingAssetId: existing?.id ?? null,
			generateNow: false,
		};
	}

	return {
		mediaRequired: false,
		mediaRecommended: false,
		mediaRole: 'NONE',
		mediaType: 'NONE',
		reason: `${input.channel} supports text-only, and this piece is an argument. An image would not add evidence.`,
		preferredSource: 'none',
		visualConcept: null,
		aspectRatio: null,
		textOverlayRecommendation: 'Do not add an image.',
		altTextDirection: null,
		existingAssetId: null,
		generateNow: false,
	};
}

function conceptFor(topic: string, ratio: string): string {
	const subject = topic.trim() || 'the brand argument';
	return `A single ${ratio} image that makes “${subject}” concrete. No generic office scene, no stock handshake, no text overlay.`;
}

export function articleInlinePlan(sections: Array<{ id: string; heading: string; purpose?: string }>): Array<{ sectionId: string; mediaType: MediaType; purpose: string }> {
	return sections
		.filter((section) => VISUAL_TOPIC.test(`${section.heading} ${section.purpose ?? ''}`))
		.map((section) => ({
			sectionId: section.id,
			mediaType: /diagram/i.test(section.heading) ? 'DIAGRAM' : 'INLINE_IMAGE',
			purpose: `Explain ${section.heading}. Do not add an image that only repeats the heading.`,
		}));
}
