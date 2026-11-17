import { emptyWorkspace } from '@/lib/articles/meta';
import type { ArticleRecord } from '@/lib/articles/types';
import { getNativeContentStore } from '@/lib/media/store';
import { catalogueFromDocs, matchCatalogueRecord, type CatalogueRecord, type PayloadArticleDoc } from './payloadCatalogue';

export type SyncResult = {
	created: number;
	updated: number;
	unchanged: number;
	linkedProposals: number;
	records: Array<{ payloadId: string; slug: string; articleId: string; action: 'created' | 'updated' | 'unchanged' }>;
};

function hasHistory(article: ArticleRecord): boolean {
	return Boolean(article.workspace?.revision || (article.body.trim() && !article.body.startsWith('# Metadata proposal')));
}

function shell(ownerUserId: string, brandId: string, record: CatalogueRecord): ArticleRecord {
	const now = new Date().toISOString();
	const id = crypto.randomUUID();
	const workspace = emptyWorkspace({
		externalId: record.externalId,
		contentType: 'guide',
		workingTitle: record.title,
		imageRequirements: 'none',
	});
	workspace.cms.externalId = record.externalId;
	workspace.cms.lastSyncAt = now;
	return {
		id,
		ownerUserId,
		brandId,
		objective: record.title,
		topic: record.title,
		searchIntent: 'informational',
		secondaryTopics: [],
		research: { sources: [{ label: 'Payload', kind: 'supplied', url: record.canonicalUrl }], claims: [], gaps: [], usedExternalResearch: false },
		outline: [],
		sections: [],
		title: record.title,
		slug: record.slug,
		excerpt: record.description,
		body: '',
		seo: {
			title: record.title,
			seoTitle: record.title,
			slug: record.slug,
			excerpt: record.description,
			metaDescription: record.description,
			canonical: record.canonicalUrl,
			primaryKeyword: null,
			secondaryTopics: [],
		},
		author: null,
		categories: [],
		tags: [],
		inlineAssetIds: [],
		mediaPlan: null,
		internalLinkOpportunities: [],
		status: 'published',
		approval: { required: true, approver: 'human', status: 'approved' },
		publication: { destination: 'payload', externalId: record.externalId, url: record.canonicalUrl, publishedAt: record.publishedAt ?? undefined, method: 'external' },
		performanceContentId: id,
		wordCount: 0,
		targetWords: 0,
		review: null,
		versions: [],
		distribution: { disclosure: null, sponsorship: 'none', contentCluster: null, authorProfileId: null },
		createdAt: now,
		updatedAt: now,
		workspace,
		library: {
			archivedAt: null,
			canonicalUrl: record.canonicalUrl,
			stageNote: 'Imported from Payload. The published page was not changed.',
			cms: { ...record, syncedAt: now },
		},
	} as ArticleRecord;
}

function applySnapshot(article: ArticleRecord, record: CatalogueRecord, preserveHistory: boolean, changed: boolean): ArticleRecord {
	const now = new Date().toISOString();
	article.library = {
		archivedAt: article.library?.archivedAt ?? null,
		canonicalUrl: record.canonicalUrl,
		canonicalArticleId: article.library?.canonicalArticleId ?? null,
		stageNote: changed
			? 'Payload changed since the last sync. Local history was kept. Revalidate any open proposal.'
			: article.library?.stageNote ?? 'Payload metadata refreshed. Local history was kept.',
		cms: { ...record, syncedAt: now },
		proposal: article.library?.proposal,
	};
	const workspace = article.workspace;
	if (workspace) {
		workspace.cms.externalId = workspace.cms.externalId || record.externalId;
		workspace.cms.lastSyncAt = now;
	}
	if (!preserveHistory) {
		article.title = record.title;
		article.slug = record.slug;
		article.excerpt = record.description;
		article.seo.title = record.title;
		article.seo.metaDescription = record.description;
		article.seo.canonical = record.canonicalUrl;
		article.publication = { destination: 'payload', externalId: record.externalId, url: record.canonicalUrl, publishedAt: record.publishedAt ?? undefined, method: 'external' };
	}
	article.updatedAt = now;
	return article;
}

