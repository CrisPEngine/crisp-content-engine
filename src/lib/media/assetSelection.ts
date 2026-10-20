import { mediaSpecFor } from './channelMedia';
import { scoreAssetForTopic, assetSearchText } from './assetMatching';
import { cosineSimilarity, embedText } from './assetEmbeddings';
import { ASSET_REUSE_COOLDOWN_DAYS, AUTO_ATTACH_MIN_SCORE, STALE_SCREENSHOT_DAYS } from './assetLibraryConfig';
import type { AssetLearningBoosts } from './assetLearning';
import type { AssetLink, ContentAssetRecord, PublicAsset } from './types';
import type { AssetVisionAnalysis } from './assetVisionTypes';
import { publicAsset } from './images';

export type AssetPickContext = {
	ownerUserId: string;
	brandId: string;
	channel: string;
	topic: string;
	assets: ContentAssetRecord[];
	visionByAssetId: Map<string, AssetVisionAnalysis>;
	recentLinks: AssetLink[];
	memoryChannelByContentId?: Map<string, string>;
	learningBoosts?: AssetLearningBoosts;
};

export type AssetPickResult = {
	asset: PublicAsset;
	score: number;
	matchReason: string;
	staleScreenshot: boolean;
	reuseBlocked: boolean;
};

const REAL_LIBRARY_TYPES = new Set([
	'PRODUCT_SCREENSHOT',
	'PRODUCT_UI',
	'PRODUCT_PHOTO',
	'FOUNDER_PHOTO',
	'SOCIAL_IMAGE',
	'ARTICLE_IMAGE',
]);

function normalizeChannel(channel: string): string {
	const c = channel.toLowerCase();
	if (c.includes('instagram')) return 'instagram';
	if (c.includes('linkedin')) return 'linkedin';
	if (c.includes('threads')) return 'threads';
	if (c.includes('facebook')) return 'facebook';
	if (c === 'x' || c.includes('twitter')) return 'x';
	if (c.includes('blog')) return 'blog';
	return c.replace(/[^a-z0-9]+/g, '_');
}

function aspectRatioValue(ratio: string | undefined): number | null {
	if (!ratio || !ratio.includes(':')) return null;
	const [w, h] = ratio.split(':').map((part) => parseFloat(part));
	if (!w || !h) return null;
	return w / h;
}

function aspectFitScore(asset: PublicAsset, preferredRatios: string[]): number {
	if (preferredRatios.length === 0) return 0;
	const assetRatio =
		aspectRatioValue(asset.aspectRatio) ??
		(asset.width && asset.height ? asset.width / asset.height : null);
	if (assetRatio == null) return 0;
	let best = 0;
	for (const ratio of preferredRatios) {
		const target = aspectRatioValue(ratio);
		if (target == null) continue;
		const delta = Math.abs(Math.log(assetRatio / target));
		best = Math.max(best, Math.max(0, 1.5 - delta));
	}
	return best;
}

function visionChannelBoost(vision: AssetVisionAnalysis | undefined, channel: string): number {
	if (!vision?.suggestedChannels?.length) return 0;
	const wanted = normalizeChannel(channel);
	return vision.suggestedChannels.some((item) => normalizeChannel(item).includes(wanted) || wanted.includes(normalizeChannel(item)))
		? 1.5
		: 0;
}

export function isStaleScreenshot(asset: ContentAssetRecord, now = Date.now()): boolean {
	if (asset.libraryType !== 'PRODUCT_SCREENSHOT' && asset.libraryType !== 'PRODUCT_UI') return false;
	const created = Date.parse(asset.createdAt);
	if (Number.isNaN(created)) return false;
	const ageDays = (now - created) / 86_400_000;
	return ageDays > STALE_SCREENSHOT_DAYS;
}

