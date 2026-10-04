import { getIntelligenceStore } from '@/lib/intelligence/actions';
import { AgentError } from './errors';
import type { AgentContext } from './handlers';
import { generateArticle, reviseArticle } from '@/lib/articles/pipeline';
import { mediaSpecFor } from '@/lib/media/channelMedia';
import { generateAssetFromProposal, imageProviderStatus, publicAsset } from '@/lib/media/images';
import { planMedia } from '@/lib/media/planner';
import { getNativeContentStore } from '@/lib/media/store';
import type { ArticleRecord } from '@/lib/articles/types';
import type { MediaDecision } from '@/lib/media/types';

function text(input: Record<string, unknown>, key: string): string | undefined {
	const value = input[key];
	return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

async function brand(ctx: AgentContext, brandId?: string) {
	const allowed = ctx.credential.allowedBrandIds;
	const id = brandId ?? (allowed.length === 1 ? allowed[0] : undefined);
	if (!id || !allowed.includes(id)) throw new AgentError('brand_not_accessible', 'This agent cannot access that brand.', 403);
	const brain = await getIntelligenceStore().getBrandBrainById(ctx.credential.ownerUserId, id);
	if (!brain) throw new AgentError('brand_not_accessible', 'This agent cannot access that brand.', 403);
	return brain;
}

function publicArticle(article: ArticleRecord) {
	return {
		id: article.id,
		brandId: article.brandId,
		title: article.title,
		slug: article.slug,
		topic: article.topic,
		objective: article.objective,
		audience: article.audience,
		searchIntent: article.searchIntent,
		status: article.status,
		wordCount: article.wordCount,
		targetWords: article.targetWords,
		excerpt: article.excerpt,
		body: article.body,
		sections: article.sections.map((section) => ({ id: section.id, heading: section.heading, purpose: section.purpose, body: section.body })),
		outline: article.outline,
		research: article.research,
		seo: article.seo,
		mediaPlan: article.mediaPlan,
		featuredAssetId: article.featuredAssetId ?? null,
		approval: article.approval,
		publication: article.publication,
		performanceContentId: article.performanceContentId,
		review: article.review,
		versions: article.versions.map((version) => ({ createdAt: version.createdAt, instruction: version.instruction ?? null })),
		distribution: article.distribution,
	};
}

async function mediaPlanFor(ctx: AgentContext, input: Record<string, unknown>): Promise<{ brandId: string; decision: MediaDecision }> {
	const brain = await brand(ctx, text(input, 'brandId'));
	const channel = text(input, 'channel') ?? 'LINKEDIN_PERSONAL';
	const assets = (await getNativeContentStore().listAssets(ctx.credential.ownerUserId, brain.id)).map(publicAsset);
	const decision = planMedia({
		channel,
		topic: text(input, 'topic') ?? text(input, 'instruction'),
		objective: text(input, 'objective'),
		contentType: text(input, 'contentType'),
		assets,
	});
	return { brandId: brain.id, decision };
}

export async function dispatchContentExtensions(name: string, ctx: AgentContext, input: Record<string, unknown>): Promise<unknown | undefined> {
	if (!name.startsWith('cce_') || !['cce_get_assets', 'cce_get_asset', 'cce_find_assets', 'cce_detach_asset', 'cce_propose_media', 'cce_get_media_plan', 'cce_generate_image', 'cce_create_article_brief', 'cce_generate_article', 'cce_get_article', 'cce_get_article_status', 'cce_request_article_revision', 'cce_submit_article_for_approval', 'cce_get_article_media_plan', 'cce_publish_article'].includes(name)) {
		return undefined;
	}
	const store = getNativeContentStore();
	switch (name) {
		case 'cce_get_media_plan':
		case 'cce_propose_media': {
			const planned = await mediaPlanFor(ctx, input);
			return { ...planned, channelMedia: mediaSpecFor(text(input, 'channel')), provider: imageProviderStatus(), generated: false };
		}
		case 'cce_get_assets': {
			const brain = await brand(ctx, text(input, 'brandId'));
			const assets = await store.listAssets(ctx.credential.ownerUserId, brain.id);
			return { assets: assets.map(publicAsset) };
		}
		case 'cce_get_asset': {
			const assetId = text(input, 'assetId');
			if (!assetId) throw new AgentError('invalid_input', 'assetId is required.', 400);
			const asset = await store.getAsset(ctx.credential.ownerUserId, assetId);
			if (!asset || (asset.brandId && !ctx.credential.allowedBrandIds.includes(asset.brandId))) {
				throw new AgentError('brand_not_accessible', 'This agent cannot access that asset.', 403);
			}
			return { asset: publicAsset(asset) };
		}
		case 'cce_find_assets': {
			const brain = await brand(ctx, text(input, 'brandId'));
			const query = (text(input, 'query') ?? '').toLowerCase();
			const assets = (await store.listAssets(ctx.credential.ownerUserId, brain.id))
				.map(publicAsset)
				.filter((asset) => !query || `${asset.title ?? ''} ${asset.altText ?? ''} ${asset.caption ?? ''}`.toLowerCase().includes(query));
			return { assets };
		}
		case 'cce_detach_asset': {
			const assetId = text(input, 'assetId');
			const targetId = text(input, 'targetId') ?? text(input, 'contentId') ?? text(input, 'articleId') ?? text(input, 'briefId');
			const targetType = text(input, 'targetType') ?? (text(input, 'articleId') ? 'article' : text(input, 'briefId') ? 'brief' : 'content');
			if (!assetId || !targetId) throw new AgentError('invalid_input', 'assetId and a target are required.', 400);
			await store.removeLink(ctx.credential.ownerUserId, assetId, targetType, targetId);
			return { assetId, targetId, detached: true };
		}
		case 'cce_generate_image': {
			const articleId = text(input, 'articleId');
			const contentId = text(input, 'contentId');
			const targetId = articleId ?? contentId ?? text(input, 'briefId');
			if (!targetId) throw new AgentError('invalid_input', 'contentId or articleId is required.', 400);
			let channel = text(input, 'channel');
			let topic = text(input, 'topic');
			if (articleId) {
				const article = await store.getArticle(ctx.credential.ownerUserId, articleId);
				if (!article || !ctx.credential.allowedBrandIds.includes(article.brandId)) {
					throw new AgentError('brand_not_accessible', 'This agent cannot access that article.', 403);
				}
				channel = channel ?? 'BLOG';
				topic = topic ?? article.topic;
			} else if (contentId) {
				const memory = await getIntelligenceStore().getMemory(ctx.credential.ownerUserId, contentId);
				if (!memory || !ctx.credential.allowedBrandIds.includes(memory.brandBrainId)) {
					throw new AgentError('brand_not_accessible', 'This agent cannot access that content.', 403);
				}
				channel = channel ?? memory.channel;
				topic = topic ?? memory.topic ?? undefined;
			}
			if (!channel) throw new AgentError('invalid_input', 'A channel or an existing content item is required.', 400);
			const planned = await mediaPlanFor(ctx, { ...input, channel, topic, contentType: articleId ? 'article' : text(input, 'contentType') });
			const brain = await brand(ctx, planned.brandId);
			let excerpt: string | undefined;
			if (articleId) {
				const article = await store.getArticle(ctx.credential.ownerUserId, articleId);
				excerpt = article?.excerpt;
			} else if (contentId) {
				const memory = await getIntelligenceStore().getMemory(ctx.credential.ownerUserId, contentId);
				excerpt = memory?.body?.slice(0, 400);
			}
			const generated = await generateAssetFromProposal({
				ownerUserId: ctx.credential.ownerUserId,
				credentialId: ctx.credential.id,
				brandId: planned.brandId,
				targetType: articleId ? 'article' : contentId ? 'content' : 'brief',
				targetId,
				decision: planned.decision,
				rateLimit: ctx.credential.rateLimit,
				brand: brain,
				channel,
				topic,
				excerpt,
			});
			if (articleId) {
				const article = await store.getArticle(ctx.credential.ownerUserId, articleId);
				if (article && article.brandId === planned.brandId && !article.featuredAssetId) {
					article.featuredAssetId = generated.asset.id;
					article.updatedAt = new Date().toISOString();
					await store.saveArticle(article);
				}
			}
			return { ...generated, published: false, approvalStatus: generated.asset.approvalStatus };
		}
		case 'cce_create_article_brief': {
			const brain = await brand(ctx, text(input, 'brandId'));
			const strategy = await getIntelligenceStore().getStrategyForBrand(ctx.credential.ownerUserId, brain.id);
			const themes = await getIntelligenceStore().listThemes(ctx.credential.ownerUserId, brain.id);
			const theme = themes.find((item) => item.status === 'active');
			const topic = text(input, 'topic') ?? theme?.title ?? strategy?.objectives[0] ?? brain.identity.name;
			const decision = planMedia({ channel: 'BLOG', topic, objective: text(input, 'objective') ?? strategy?.objectives[0], contentType: 'article' });
			return {
				brandId: brain.id,
				topic,
				objective: text(input, 'objective') ?? strategy?.objectives[0] ?? null,
				audience: strategy?.audiences[0]?.name ?? null,
				searchIntent: 'informational',
				primaryKeyword: theme?.keywords[0] ?? null,
				researchRequired: ['Stored Brand Brain facts', 'Named gaps where proof is missing'],
				mediaPlan: decision,
				status: 'brief',
			};
		}
		case 'cce_generate_article': {
			const brain = await brand(ctx, text(input, 'brandId'));
			const strategy = await getIntelligenceStore().getStrategyForBrand(ctx.credential.ownerUserId, brain.id);
			const themes = await getIntelligenceStore().listThemes(ctx.credential.ownerUserId, brain.id);
			const { isNativeIntelligenceEnabledForBrand } = await import('@/lib/featureFlags');
			if (!isNativeIntelligenceEnabledForBrand(brain.id)) {
				throw new AgentError('native_intelligence_brand_not_enabled', 'Native intelligence is not enabled for this brand.', 403);
			}
			const article = await generateArticle({
				ownerUserId: ctx.credential.ownerUserId,
				brand: brain,
				strategy,
				themes,
				objective: text(input, 'objective'),
				topic: text(input, 'topic'),
				targetWords: typeof input.targetWords === 'number' ? input.targetWords : undefined,
				instruction: text(input, 'instruction'),
			});
			return { article: publicArticle(article), published: false };
		}
		case 'cce_get_article':
		case 'cce_get_article_status':
		case 'cce_get_article_media_plan': {
			const articleId = text(input, 'articleId');
			if (!articleId) throw new AgentError('invalid_input', 'articleId is required.', 400);
			const article = await store.getArticle(ctx.credential.ownerUserId, articleId);
			if (!article || !ctx.credential.allowedBrandIds.includes(article.brandId)) {
				throw new AgentError('brand_not_accessible', 'This agent cannot access that article.', 403);
			}
			if (name === 'cce_get_article_status') return { id: article.id, status: article.status, approval: article.approval, publication: article.publication, wordCount: article.wordCount };
			if (name === 'cce_get_article_media_plan') return { id: article.id, mediaPlan: article.mediaPlan, featuredAssetId: article.featuredAssetId ?? null };
			return { article: publicArticle(article) };
		}
		case 'cce_request_article_revision': {
			const articleId = text(input, 'articleId');
			const instruction = text(input, 'instruction');
			if (!articleId || !instruction) throw new AgentError('invalid_input', 'articleId and instruction are required.', 400);
			const article = await store.getArticle(ctx.credential.ownerUserId, articleId);
			if (!article || !ctx.credential.allowedBrandIds.includes(article.brandId)) {
				throw new AgentError('brand_not_accessible', 'This agent cannot access that article.', 403);
			}
			const brain = await brand(ctx, article.brandId);
			const updated = await reviseArticle({ ownerUserId: ctx.credential.ownerUserId, article, brand: brain, instruction, sectionId: text(input, 'sectionId') });
			return { article: publicArticle(updated), published: false };
		}
		case 'cce_submit_article_for_approval': {
			const articleId = text(input, 'articleId');
			if (!articleId) throw new AgentError('invalid_input', 'articleId is required.', 400);
			const article = await store.getArticle(ctx.credential.ownerUserId, articleId);
			if (!article || !ctx.credential.allowedBrandIds.includes(article.brandId)) {
				throw new AgentError('brand_not_accessible', 'This agent cannot access that article.', 403);
			}
			article.status = 'review';
			article.approval = { required: true, approver: 'human', status: 'pending' };
			article.updatedAt = new Date().toISOString();
			await store.saveArticle(article);
			return { articleId, status: 'awaiting_approval', approver: 'human', published: false };
		}
		case 'cce_publish_article':
			throw new AgentError('approval_required', 'Article publishing requires a human approval and a connected destination. This call did not publish.', 403, {
				status: 'approval_required',
				executed: false,
				consequence: 3,
			});
		default:
			return undefined;
	}
}
