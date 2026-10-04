import { writeFileSync, readFileSync } from 'node:fs';
import { getSupabaseService } from '@/lib/supabaseService';
import { getIntelligenceStore, setIntelligenceAiForTests } from '@/lib/intelligence/actions';
import { liveIntelligenceAi, runContentIntelligencePipeline, type IntelligenceAi } from '@/lib/intelligence/pipeline';
import type { LlmMessage } from '@/lib/llm';
import { generateArticle } from '@/lib/articles/pipeline';
import type { ArticleRecord } from '@/lib/articles/types';
import { planMedia } from '@/lib/media/planner';
import { generateAssetFromProposal } from '@/lib/media/images';
import { createMemoryNativeContentStore, getNativeContentStore, setNativeContentStoreForTests } from '@/lib/media/store';
import type { ContentAssetRecord, MediaDecision } from '@/lib/media/types';
import { FOLIAN_GROK_RATE_LIMIT } from '@/lib/agent/policy';
import { createMemoryAgentStore, setAgentStoreForTests } from '@/lib/agent/controlStore';

const FOLIAN_ID = '03cba45a-6faf-4b6c-a20b-2c2496318b58';
const REPORT = '/tmp/cce-folian-acceptance.json';

type Saved = {
	userId: string;
	instagramContentId: string;
	instagramAsset: ContentAssetRecord;
	article: ArticleRecord;
	heroAsset: ContentAssetRecord;
};

function publicAsset(asset: ContentAssetRecord) {
	return {
		id: asset.id,
		approvalStatus: asset.approvalStatus,
		url: asset.url,
		width: asset.width,
		height: asset.height,
		mimeType: asset.mimeType,
		aspectRatio: asset.aspectRatio,
		model: asset.generationModel,
		provider: asset.generationProvider,
		estimatedCostUsd: asset.provenance.estimatedCostUsd,
		targetId: asset.provenance.targetId,
	};
}

async function persist() {
	const saved = JSON.parse(readFileSync(REPORT, 'utf8')) as { saved: Saved };
	const db = getSupabaseService();
	const assetRows = [saved.saved.instagramAsset, saved.saved.heroAsset];
	for (const asset of assetRows) {
		const { error } = await db.from('content_assets').upsert({
			id: asset.id,
			owner_user_id: asset.ownerUserId,
			brand_id: asset.brandId ?? null,
			asset_type: asset.assetType,
			source_type: asset.sourceType,
			storage_provider: asset.storageProvider,
			provider_asset_id: asset.providerAssetId ?? null,
			secure_url: asset.url ?? null,
			mime_type: asset.mimeType ?? null,
			width: asset.width ?? null,
			height: asset.height ?? null,
			aspect_ratio: asset.aspectRatio ?? null,
			file_size: asset.fileSize ?? null,
			alt_text: asset.altText ?? null,
			caption: asset.caption ?? null,
			title: asset.title ?? null,
			generation_prompt: asset.generationPrompt ?? null,
			generation_provider: asset.generationProvider ?? null,
			generation_model: asset.generationModel ?? null,
			provenance: asset.provenance,
			rights_notes: asset.rightsNotes ?? null,
			approval_status: asset.approvalStatus,
			created_at: asset.createdAt,
			updated_at: asset.updatedAt,
		});
		if (error) throw new Error(error.message);
	}
	const links = [
		{ assetId: saved.saved.instagramAsset.id, targetType: 'content', targetId: saved.saved.instagramContentId, role: 'REQUIRED_BY_CHANNEL' },
		{ assetId: saved.saved.heroAsset.id, targetType: 'article', targetId: saved.saved.article.id, role: 'SUPPORTING' },
	];
	for (const link of links) {
		const { error } = await db.from('content_asset_links').upsert({
			id: crypto.randomUUID(),
			owner_user_id: saved.saved.userId,
			asset_id: link.assetId,
			target_type: link.targetType,
			target_id: link.targetId,
			role: link.role,
		});
		if (error) throw new Error(error.message);
	}
	const article = saved.saved.article;
	article.featuredAssetId = saved.saved.heroAsset.id;
	const { error } = await db.from('articles').upsert({
		id: article.id,
		owner_user_id: article.ownerUserId,
		brand_id: article.brandId,
		status: article.status,
		title: article.title,
		slug: article.slug,
		document: article,
		created_at: article.createdAt,
		updated_at: article.updatedAt,
	});
	if (error) throw new Error(error.message);
	console.log(JSON.stringify({ persisted: true, instagramAssetId: saved.saved.instagramAsset.id, articleId: article.id, heroAssetId: saved.saved.heroAsset.id }));
}

