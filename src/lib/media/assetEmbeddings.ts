import { EMBEDDING_MODEL } from './assetLibraryConfig';
import type { ContentAssetRecord } from './types';
import type { AssetVisionAnalysis } from './assetVisionTypes';

function embeddingConfigured(): boolean {
	return Boolean(process.env.OPENAI_API_KEY?.trim());
}

export function embeddingTextForAsset(asset: ContentAssetRecord, vision?: AssetVisionAnalysis | null): string {
	const visionBlock = vision
		? [
				vision.summary,
				vision.setting,
				vision.mood,
				...(vision.subjects ?? []),
				...(vision.brandEntities ?? []),
				...(vision.colours ?? []),
				...(vision.suggestedTopics ?? []),
				...(vision.searchTags ?? []),
				...(vision.detectedText ?? []),
			]
		: [];
	return [
		asset.title,
		asset.description,
		asset.productFeature,
		asset.libraryType,
		...(asset.tags ?? []),
		...visionBlock,
	]
		.filter(Boolean)
		.join('\n')
		.slice(0, 8000);
}

export async function embedText(text: string): Promise<number[] | null> {
	if (!embeddingConfigured() || !text.trim()) return null;
	const apiKey = process.env.OPENAI_API_KEY!.trim();
	const response = await fetch('https://api.openai.com/v1/embeddings', {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${apiKey}`,
			'Content-Type': 'application/json',
		},
		body: JSON.stringify({
			model: EMBEDDING_MODEL,
			input: text.trim(),
		}),
		signal: AbortSignal.timeout(30_000),
	});
	if (!response.ok) return null;
	const payload = (await response.json()) as { data?: Array<{ embedding?: number[] }> };
	const vector = payload.data?.[0]?.embedding;
	return Array.isArray(vector) && vector.length > 0 ? vector : null;
}

export function cosineSimilarity(a: number[], b: number[]): number {
	if (a.length !== b.length || a.length === 0) return 0;
	let dot = 0;
	let normA = 0;
	let normB = 0;
	for (let i = 0; i < a.length; i += 1) {
		dot += a[i] * b[i];
		normA += a[i] * a[i];
		normB += b[i] * b[i];
	}
	if (normA === 0 || normB === 0) return 0;
	return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export async function embedAssetRecord(asset: ContentAssetRecord): Promise<{ embedding: number[]; model: string } | null> {
	const text = embeddingTextForAsset(asset, asset.visionAnalysis);
	const embedding = await embedText(text);
	if (!embedding) return null;
	return { embedding, model: EMBEDDING_MODEL };
}
