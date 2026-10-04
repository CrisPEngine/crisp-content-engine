import { AgentError } from '@/lib/agent/errors';
import type { ImageGenerationProvider, ImageGenerationRequest, ImageGenerationResult } from './types';

export const IMAGE_MODEL = 'gpt-image-2.5-flare';
const TEXT_INPUT_PER_MILLION = 5;
const IMAGE_INPUT_PER_MILLION = 8;
const IMAGE_OUTPUT_PER_MILLION = 30;

type ImageUsage = {
	input_tokens?: number;
	output_tokens?: number;
	input_tokens_details?: { text_tokens?: number; image_tokens?: number };
	output_tokens_details?: { image_tokens?: number; text_tokens?: number };
};

type ImageResponse = {
	data?: Array<{ b64_json?: string }>;
	usage?: ImageUsage;
	error?: { message?: string; code?: string };
};

export function imageSizeForRatio(ratio: string): { size: string; width: number; height: number } {
	if (ratio === '4:5') return { size: '1024x1280', width: 1024, height: 1280 };
	if (ratio === '16:9') return { size: '1536x864', width: 1536, height: 864 };
	if (ratio === '1.91:1') return { size: '1536x800', width: 1536, height: 800 };
	if (ratio === '9:16') return { size: '1024x1824', width: 1024, height: 1824 };
	if (ratio === '3:2') return { size: '1536x1024', width: 1536, height: 1024 };
	return { size: '1024x1024', width: 1024, height: 1024 };
}

export function estimateImageCostUsd(usage: ImageUsage | undefined): number {
	if (!usage) return 0;
	const textIn = usage.input_tokens_details?.text_tokens ?? usage.input_tokens ?? 0;
	const imageIn = usage.input_tokens_details?.image_tokens ?? 0;
	const imageOut = usage.output_tokens_details?.image_tokens ?? usage.output_tokens ?? 0;
	const usd = (textIn / 1_000_000) * TEXT_INPUT_PER_MILLION + (imageIn / 1_000_000) * IMAGE_INPUT_PER_MILLION + (imageOut / 1_000_000) * IMAGE_OUTPUT_PER_MILLION;
	return Math.round(usd * 1_000_000) / 1_000_000;
}

function billingFailure(message: string): boolean {
	const lower = message.toLowerCase();
	return lower.includes('insufficient_quota') || lower.includes('billing') || lower.includes('exceeded your current quota');
}

export const openaiImageProvider: ImageGenerationProvider = {
	id: 'openai',

	configured() {
		return Boolean(process.env.OPENAI_API_KEY?.trim());
	},

	async generate(request: ImageGenerationRequest): Promise<ImageGenerationResult> {
		const apiKey = process.env.OPENAI_API_KEY?.trim();
		if (!apiKey) {
			throw new AgentError('image_provider_unavailable', 'Image generation is not configured.', 503);
		}
		const size = imageSizeForRatio(request.aspectRatio);
		const references = (request.referenceImageUrls ?? []).filter((url) => url.startsWith('https://') || url.startsWith('data:image/'));
		const endpoint = references.length > 0 ? 'https://api.openai.com/v1/images/edits' : 'https://api.openai.com/v1/images/generations';
		const body = references.length > 0
			? { model: IMAGE_MODEL, prompt: request.prompt, images: references.slice(0, 8).map((image_url) => ({ image_url })), size: size.size, quality: 'medium', output_format: 'jpeg', output_compression: 85, n: 1 }
			: { model: IMAGE_MODEL, prompt: request.prompt, size: size.size, quality: 'medium', output_format: 'jpeg', output_compression: 85, n: 1 };
		let response: Response;
		try {
			response = await fetch(endpoint, {
				method: 'POST',
				headers: {
					Authorization: `Bearer ${apiKey}`,
					'Content-Type': 'application/json',
				},
				body: JSON.stringify(body),
				signal: AbortSignal.timeout(120_000),
			});
		} catch (error) {
			const timedOut = error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError');
			throw new AgentError(timedOut ? 'ai_provider_unavailable' : 'image_provider_unavailable', timedOut ? 'Image generation timed out.' : 'Image generation failed before a response.', timedOut ? 503 : 502, undefined, timedOut);
		}
		const payload = (await response.json()) as ImageResponse;
		if (!response.ok) {
			const message = payload.error?.message || `Image generation failed (${response.status})`;
			if (billingFailure(message) || payload.error?.code === 'insufficient_quota') {
				throw new AgentError('ai_billing', 'Image generation billing is unavailable.', 402);
			}
			throw new AgentError(response.status === 429 || response.status >= 500 ? 'ai_provider_unavailable' : 'image_provider_unavailable', 'Image generation was refused.', response.status === 429 ? 429 : 502, undefined, response.status === 429 || response.status >= 500);
		}
		const encoded = payload.data?.[0]?.b64_json;
		if (!encoded) throw new AgentError('image_provider_unavailable', 'Image generation returned no image.', 502);
		return {
			bytes: Buffer.from(encoded, 'base64'),
			mimeType: 'image/jpeg',
			model: IMAGE_MODEL,
			promptUsed: request.prompt,
			estimatedCostUsd: estimateImageCostUsd(payload.usage),
			width: size.width,
			height: size.height,
		};
	},
};