async function generate() {
	const db = getSupabaseService();
	const { data, error } = await db.from('brand_brains').select('id,user_id,airtable_brand_id').eq('id', FOLIAN_ID).maybeSingle();
	if (error || !data) throw new Error(error?.message || 'Folian brand brain was not found');
	const userId = String(data.user_id);
	const airtableBrandId = String(data.airtable_brand_id);
	const store = getIntelligenceStore();
	const brain = await store.getBrandBrainById(userId, FOLIAN_ID);
	if (!brain) throw new Error('Folian brand brain was not found');
	const strategy = await store.getStrategyForBrand(userId, brain.id);
	const themes = await store.listThemes(userId, brain.id);
	const active = themes.filter((theme) => theme.status === 'active');

	let textCost = 0;
	const models: string[] = [];
	const ai: IntelligenceAi = {
		async completeJson<T>(role: 'FAST' | 'WRITING' | 'REVIEW' | 'STRATEGY', messages: LlmMessage[], feature: string, ownerUserId?: string) {
			const result = await liveIntelligenceAi.completeJson<T>(role, messages, feature, ownerUserId);
			if (typeof result.estimatedCostUsd === 'number') textCost += result.estimatedCostUsd;
			if (result.model) models.push(`${feature}:${result.model}`);
			if (result.model?.toLowerCase().includes('astra')) throw new Error('A deep-strategy model was selected. The run stopped.');
			return result;
		},
	};
	setIntelligenceAiForTests(ai);
	setNativeContentStoreForTests(createMemoryNativeContentStore());
	setAgentStoreForTests(createMemoryAgentStore());

	const instagram = await runContentIntelligencePipeline(store, {
		userId,
		airtableBrandId,
		userIntent: 'Create the next Folian Instagram post.',
		channel: 'instagram',
		contentType: 'founder_post',
		optimizationObjective: 'authority',
	}, ai);
	const mediaPlan = planMedia({
		channel: 'INSTAGRAM_FEED',
		topic: instagram.memory.topic,
		objective: strategy?.objectives[0],
		contentType: 'founder_post',
	});
	const image = await generateAssetFromProposal({
		ownerUserId: userId,
		credentialId: 'folian-acceptance',
		brandId: brain.id,
		targetType: 'content',
		targetId: instagram.memory.id,
		decision: mediaPlan,
		rateLimit: FOLIAN_GROK_RATE_LIMIT,
		brand: brain,
		channel: 'INSTAGRAM_FEED',
		topic: instagram.memory.topic,
		excerpt: instagram.reviewedDraft,
	});
	const instagramAsset = await getNativeContentStore().getAsset(userId, image.asset.id);
	if (!instagramAsset?.url) throw new Error('Instagram asset was not stored');
	const delivery = await fetch(instagramAsset.url);
	if (!delivery.ok) throw new Error(`Cloudinary delivery returned ${delivery.status}`);
	const bytes = Buffer.from(await delivery.arrayBuffer());
	const links = await getNativeContentStore().listLinks(userId, 'content', instagram.memory.id);

	const article = await generateArticle({
		ownerUserId: userId,
		brand: brain,
		strategy,
		themes,
		targetWords: 2000,
		instruction: 'Identify a substantial Folian article from the current strategy. Use only stored brand facts. Name the gaps. Do not pad.',
	});
	const heroDecision = (article.mediaPlan as { hero: MediaDecision }).hero;
	const hero = await generateAssetFromProposal({
		ownerUserId: userId,
		credentialId: 'folian-acceptance',
		brandId: brain.id,
		targetType: 'article',
		targetId: article.id,
		decision: heroDecision,
		rateLimit: FOLIAN_GROK_RATE_LIMIT,
		brand: brain,
		channel: 'BLOG',
		topic: article.topic,
		excerpt: article.excerpt,
	});
	const heroAsset = await getNativeContentStore().getAsset(userId, hero.asset.id);
	if (!heroAsset?.url) throw new Error('Hero asset was not stored');
	article.featuredAssetId = hero.asset.id;
	await getNativeContentStore().saveArticle(article);
	const heroDelivery = await fetch(heroAsset.url);
	if (!heroDelivery.ok) throw new Error(`Hero Cloudinary delivery returned ${heroDelivery.status}`);

	const saved: Saved = { userId, instagramContentId: instagram.memory.id, instagramAsset, article, heroAsset };
	const summary = {
		instagram: {
			topic: instagram.memory.topic,
			caption: instagram.reviewedDraft,
			media: mediaPlan,
			asset: publicAsset(instagramAsset),
			cloudinaryBytes: bytes.length,
			linked: links.some((link) => link.assetId === instagramAsset.id),
			published: false,
			contentId: instagram.memory.id,
		},
		article: {
			topic: article.topic,
			why: active[0] ? `The article pipeline uses the active strategy theme “${article.topic}”. Active themes: ${active.map((theme) => theme.title).join(', ')}.` : 'No active theme was stored, so the strategy objective was used.',
			title: article.title,
			wordCount: article.wordCount,
			targetWords: article.targetWords,
			outline: article.outline,
			research: article.research,
			review: article.review,
			seo: article.seo,
			mediaPlan: article.mediaPlan,
			body: article.body,
			hero: publicAsset(heroAsset),
			status: article.status,
			publication: article.publication,
			published: false,
		},
		models,
		textCostUsd: Math.round(textCost * 1_000_000) / 1_000_000,
		imageCostUsd: Math.round(((Number(instagramAsset.provenance.estimatedCostUsd) || 0) + (Number(heroAsset.provenance.estimatedCostUsd) || 0)) * 1_000_000) / 1_000_000,
		visualGuidanceStored: Boolean(instagramAsset.provenance.visualGuidanceStored),
	};
	writeFileSync(REPORT, JSON.stringify({ summary, saved }));
	console.log(JSON.stringify(summary, null, 2));
}

const mode = process.argv.includes('--persist') ? persist() : generate();
mode.catch((error: unknown) => {
	const message = error instanceof Error ? error.message : 'Acceptance run failed';
	console.error(message);
	process.exit(1);
});
