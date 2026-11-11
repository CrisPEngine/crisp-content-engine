/** Configurable registry of image-generation models. Production selection stays env-driven. */

export type ImageModelCapabilities = {
	id: string;
	provider: 'openai';
	label: string;
	generation: boolean;
	editing: boolean;
	referenceImages: boolean;
	maxReferenceImages: number;
	qualityOptions: Array<'low' | 'medium' | 'high'>;
	notes: string;
	estimatedCostBand: 'lower' | 'mid' | 'higher';
	status: 'recommended' | 'available' | 'legacy' | 'shutdown';
};

export const IMAGE_MODEL_REGISTRY: ImageModelCapabilities[] = [
	{
		id: 'gpt-image-2.5-flare',
		provider: 'openai',
		label: 'GPT Image 2.5 Flare',
		generation: true,
		editing: true,
		referenceImages: true,
		maxReferenceImages: 16,
		qualityOptions: ['low', 'medium', 'high'],
		notes: 'Current CCE default. Strong prompt adherence; reference edits supported via /images/edits.',
		estimatedCostBand: 'mid',
		status: 'recommended',
	},
	{
		id: 'gpt-image-2.5-sunburst',
		provider: 'openai',
		label: 'GPT Image 2.5 Sunburst',
		generation: true,
		editing: true,
		referenceImages: true,
		maxReferenceImages: 16,
		qualityOptions: ['low', 'medium', 'high'],
		notes: 'OpenAI Images API default. Comparable to Flare; validate before switching CCE production.',
		estimatedCostBand: 'mid',
		status: 'available',
	},
	{
		id: 'gpt-image-2.6-sunburst',
		provider: 'openai',
		label: 'GPT Image 2.6 Sunburst',
		generation: true,
		editing: true,
		referenceImages: true,
		maxReferenceImages: 16,
		qualityOptions: ['low', 'medium', 'high'],
		notes: 'Newer detailed/precise family. Evaluate quality, anatomy, and reference fidelity before cutover.',
		estimatedCostBand: 'higher',
		status: 'available',
	},
	{
		id: 'gpt-image-2.6-flare',
		provider: 'openai',
		label: 'GPT Image 2.6 Flare',
		generation: true,
		editing: true,
		referenceImages: true,
		maxReferenceImages: 16,
		qualityOptions: ['low', 'medium', 'high'],
		notes: 'Newer faster family. Evaluate visual quality and reference fidelity before production cutover.',
		estimatedCostBand: 'higher',
		status: 'available',
	},
	{
		id: 'gpt-image-1.5',
		provider: 'openai',
		label: 'GPT Image 1.5',
		generation: true,
		editing: true,
		referenceImages: true,
		maxReferenceImages: 16,
		qualityOptions: ['low', 'medium', 'high'],
		notes: 'Deprecated previous generation. Supports input_fidelity for face/style matching.',
		estimatedCostBand: 'lower',
		status: 'legacy',
	},
	{
		id: 'gpt-image-1',
		provider: 'openai',
		label: 'GPT Image 1',
		generation: false,
		editing: false,
		referenceImages: false,
		maxReferenceImages: 0,
		qualityOptions: [],
		notes: 'Shut down 23 Oct 2026. Do not select.',
		estimatedCostBand: 'lower',
		status: 'shutdown',
	},
];

export const DEFAULT_IMAGE_MODEL = 'gpt-image-2.5-flare';

export function resolveImageModelId(override?: string | null): string {
	const fromEnv = process.env.CCE_IMAGE_MODEL?.trim() || process.env.OPENAI_IMAGE_MODEL?.trim();
	const candidate = (override || fromEnv || DEFAULT_IMAGE_MODEL).trim();
	const known = IMAGE_MODEL_REGISTRY.find((model) => model.id === candidate);
	if (!known || known.status === 'shutdown') return DEFAULT_IMAGE_MODEL;
	return known.id;
}

export function imageModelReport() {
	const selected = resolveImageModelId();
	const entry = IMAGE_MODEL_REGISTRY.find((model) => model.id === selected) ?? IMAGE_MODEL_REGISTRY[0];
	return {
		provider: 'openai',
		endpoints: {
			generate: 'https://api.openai.com/v1/images/generations',
			edit: 'https://api.openai.com/v1/images/edits',
		},
		selectedModel: selected,
		capabilities: entry,
		registry: IMAGE_MODEL_REGISTRY.filter((model) => model.status !== 'shutdown'),
		note: 'Production model is not changed automatically. Set CCE_IMAGE_MODEL to evaluate alternatives.',
	};
}
