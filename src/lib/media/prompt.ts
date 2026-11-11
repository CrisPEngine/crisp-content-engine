import type { BrandBrain } from '@/lib/intelligence/types';

export type ImagePromptInput = {
	brand?: Pick<BrandBrain, 'identity' | 'voice' | 'knowledge'> | null;
	channel: string;
	topic?: string;
	concept: string;
	aspectRatio: string;
	purpose: string;
	altTextDirection?: string;
	negativeConstraints?: string;
	revisionInstructions?: string;
	brandStyleOverride?: string;
	roleFraming?: string;
	hasProductReference?: boolean;
};

export type ImagePrompt = {
	prompt: string;
	visualGuidanceStored: boolean;
};

const AVOID = [
	'glowing AI brains',
	'robots',
	'generic blank laptops with invented screens',
	'floating neon interfaces',
	'a random author typing at a desk',
	'text, logos, or captions baked into the image',
	'fabricated product UI that invents buttons or menus',
	'malformed hands or duplicated limbs',
];

function storedVisualGuidance(brand: ImagePromptInput['brand']): string | null {
	const notes = brand?.knowledge.referenceInformation ?? [];
	const visual = notes.find((note) => /visual|palette|photography|art direction|imagery|brand style/i.test(note));
	return visual?.trim() || null;
}

export function buildImagePrompt(input: ImagePromptInput): ImagePrompt {
	const guidance = input.brandStyleOverride?.trim() || storedVisualGuidance(input.brand);
	const name = input.brand?.identity.name?.trim() || 'the brand';
	const positioning = input.brand?.identity.positioning?.trim();
	const tone = input.brand?.voice.tone?.trim();
	const extraAvoid = input.negativeConstraints
		?.split(/[\n,;]+/)
		.map((item) => item.trim())
		.filter(Boolean) ?? [];
	const lines = [
		`Create one ${input.aspectRatio} photograph or illustration for ${name}.`,
		`Channel: ${input.channel}. Purpose: ${input.purpose}.`,
		input.roleFraming ?? '',
		`Approved visual concept (primary direction): ${input.concept}`,
		input.topic ? `Article topic for context only (do not paint as lettering): ${input.topic}` : '',
		positioning ? `Brand position, for context only: ${positioning}` : '',
		tone ? `Tone: ${tone}` : '',
		guidance
			? `Stored visual guidance: ${guidance}`
			: 'No verified visual-brand system is stored. Use restrained direction: a quiet, specific, physical image. Do not invent a permanent palette, logo, or brand rule.',
		input.hasProductReference
			? 'A genuine product screenshot is supplied as a reference. Composite that exact UI into the scene. Preserve layout, colours, buttons, navigation and legibility. Do not redraw or invent the interface.'
			: 'Do not invent product interfaces. If a screen is visible and no screenshot reference is attached, keep it blank, darkened, or out of frame.',
		`Do not depict: ${[...AVOID, ...extraAvoid].join('; ')}.`,
		input.revisionInstructions?.trim()
			? `Revision instructions for this generation (must change the image accordingly): ${input.revisionInstructions.trim()}`
			: '',
		input.altTextDirection ? `A viewer who cannot see the image should be able to understand: ${input.altTextDirection}` : '',
	];
	return {
		prompt: lines.filter(Boolean).join('\n'),
		visualGuidanceStored: Boolean(guidance),
	};
}
