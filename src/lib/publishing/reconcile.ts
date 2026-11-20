export type RemotePublication = {
	status?: unknown;
	live?: unknown;
	revision?: unknown;
	canonicalUrl?: unknown;
	publishedAt?: unknown;
};

export type LocalPublication = {
	approval: string;
	remoteStatus: string | null;
	revision: number | null;
	publicationState: string | null;
	canonicalUrl: string | null;
};

export type PublicationReconciliation = {
	changed: boolean;
	flag: string | null;
	remoteStatus: string | null;
	revision: number | null;
	publicationState: string | null;
	canonicalUrl: string | null;
	publishedAt: string | null;
};

export async function rememberRemotePublication(userId: string, articleId: string): Promise<PublicationReconciliation | null> {
	const { getNativeContentStore } = await import('@/lib/media/store');
	const { ensureWorkspace } = await import('@/lib/articles/meta');
	const { resolveConnection } = await import('@/lib/destinations/service');
	const store = getNativeContentStore();
	const article = await store.getArticle(userId, articleId);
	if (!article) return null;
	const workspace = ensureWorkspace(article);
	const externalId = workspace.cms.externalId;
	if (!workspace.destinationId || !externalId) return null;
	const resolved = await resolveConnection(userId, article.brandId, workspace.destinationId);
	if (!resolved.adapter.readPublication) return null;
	const response = await resolved.adapter.readPublication(resolved.connection, externalId);
	const body = response.body.publication && typeof response.body.publication === 'object' ? response.body.publication as RemotePublication : response.body as RemotePublication;
	const local = {
		approval: article.approval.status,
		remoteStatus: workspace.cms.remoteStatus ?? null,
		revision: workspace.cms.revision ?? null,
		publicationState: article.library?.publication?.state ?? null,
		canonicalUrl: article.library?.canonicalUrl ?? article.library?.publication?.canonicalUrl ?? null,
	};
	const result = reconcilePublicationState(local, response.status >= 200 && response.status < 300 ? body : null);
	if (!result.changed) return result;
	workspace.cms.remoteStatus = result.remoteStatus;
	workspace.cms.revision = result.revision;
	workspace.cms.lastSyncAt = new Date().toISOString();
	article.workspace = workspace;
	if (result.canonicalUrl) {
		article.publication = { destination: 'payload', externalId, url: result.canonicalUrl, publishedAt: result.publishedAt ?? undefined, method: 'external' };
	}
	article.library = {
		archivedAt: article.library?.archivedAt ?? null,
		canonicalUrl: result.canonicalUrl,
		canonicalArticleId: article.library?.canonicalArticleId ?? null,
		stageNote: result.flag ?? article.library?.stageNote ?? null,
		cms: article.library?.cms,
		proposal: article.library?.proposal,
		publication: {
			state: 'verified_live',
			externalId,
			revision: result.revision,
			idempotencyKey: article.library?.publication?.idempotencyKey ?? null,
			canonicalUrl: result.canonicalUrl,
			verifiedAt: new Date().toISOString(),
			error: null,
			updatedAt: new Date().toISOString(),
			scheduledFor: null,
			destinationId: workspace.destinationId,
			approvedRevisionId: article.approval.status === 'approved' ? workspace.approvedRevisionId : null,
			attempts: article.library?.publication?.attempts ?? 0,
		},
	};
	article.updatedAt = new Date().toISOString();
	await store.saveArticle(article);
	return result;
}

export function reconcilePublicationState(local: LocalPublication, remote: RemotePublication | null): PublicationReconciliation {
	const live = remote?.live === true || remote?.status === 'published';
	const revision = typeof remote?.revision === 'number' ? remote.revision : local.revision;
	const canonicalUrl = typeof remote?.canonicalUrl === 'string' ? remote.canonicalUrl : local.canonicalUrl;
	const publishedAt = typeof remote?.publishedAt === 'string' ? remote.publishedAt : null;
	if (!live) {
		return { changed: false, flag: null, remoteStatus: local.remoteStatus, revision: local.revision, publicationState: local.publicationState, canonicalUrl: local.canonicalUrl, publishedAt: null };
	}
	const aligned = local.publicationState === 'verified_live' && local.remoteStatus === 'published' && local.revision === revision && local.canonicalUrl === canonicalUrl;
	const unexpected = local.approval !== 'approved' && local.publicationState !== 'verified_live' && local.publicationState !== 'published';
	return {
		changed: !aligned,
		flag: unexpected ? 'Payload reports this article live, and CCE has no approval for that publication. Review the external change. Approval and the publish time were not invented.' : null,
		remoteStatus: 'published',
		revision,
		publicationState: 'verified_live',
		canonicalUrl,
		publishedAt,
	};
}
