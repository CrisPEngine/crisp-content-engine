import { mediaSpecFor } from './channelMedia';
import type { MediaDecision } from './types';

export function channelSupportsExplicitImage(channel: string | undefined): boolean {
	const spec = mediaSpecFor(channel);
	if (!spec.supportedTypes.includes('IMAGE')) return false;
	return spec.implementation === 'SUPPORTED_BY_PLATFORM' || spec.implementation === 'CCE_NATIVE';
}

export function decisionForExplicitImageRequest(input: {
	channel: string;
	topic?: string;
	decision: MediaDecision;
}): MediaDecision {
	const spec = mediaSpecFor(input.channel);
	const topic = input.topic?.trim() || '';
	const aspectRatio = input.decision.aspectRatio ?? spec.aspectRatios[0] ?? '1:1';
	const visualConcept =
		input.decision.visualConcept ??
		`A single ${aspectRatio} image that makes “${topic || 'the brand argument'}” concrete. No generic office scene, no stock handshake, no text overlay.`;
	return {
		...input.decision,
		mediaRecommended: true,
		mediaRole: input.decision.mediaRole === 'NONE' ? 'SUPPORTING' : input.decision.mediaRole,
		mediaType: input.decision.mediaType === 'NONE' ? 'IMAGE' : input.decision.mediaType,
		reason: input.decision.mediaRecommended
			? input.decision.reason
			: 'The agent explicitly requested an image. The channel supports an optional image alongside text.',
		preferredSource: input.decision.preferredSource === 'none' ? 'generate' : input.decision.preferredSource,
		visualConcept,
		aspectRatio,
		textOverlayRecommendation:
			input.decision.textOverlayRecommendation === 'Do not add an image.'
				? 'No text baked into the image. Put the argument in the caption and alt text.'
				: input.decision.textOverlayRecommendation,
		altTextDirection:
			input.decision.altTextDirection ??
			`Describe the concrete visual for ${topic || 'this post'}, not a slogan.`,
		mediaChoice: input.decision.mediaChoice === 'none' ? 'generate' : input.decision.mediaChoice,
	};
}