export function recentlyUsedOnChannel(
	assetId: string,
	channel: string,
	links: AssetLink[],
	memoryChannelByContentId?: Map<string, string>,
): boolean {
	const cutoff = Date.now() - ASSET_REUSE_COOLDOWN_DAYS * 86_400_000;
	for (const link of links) {
		if (link.assetId !== assetId) continue;
		if (Date.parse(link.createdAt) < cutoff) continue;
		if (link.targetType !== 'content') continue;
		const contentChannel = memoryChannelByContentId?.get(link.targetId);
		if (contentChannel && normalizeChannel(contentChannel) !== normalizeChannel(channel)) continue;
		return true;
	}
	return false;
}

export function eligibleLibraryAsset(asset: ContentAssetRecord): boolean {
	if (asset.approvalStatus !== 'approved') return false;
	if (asset.sourceType === 'generated') return false;
	if (!asset.url) return false;
	if (!asset.brandId) return false;
	if (asset.libraryType && REAL_LIBRARY_TYPES.has(asset.libraryType)) return true;
	return asset.verifiedReference === true;
}

export async function rankAssetsForGeneration(ctx: AssetPickContext): Promise<AssetPickResult[]> {
	const spec = mediaSpecFor(ctx.channel);
	const topicEmbedding = await embedText(ctx.topic);
	const results: AssetPickResult[] = [];

	for (const record of ctx.assets) {
		if (record.brandId !== ctx.brandId) continue;
		if (!eligibleLibraryAsset(record)) continue;

		const vision = ctx.visionByAssetId.get(record.id) ?? record.visionAnalysis;
		const pub = publicAsset(record);
		const { score: tokenScore, matchReason } = scoreAssetForTopic(ctx.topic, pub, vision);
		let score = tokenScore;
		score += aspectFitScore(pub, spec.aspectRatios);
		score += visionChannelBoost(vision, ctx.channel);
		if (ctx.learningBoosts?.has(record.id)) score += ctx.learningBoosts.get(record.id)!;

		if (topicEmbedding && record.searchEmbedding?.length) {
			const sim = cosineSimilarity(topicEmbedding, record.searchEmbedding);
			if (sim > 0.2) score += sim * 4;
		}

		const stale = isStaleScreenshot(record);
		if (stale) score -= 1;

		const reuseBlocked = recentlyUsedOnChannel(record.id, ctx.channel, ctx.recentLinks, ctx.memoryChannelByContentId);
		if (reuseBlocked) score -= 5;

		if (score <= 0) continue;

		const reasonParts = [
			matchReason,
			aspectFitScore(pub, spec.aspectRatios) > 0 ? `Aspect ratio fits ${spec.aspectRatios.join(' or ')}.` : null,
			visionChannelBoost(vision, ctx.channel) > 0 ? 'Vision suggested this channel.' : null,
			reuseBlocked ? `Used on ${ctx.channel} within ${ASSET_REUSE_COOLDOWN_DAYS} days (penalised).` : null,
			stale ? `Screenshot may be stale (older than ${STALE_SCREENSHOT_DAYS} days).` : null,
		].filter(Boolean);

		results.push({
			asset: { ...pub, staleScreenshot: stale, rightsNotes: record.rightsNotes },
			score,
			matchReason: reasonParts.join(' '),
			staleScreenshot: stale,
			reuseBlocked,
		});
	}

	return results.sort((a, b) => b.score - a.score);
}

export async function pickBestApprovedAsset(ctx: AssetPickContext): Promise<AssetPickResult | null> {
	const ranked = await rankAssetsForGeneration(ctx);
	const best = ranked.find((row) => !row.reuseBlocked && row.score >= AUTO_ATTACH_MIN_SCORE);
	return best ?? null;
}

export function searchAssetsLocal(
	query: string,
	assets: PublicAsset[],
	visionByAssetId?: Map<string, AssetVisionAnalysis>,
): PublicAsset[] {
	const q = query.trim().toLowerCase();
	if (!q) return assets;
	return assets.filter((asset) => assetSearchText(asset, visionByAssetId?.get(asset.id)).toLowerCase().includes(q));
}
