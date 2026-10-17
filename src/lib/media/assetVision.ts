import type { AssetVisionAnalysis } from './assetVisionTypes';

const DEFAULT_MODEL = process.env.ASSET_VISION_MODEL || 'gpt-4o-mini';

function visionConfigured(): boolean {
	return Boolean(process.env.OPENAI_API_KEY?.trim());
}

function sanitizeAnalysis(raw: Record<string, unknown>): AssetVisionAnalysis {
	const asStrings = (value: unknown): string[] =>
		Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).map((s) => s.trim()) : [];
	const orientationRaw = typeof raw.orientation === 'string' ? raw.orientation.toLowerCase() : 'unknown';
	const orientation =
		orientationRaw === 'portrait' || orientationRaw === 'landscape' || orientationRaw === 'square' ? orientationRaw : 'unknown';
	return {
		summary: typeof raw.summary === 'string' ? raw.summary.trim() : '',
		subjects: asStrings(raw.subjects),
		brandEntities: asStrings(raw.brandEntities),
		setting: typeof raw.setting === 'string' ? raw.setting.trim() : '',
		colours: asStrings(raw.colours),
		mood: typeof raw.mood === 'string' ? raw.mood.trim() : '',
		orientation,
		cropSuitability: typeof raw.cropSuitability === 'string' ? raw.cropSuitability.trim() : '',
		suggestedTopics: asStrings(raw.suggestedTopics),
		altText: typeof raw.altText === 'string' ? raw.altText.trim() : '',
		searchTags: asStrings(raw.searchTags),
		analyzedAt: new Date().toISOString(),
		model: DEFAULT_MODEL,
	};
}

export function assetVisionStatus(): { configured: boolean; model: string } {
	return { configured: visionConfigured(), model: DEFAULT_MODEL };
}

export async function analyzeAssetImage(input: {
	imageUrl: string;
	brandName?: string;
	libraryType?: string;
	productFeature?: string;
	userTitle?: string;
}): Promise<AssetVisionAnalysis | null> {
	if (!visionConfigured()) return null;
	const apiKey = process.env.OPENAI_API_KEY!.trim();
	const brandLine = input.brandName ? `Brand context: ${input.brandName}.` : '';
	const metaLine = [input.libraryType, input.productFeature, input.userTitle].filter(Boolean).join(' · ');
	const prompt = [
		'You describe product and brand photos for a marketing content library.',
		brandLine,
		metaLine ? `User metadata (may help but do not invent beyond the image): ${metaLine}` : '',
		'Rules:',
		'- Only state product specifics (model name, scale, colour, brand) if clearly visible or explicitly provided in user metadata.',
		'- If unsure, use generic wording and leave brandEntities empty rather than guessing.',
		'- Do not use em dashes.',
		'- Return strict JSON with keys: summary, subjects, brandEntities, setting, colours, mood, orientation, cropSuitability, suggestedTopics, altText, searchTags.',
		'- orientation must be portrait, landscape, square, or unknown.',
	].join('\n');

	const response = await fetch('https://api.openai.com/v1/chat/completions', {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${apiKey}`,
			'Content-Type': 'application/json',
		},
		body: JSON.stringify({
			model: DEFAULT_MODEL,
			max_tokens: 1200,
			temperature: 0.2,
			response_format: { type: 'json_object' },
			messages: [
				{
					role: 'user',
					content: [
						{ type: 'text', text: prompt },
						{ type: 'image_url', image_url: { url: input.imageUrl, detail: 'low' } },
					],
				},
			],
		}),
		signal: AbortSignal.timeout(45_000),
	});

	if (!response.ok) return null;
	const payload = (await response.json()) as {
		choices?: Array<{ message?: { content?: string } }>;
	};
	const content = payload.choices?.[0]?.message?.content;
	if (!content) return null;
	try {
		const parsed = JSON.parse(content) as Record<string, unknown>;
		const analysis = sanitizeAnalysis(parsed);
		if (!analysis.summary) return null;
		return analysis;
	} catch {
		return null;
	}
}
