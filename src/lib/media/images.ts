import { uploadImageFromBuffer, type CloudinaryUploadResult } from '@/lib/cloudinary';
import { AgentError } from '@/lib/agent/errors';
import { getAgentStore } from '@/lib/agent/controlStore';
import type { RateLimitPolicy } from '@/lib/agent/policy';
import { getNativeContentStore } from './store';
import type { ContentAssetRecord, MediaDecision, PublicAsset } from './types';

export type ImageGenerationRequest = {
	concept: string;
	aspectRatio: string;
	altTextDirection: string;
};

export type ImageGenerationResult = {
	bytes: Buffer;
	mimeType: string;
	model: string;
	promptUsed: string;
	estimatedCostUsd: number;
};

export type ImageGenerationProvider = {
	id: string;
	configured(): boolean;
	generate(request: ImageGenerationRequest): Promise<ImageGenerationResult>;
};

export type ImageUploader = (buffer: Buffer, filename: string) => Promise<CloudinaryUploadResult>;

let provider: ImageGenerationProvider | null = null;
let uploader: ImageUploader = uploadImageFromBuffer;
const MAX_ATTEMPTS_PER_TARGET = 2;

export function registerImageProviderForTests(next: ImageGenerationProvider | null): void {
	provider = next;
}

export function setImageUploaderForTests(next?: ImageUploader): void {
	uploader = next ?? uploadImageFromBuffer;
}

export function imageProviderStatus(): { configured: boolean; provider: string | null } {
	return { configured: Boolean(provider?.configured()), provider: provider?.id ?? null };
}

export function publicAsset(asset: ContentAssetRecord): PublicAsset {
	return {
		id: asset.id,
		brandId: asset.brandId,
		assetType: asset.assetType,
		sourceType: asset.sourceType,
		mimeType: asset.mimeType,
		width: asset.width,
		height: asset.height,
		aspectRatio: asset.aspectRatio,
		altText: asset.altText,
		caption: asset.caption,
		title: asset.title,
		approvalStatus: asset.approvalStatus,
		url: asset.url,
	};
}

export async function generateAssetFromProposal(input: {
	ownerUserId: string;
	credentialId: string;
	brandId: string;
	targetType: 'content' | 'article' | 'brief';
	targetId: string;
	decision: MediaDecision;
	rateLimit: RateLimitPolicy;
}): Promise<{ asset: PublicAsset; reused: boolean; estimatedCostUsd: number }> {
	if (!input.decision.mediaRecommended && !input.decision.mediaRequired) {
		throw new AgentError('invalid_input', 'The media plan does not recommend an image for this piece.', 400);
	}
	if (input.decision.preferredSource === 'existing' && input.decision.existingAssetId) {
		const existing = await getNativeContentStore().getAsset(input.ownerUserId, input.decision.existingAssetId);
		if (existing) return { asset: publicAsset(existing), reused: true, estimatedCostUsd: 0 };
	}
	const store = getNativeContentStore();
	const prior = (await store.listAssets(input.ownerUserId, input.brandId)).filter((asset) => asset.provenance.targetId === input.targetId && asset.sourceType === 'generated');
	const sameProposal = prior.find((asset) => asset.provenance.concept === input.decision.visualConcept);
	if (sameProposal && !input.decision.generateNow) {
		return { asset: publicAsset(sameProposal), reused: true, estimatedCostUsd: 0 };
	}
	if (prior.length >= MAX_ATTEMPTS_PER_TARGET) {
		throw new AgentError('rate_limit', 'This content already has the maximum generated images. Further regeneration is blocked.', 429);
	}
	if (!provider?.configured()) {
		throw new AgentError('image_provider_unavailable', 'No image-generation provider is configured. The media plan is saved; nothing was generated.', 503);
	}
	const cap = input.rateLimit.imageCostUsdPerDay;
	if (cap != null) {
		const spent = await getAgentStore().costToday(input.credentialId);
		if (spent >= cap) throw new AgentError('ai_billing', 'Daily image-generation budget is exhausted.', 402);
	}
	const generated = await provider.generate({
		concept: input.decision.visualConcept ?? input.decision.reason,
		aspectRatio: input.decision.aspectRatio ?? '1:1',
		altTextDirection: input.decision.altTextDirection ?? 'Describe the image.',
	});
	const [width, height] = dimensionsFor(input.decision.aspectRatio);
	const stored = await uploader(generated.bytes, `${input.targetId}.jpg`);
	const now = new Date().toISOString();
	const asset = await store.saveAsset({
		id: crypto.randomUUID(),
		ownerUserId: input.ownerUserId,
		brandId: input.brandId,
		assetType: 'image',
		sourceType: 'generated',
		storageProvider: 'cloudinary',
		providerAssetId: stored.public_id,
		url: stored.secure_url,
		mimeType: generated.mimeType,
		width: stored.width || width,
		height: stored.height || height,
		aspectRatio: input.decision.aspectRatio ?? undefined,
		altText: input.decision.altTextDirection ?? undefined,
		title: input.decision.visualConcept ?? 'Generated image',
		generationPrompt: generated.promptUsed,
		generationProvider: provider.id,
		generationModel: generated.model,
		provenance: { targetType: input.targetType, targetId: input.targetId, concept: input.decision.visualConcept, role: input.decision.mediaRole },
		approvalStatus: 'draft',
		createdAt: now,
		updatedAt: now,
	});
	await store.saveLink({
		id: crypto.randomUUID(),
		ownerUserId: input.ownerUserId,
		assetId: asset.id,
		targetType: input.targetType === 'brief' ? 'brief' : input.targetType,
		targetId: input.targetId,
		role: input.decision.mediaRole,
		createdAt: now,
	});
	if (generated.estimatedCostUsd > 0) await getAgentStore().addCost(input.credentialId, generated.estimatedCostUsd);
	return { asset: publicAsset(asset), reused: false, estimatedCostUsd: generated.estimatedCostUsd };
}

export async function recordUploadedAsset(input: {
	ownerUserId: string;
	url: string;
	providerAssetId: string;
	width?: number;
	height?: number;
	mimeType?: string;
	fileSize?: number;
	brandId?: string;
}): Promise<void> {
	const now = new Date().toISOString();
	await getNativeContentStore().saveAsset({
		id: crypto.randomUUID(),
		ownerUserId: input.ownerUserId,
		brandId: input.brandId,
		assetType: 'image',
		sourceType: 'upload',
		storageProvider: 'cloudinary',
		providerAssetId: input.providerAssetId,
		url: input.url,
		mimeType: input.mimeType,
		width: input.width,
		height: input.height,
		fileSize: input.fileSize,
		provenance: { path: 'approval_upload' },
		approvalStatus: 'draft',
		createdAt: now,
		updatedAt: now,
	});
}

function dimensionsFor(ratio: string | null): [number, number] {
	if (ratio === '4:5') return [1080, 1350];
	if (ratio === '16:9' || ratio === '1.91:1') return [1920, 1080];
	if (ratio === '9:16') return [1080, 1920];
	return [1080, 1080];
}
