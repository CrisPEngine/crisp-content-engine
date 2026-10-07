import { bypassesUsageLimits } from '@/lib/auth/platformAdmin';
import { uploadImageFromBuffer, type CloudinaryUploadResult } from '@/lib/cloudinary';
import { AgentError } from '@/lib/agent/errors';
import { getAgentStore } from '@/lib/agent/controlStore';
import type { RateLimitPolicy } from '@/lib/agent/policy';
import type { BrandBrain } from '@/lib/intelligence/types';
import { resolveAssetAltText } from './altText';
import { channelSupportsExplicitImage, decisionForExplicitImageRequest } from './explicitImage';
import { openaiImageProvider } from './openaiImage';
import { buildImagePrompt } from './prompt';
import { getNativeContentStore } from './store';
import type { ContentAssetRecord, ImageGenerationProvider, MediaDecision, PublicAsset } from './types';

export type { ImageGenerationProvider, ImageGenerationRequest, ImageGenerationResult } from './types';

export type ImageUploader = (buffer: Buffer, filename: string) => Promise<CloudinaryUploadResult>;

let override: ImageGenerationProvider | null | undefined;
let uploader: ImageUploader = uploadImageFromBuffer;
const MAX_ATTEMPTS_PER_TARGET = 2;

export function registerImageProviderForTests(next: ImageGenerationProvider | null): void {
	override = next;
}

export function setImageUploaderForTests(next?: ImageUploader): void {
	uploader = next ?? uploadImageFromBuffer;
}

function resolveProvider(): ImageGenerationProvider | null {
	if (override !== undefined) return override;
	if (process.env.VITEST || process.env.NODE_ENV === 'test') return null;
	return openaiImageProvider;
}

export function imageProviderStatus(): { configured: boolean; provider: string | null } {
	const current = resolveProvider();
	return { configured: Boolean(current?.configured()), provider: current?.id ?? null };
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
		description: asset.description,
		tags: asset.tags,
		productFeature: asset.productFeature,
		libraryType: asset.libraryType,
		verifiedReference: asset.verifiedReference,
		referenceAllowed: asset.referenceAllowed,
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
	brand?: Pick<BrandBrain, 'identity' | 'voice' | 'knowledge'> | null;
	channel?: string;
	topic?: string;
	excerpt?: string;
	explicitRequest?: boolean;
}): Promise<{ asset: PublicAsset; reused: boolean; estimatedCostUsd: number }> {
	let decision = input.decision;
	if (!decision.mediaRecommended && !decision.mediaRequired) {
		if (input.explicitRequest && input.channel && channelSupportsExplicitImage(input.channel)) {
			decision = decisionForExplicitImageRequest({ channel: input.channel, topic: input.topic, decision });
		} else {
			throw new AgentError('invalid_input', 'The media plan does not recommend an image for this piece.', 400);
		}
	}
	const store = getNativeContentStore();
	if (decision.preferredSource === 'existing' && decision.existingAssetId) {
		const existing = await store.getAsset(input.ownerUserId, decision.existingAssetId);
		if (existing) return { asset: publicAsset(existing), reused: true, estimatedCostUsd: 0 };
	}
	const links = await store.listLinks(input.ownerUserId, input.targetType, input.targetId);
	for (const link of links) {
		const linked = await store.getAsset(input.ownerUserId, link.assetId);
		if (linked?.approvalStatus === 'approved') {
			throw new AgentError('invalid_input', 'An approved asset is already attached. It was not replaced.', 409);
		}
	}
	const prior = (await store.listAssets(input.ownerUserId, input.brandId)).filter((asset) => asset.provenance.targetId === input.targetId && asset.sourceType === 'generated');
	const sameProposal = prior.find((asset) => asset.provenance.concept === decision.visualConcept);
	if (sameProposal && !decision.generateNow) {
		return { asset: publicAsset(sameProposal), reused: true, estimatedCostUsd: 0 };
	}
	const unlimitedUsage = await bypassesUsageLimits(input.ownerUserId);
	if (!unlimitedUsage && prior.length >= MAX_ATTEMPTS_PER_TARGET) {
		throw new AgentError('rate_limit', 'This content already has the maximum generated images. Further regeneration is blocked.', 429);
	}
	const provider = resolveProvider();
	if (!provider?.configured()) {
		throw new AgentError('image_provider_unavailable', 'No image-generation provider is configured. The media plan is saved; nothing was generated.', 503);
	}
	const imageSpent = await getAgentStore().imageCostToday(input.credentialId);
	const cap = input.rateLimit.imageCostUsdPerDay;
	if (!unlimitedUsage && cap != null && imageSpent >= cap) throw new AgentError('ai_billing', 'Daily image-generation budget is exhausted.', 402);
	const totalCap = input.rateLimit.dailyCostUsd;
	if (!unlimitedUsage && totalCap != null) {
		const spent = await getAgentStore().costToday(input.credentialId);
		if (spent >= totalCap) throw new AgentError('ai_billing', 'Daily agent generation budget is exhausted.', 402);
	}
	const altTextDirection = resolveAssetAltText({
		altTextDirection: decision.altTextDirection,
		topic: input.topic,
		concept: decision.visualConcept,
		title: decision.visualConcept,
	});
	const instructions = buildImagePrompt({
		brand: input.brand,
		channel: input.channel ?? input.targetType,
		topic: input.topic,
		concept: decision.visualConcept ?? decision.reason,
		aspectRatio: decision.aspectRatio ?? '1:1',
		purpose: decision.mediaRole,
		altTextDirection,
		excerpt: input.excerpt,
	});
	const referenceIds = decision.referenceAssetIds ?? [];
	const referenceImageUrls: string[] = [];
	for (const referenceId of referenceIds) {
		const reference = await store.getAsset(input.ownerUserId, referenceId);
		const permitted = reference?.verifiedReference && reference.referenceAllowed && reference.url && (!reference.brandId || reference.brandId === input.brandId);
		if (permitted && reference.url) referenceImageUrls.push(reference.url);
	}
	const generated = await provider.generate({
		concept: decision.visualConcept ?? decision.reason,
		prompt: instructions.prompt,
		aspectRatio: decision.aspectRatio ?? '1:1',
		altTextDirection,
		referenceImageUrls,
	});
	const [width, height] = dimensionsFor(decision.aspectRatio);
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
		width: stored.width || generated.width || width,
		height: stored.height || generated.height || height,
		aspectRatio: decision.aspectRatio ?? undefined,
		altText: altTextDirection,
		title: decision.visualConcept ?? 'Generated image',
		generationPrompt: generated.promptUsed,
		generationProvider: provider.id,
		generationModel: generated.model,
		provenance: {
			targetType: input.targetType,
			targetId: input.targetId,
			concept: decision.visualConcept,
			role: decision.mediaRole,
			visualGuidanceStored: instructions.visualGuidanceStored,
			estimatedCostUsd: generated.estimatedCostUsd,
			referenceAssetIds: referenceIds,
		},
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
		role: decision.mediaRole,
		createdAt: now,
	});
	if (generated.estimatedCostUsd > 0) await getAgentStore().addImageCost(input.credentialId, generated.estimatedCostUsd);
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
}): Promise<ContentAssetRecord> {
	const now = new Date().toISOString();
	return getNativeContentStore().saveAsset({
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