export async function syncPayloadCatalogue(ownerUserId: string, brandId: string, docs: PayloadArticleDoc[], origin = 'https://folian.app'): Promise<SyncResult> {
	const store = getNativeContentStore();
	const existing = (await store.listArticles(ownerUserId, brandId)).filter((article) => article.ownerUserId === ownerUserId && article.brandId === brandId);
	const result: SyncResult = { created: 0, updated: 0, unchanged: 0, linkedProposals: 0, records: [] };
	const bySlug = new Map<string, ArticleRecord>();
	for (const record of catalogueFromDocs(docs, origin)) {
		const match = matchCatalogueRecord(record, existing.map((article) => ({
			id: article.id,
			slug: article.slug,
			canonicalUrl: article.library?.canonicalUrl ?? article.publication?.url ?? article.seo?.canonical,
			externalId: article.workspace?.cms.externalId ?? article.workspace?.externalId ?? null,
			hasHistory: hasHistory(article),
			syncedUpdatedAt: article.library?.cms?.updatedAt ?? null,
		})));
		if (match.kind === 'create') {
			const created = await store.saveArticle(shell(ownerUserId, brandId, record));
			existing.push(created);
			bySlug.set(record.slug, created);
			result.created += 1;
			result.records.push({ payloadId: record.payloadId, slug: record.slug, articleId: created.id, action: 'created' });
			continue;
		}
		const current = existing.find((article) => article.id === match.id);
		if (!current) continue;
		bySlug.set(record.slug, current);
		if (!match.changed && current.library?.cms?.payloadId === record.payloadId) {
			result.unchanged += 1;
			result.records.push({ payloadId: record.payloadId, slug: record.slug, articleId: current.id, action: 'unchanged' });
			continue;
		}
		await store.saveArticle(applySnapshot(current, record, match.preserveHistory, match.changed));
		result.updated += 1;
		result.records.push({ payloadId: record.payloadId, slug: record.slug, articleId: current.id, action: 'updated' });
	}
	for (const article of existing) {
		if (!article.body.startsWith('# Metadata proposal')) continue;
		const source = article.body.match(/^Source:\s*(https?:\/\/\S+)/m)?.[1];
		if (!source) continue;
		const slug = source.split('/').filter(Boolean).pop();
		const canonical = slug ? bySlug.get(slug) : undefined;
		if (!canonical || article.library?.canonicalArticleId === canonical.id) continue;
		article.library = {
			archivedAt: article.library?.archivedAt ?? null,
			canonicalUrl: canonical.library?.canonicalUrl ?? source,
			canonicalArticleId: canonical.id,
			stageNote: 'Linked to the Payload article. The published version was not changed.',
			cms: article.library?.cms,
			proposal: article.library?.proposal,
		};
		canonical.library = {
			archivedAt: canonical.library?.archivedAt ?? null,
			canonicalUrl: canonical.library?.canonicalUrl ?? source,
			canonicalArticleId: canonical.library?.canonicalArticleId ?? null,
			stageNote: canonical.library?.stageNote ?? null,
			cms: canonical.library?.cms,
			proposal: {
				status: article.approval.status === 'approved' ? 'approved' : article.approval.status === 'rejected' ? 'rejected' : 'pending',
				proposedTitle: article.body.match(/^Proposed title:\s*(.+)$/m)?.[1]?.trim() ?? '',
				proposedDescription: article.body.match(/^Proposed description:\s*(.+)$/m)?.[1]?.trim() ?? '',
				baseUpdatedAt: canonical.library?.cms?.updatedAt ?? null,
				sourceArticleId: article.id,
			},
		};
		await store.saveArticle(article);
		await store.saveArticle(canonical);
		result.linkedProposals += 1;
	}
	return result;
}

export async function fetchPayloadCatalogue(origin = 'https://folian.app'): Promise<PayloadArticleDoc[]> {
	const response = await fetch(`${origin.replace(/\/$/, '')}/api/articles?limit=100&depth=0`, { cache: 'no-store' });
	if (!response.ok) throw new Error(`Payload catalogue returned ${response.status}.`);
	const body = (await response.json()) as { docs?: PayloadArticleDoc[] };
	return Array.isArray(body.docs) ? body.docs : [];
}
