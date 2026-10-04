import type { BrandBrain } from '@/lib/intelligence/types';

export type ImagePromptInput = {
	brand?: Pick<BrandBrain, 'identity' | 'voice' | 'knowledge'> | null;
	channel: string;
	topic?: string;
	concept: string;
	aspectRatio: string;
	purpose: string;
	altTextDirection?: string;
	excerpt?: string;
};

export type ImagePrompt = {
	prompt: string;
	visualGuidanceStored: boolean;
};

const AVOID = [
	'glowing AI brains',
	'robots',
	'generic laptops',
	'floating neon interfaces',
	'a random author typing at a desk',
	'text, logos, or captions baked into the image',
];

function storedVisualGuidance(brand: ImagePromptInput['brand']): string | null {
	const notes = brand?.knowledge.referenceInformation ?? [];
	const visual = notes.find((note) => /visual|palette|photography|art direction/i.test(note));
	return visual?.trim() || null;
}

export function buildImagePrompt(input: ImagePromptInput): ImagePrompt {
	const guidance = storedVisualGuidance(input.brand);
	const name = input.brand?.identity.name?.trim() || 'the brand';
	const positioning = input.brand?.identity.positioning?.trim();
	const tone = input.brand?.voice.tone?.trim();
	const lines = [
		`Create one ${input.aspectRatio} photograph or illustration for ${name}.`,
		`Channel: ${input.channel}. Purpose: ${input.purpose}.`,
		`Visual concept: ${input.concept}`,
		input.topic ? `Subject: ${input.topic}` : '',
		positioning ? `Brand position, for context only: ${positioning}` : '',
		tone ? `Tone: ${tone}` : '',
		input.excerpt ? `The image should support this idea without repeating it as lettering: ${input.excerpt.slice(0, 400)}` : '',
		guidance
			? `Stored visual guidance: ${guidance}`
			: 'No verified visual-brand system is stored. Use restrained direction: a quiet, specific, physical image. Do not invent a permanent palette, logo, or brand rule.',
		`Do not depict: ${AVOID.join('; ')}.`,
		input.altTextDirection ? `A viewer who cannot see the image should be able to understand: ${input.altTextDirection}` : '',
	];
	return {
		prompt: lines.filter(Boolean).join('\n'),
		visualGuidanceStored: Boolean(guidance),
	};
}
