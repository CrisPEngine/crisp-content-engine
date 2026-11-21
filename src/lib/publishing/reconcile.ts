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

export type RemoteLifecycle = 'published' | 'draft' | 'scheduled' | 'unpublished' | 'deleted' | 'unknown';

export type PublicationReconciliation = {
	changed: boolean;
	flag: string | null;
	remoteStatus: string | null;
	revision: number | null;
	publicationState: string | null;
	canonicalUrl: string | null;
	publishedAt: string | null;
	lifecycle: RemoteLifecycle;
	localChangesPending: boolean;
	remoteChanged: boolean;
};

export function classifyRemoteLifecycle(remote: RemotePublication | null, httpStatus = 200): RemoteLifecycle {
	if (httpStatus === 404) return 'deleted';
	const status = typeof remote?.status === 'string' ? remote.status : '';
	if (remote?.live === true || status === 'published') return 'published';
	if (status === 'scheduled') return 'scheduled';
	if (status === 'unpublished') return 'unpublished';
	if (status === 'draft') return 'draft';
	return remote ? 'unknown' : 'unknown';
}

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
	const httpStatus = response.status === 404 ? 404 : response.status;
	const result = reconcilePublicationState(local, httpStatus >= 200 && httpStatus < 300 ? body : null, httpStatus);
	const localRevision = workspace.revision?.number ?? null;
	const localChangesPending = Boolean(result.lifecycle === 'published' && workspace.revision?.id && workspace.cms.submittedRevisionId && workspace.revision.id !== workspace.cms.submittedRevisionId);
	workspace.cms.sync = {
		state: result.lifecycle,
		remoteRevision: result.revision,
		localRevision,
		localChangesPending,
		remoteChanged: result.remoteChanged,
		checkedAt: new Date().toISOString(),
		flag: result.flag,
	};
	if (!result.changed && !localChangesPending) return result;
	workspace.cms.remoteStatus = result.remoteStatus ?? workspace.cms.remoteStatus;
	if (typeof result.revision === 'number') workspace.cms.revision = result.revision;
	workspace.cms.lastSyncAt = new Date().toISOString();
	article.workspace = workspace;
	if (result.lifecycle === 'published' && result.canonicalUrl) {
		article.publication = { destination: 'payload', externalId, url: result.canonicalUrl, publishedAt: result.publishedAt ?? undefined, method: 'external' };
	}
	if (result.lifecycle !== 'published') {
		article.workspace = workspace;
		article.updatedAt = new Date().toISOString();
		await store.saveArticle(article);
		return { ...result, localChangesPending };
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
	return { ...result, localChangesPending };
}

export function reconcilePublicationState(local: LocalPublication, remote: RemotePublication | null, httpStatus = 200): PublicationReconciliation {
	const lifecycle = classifyRemoteLifecycle(remote, httpStatus);
	const revision = typeof remote?.revision === 'number' ? remote.revision : local.revision;
	const canonicalUrl = typeof remote?.canonicalUrl === 'string' ? remote.canonicalUrl : local.canonicalUrl;
	const publishedAt = typeof remote?.publishedAt === 'string' ? remote.publishedAt : null;
	const remoteChanged = typeof remote?.revision === 'number' && local.revision !== null && remote.revision !== local.revision;
	if (lifecycle === 'deleted') {
		return { changed: local.remoteStatus !== 'deleted', flag: 'Payload no longer has this entry. The local draft was kept.', remoteStatus: 'deleted', revision: local.revision, publicationState: local.publicationState, canonicalUrl: local.canonicalUrl, publishedAt: null, lifecycle, localChangesPending: false, remoteChanged: false };
	}
	if (lifecycle !== 'published') {
		const remoteStatus = lifecycle === 'unknown' ? local.remoteStatus : lifecycle;
		const changed = remoteStatus !== local.remoteStatus || remoteChanged;
		return { changed, flag: remoteChanged ? `Payload revision is ${revision}. The stored remote revision was ${local.revision}. The live page was not changed.` : null, remoteStatus, revision, publicationState: local.publicationState, canonicalUrl: local.canonicalUrl, publishedAt: null, lifecycle, localChangesPending: false, remoteChanged };
	}
	const aligned = local.publicationState === 'verified_live' && local.remoteStatus === 'published' && local.revision === revision && local.canonicalUrl === canonicalUrl;
	const unexpected = local.approval !== 'approved' && local.publicationState !== 'verified_live' && local.publicationState !== 'published';
	return {
		changed: !aligned,
		flag: unexpected ? 'Payload reports this article live, and CCE has no approval for that publication. Review the external change. Approval and the publish time were not invented.' : remoteChanged ? `Payload revision changed to ${revision}. The local draft was not overwritten.` : null,
		remoteStatus: 'published',
		revision,
		publicationState: 'verified_live',
		canonicalUrl,
		publishedAt,
		lifecycle,
		localChangesPending: false,
		remoteChanged,
	};
}
