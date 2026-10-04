export type MediaRole = 'NONE' | 'SUPPORTING' | 'PRIMARY' | 'REQUIRED_BY_CHANNEL';

export type MediaType =
	| 'IMAGE'
	| 'CAROUSEL'
	| 'DOCUMENT'
	| 'VIDEO'
	| 'DIAGRAM'
	| 'SCREENSHOT'
	| 'INFOGRAPHIC'
	| 'HERO_IMAGE'
	| 'INLINE_IMAGE';

export type MediaSource = 'none' | 'existing' | 'generate' | 'upload' | 'screenshot';

export type MediaDecision = {
	mediaRequired: boolean;
	mediaRecommended: boolean;
	mediaRole: MediaRole;
	mediaType: MediaType | 'NONE';
	reason: string;
	preferredSource: MediaSource;
	visualConcept: string | null;
	aspectRatio: string | null;
	textOverlayRecommendation: string;
	altTextDirection: string | null;
	existingAssetId: string | null;
	generateNow: false;
};

export type ChannelMediaSpec = {
	textOnlySupported: boolean;
	mediaRequired: boolean;
	supportedTypes: MediaType[];
	maxImages: number;
	aspectRatios: string[];
	video: 'SUPPORTED_BY_PLATFORM' | 'NOT_IMPLEMENTED';
	carousel: 'SUPPORTED_BY_PLATFORM' | 'NOT_IMPLEMENTED';
	altText: boolean;
	implementation: 'SUPPORTED_BY_PLATFORM' | 'CCE_NATIVE' | 'NOT_IMPLEMENTED';
	notes: string;
};

export type ContentAssetRecord = {
	id: string;
	ownerUserId: string;
	brandId?: string;
	assetType: 'image' | 'video' | 'audio' | 'document' | 'carousel';
	sourceType: 'upload' | 'generated' | 'existing' | 'external';
	storageProvider: 'cloudinary';
	providerAssetId?: string;
	url?: string;
	mimeType?: string;
	width?: number;
	height?: number;
	aspectRatio?: string;
	fileSize?: number;
	altText?: string;
	caption?: string;
	title?: string;
	generationPrompt?: string;
	generationProvider?: string;
	generationModel?: string;
	provenance: Record<string, unknown>;
	rightsNotes?: string;
	approvalStatus: 'draft' | 'approved' | 'rejected';
	createdAt: string;
	updatedAt: string;
};

export type AssetLink = {
	id: string;
	ownerUserId: string;
	assetId: string;
	targetType: 'content' | 'version' | 'article' | 'section' | 'campaign' | 'brief';
	targetId: string;
	role?: string;
	createdAt: string;
};

export type PublicAsset = {
	id: string;
	brandId?: string;
	assetType: ContentAssetRecord['assetType'];
	sourceType: ContentAssetRecord['sourceType'];
	mimeType?: string;
	width?: number;
	height?: number;
	aspectRatio?: string;
	altText?: string;
	caption?: string;
	title?: string;
	approvalStatus: ContentAssetRecord['approvalStatus'];
	url?: string;
};

export type ImageGenerationRequest = {
	concept: string;
	prompt: string;
	aspectRatio: string;
	altTextDirection: string;
};

export type ImageGenerationResult = {
	bytes: Buffer;
	mimeType: string;
	model: string;
	promptUsed: string;
	estimatedCostUsd: number;
	width?: number;
	height?: number;
};

export type ImageGenerationProvider = {
	id: string;
	configured(): boolean;
	generate(request: ImageGenerationRequest): Promise<ImageGenerationResult>;
};
