import { imagesRequired, openCriticalFindings, ensureWorkspace } from '@/lib/articles/meta';
import type { ArticleRecord } from '@/lib/articles/types';
import { resolveConnection } from '@/lib/destinations/service';
import { getNativeContentStore } from '@/lib/media/store';
import { usefulnessBlockers, runGuardedPublish, type PublicationPhase } from './payloadPublish';
import { websitePublishingEnabled } from './websiteDestinations';

export async function guardedArticlePublish(userId: string, articleId: string, explicit: boolean) {
	const store = getNativeContentStore();
	const article = await store.getArticle(userId, articleId);
	if (!article || article.ownerUserId !== userId) return { sent: false, phase: 'failed', message: 'Article not found.', retryPublication: false as const };
	const workspace = ensureWorkspace(article);
	const findings = workspace.editorialDesk?.critique?.findings ?? [];
	const externalId = workspace.cms.externalId ?? article.library?.cms?.externalId ?? article.library?.publication?.externalId ?? null;
	const expectedRevision = workspace.cms.revision ?? article.library?.cms?.revision ?? article.library?.publication?.revision ?? null;
	let client: Parameters<typeof runGuardedPublish>[0]['client'];
	if (websitePublishingEnabled() && workspace.destinationId && externalId) {
		const resolved = await resolveConnection(userId, article.brandId, workspace.destinationId);
		const key = article.library?.publication?.idempotencyKey ?? `cce-publish:${article.id}:${workspace.revision?.id ?? 'draft'}`;
		client = {
			read: () => resolved.adapter.readPublication?.(resolved.connection, externalId) ?? Promise.resolve({ status: 404, body: { code: 'not_found' } }),
			publish: (revision) => resolved.adapter.publishArticle?.(resolved.connection, {
				externalId,
				baseRevision: revision,
				baseUpdatedAt: article.library?.cms?.updatedAt ?? null,
				idempotencyKey: key,
			}) ?? Promise.resolve({ status: 403, body: { code: 'publish_key_missing', published: false } }),
			page: async (url) => {
				const response = await fetch(url);
				if (!response.ok) throw new Error(`The public page returned ${response.status}.`);
				return response.text();
			},
		};
	}
	const result = await runGuardedPublish({
		approved: article.approval.status === 'approved' && (article.status === 'approved' || article.status === 'published'),
		researchApproved: Boolean(workspace.research?.approved),
		criticalOpen: openCriticalFindings(workspace).length,
		materialOpen: usefulnessBlockers(findings),
		seoReady: Boolean(article.seo.seoTitle?.trim() && article.seo.metaDescription?.trim()),
		heroRequired: imagesRequired(workspace.imageRequirements),
		heroReady: Boolean(workspace.media.heroUrl && workspace.media.deliveryVerified),
		editorialChecked: workspace.editorialDesk?.critique != null,
		heroUrl: workspace.media.heroUrl,
		bodyExcerpt: article.body.startsWith('# Metadata proposal') ? null : article.body.replace(/[#>*_[\]()`]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80),
		externalId,
		expectedRevision,
		explicit,
		liveEnabled: websitePublishingEnabled(),
		autoPublish: false,
		title: article.seo.seoTitle || article.title,
		description: article.seo.metaDescription || article.excerpt,
		client,
	});
	rememberPublication(article, result.phase, result.message, result.sent);
	await store.saveArticle(article);
	return result;
}

function rememberPublication(article: ArticleRecord, phase: PublicationPhase, message: string, sent: boolean) {
	const workspace = ensureWorkspace(article);
	article.library = {
		archivedAt: article.library?.archivedAt ?? null,
		canonicalUrl: article.library?.canonicalUrl ?? null,
		canonicalArticleId: article.library?.canonicalArticleId ?? null,
		stageNote: article.library?.stageNote ?? null,
		cms: article.library?.cms,
		proposal: article.library?.proposal,
		publication: {
			state: phase,
			externalId: workspace.cms.externalId,
			revision: workspace.cms.revision,
			idempotencyKey: article.library?.publication?.idempotencyKey ?? `cce-publish:${article.id}:${workspace.revision?.id ?? 'draft'}`,
			canonicalUrl: article.library?.canonicalUrl ?? null,
			verifiedAt: phase === 'verified_live' ? new Date().toISOString() : article.library?.publication?.verifiedAt ?? null,
			error: phase === 'failed' ? message : null,
			updatedAt: new Date().toISOString(),
			scheduledFor: article.library?.publication?.scheduledFor ?? workspace.schedule.publishAt,
			destinationId: workspace.destinationId,
			approvedRevisionId: workspace.approvedRevisionId,
			attempts: (article.library?.publication?.attempts ?? 0) + (sent ? 1 : 0),
		},
	};
}
