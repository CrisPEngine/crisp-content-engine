export type PayloadArticleDoc = {
	id: number | string;
	title?: string;
	slug?: string;
	dek?: string;
	seoDescription?: string;
	externalId?: string | null;
	_status?: string;
	publishedAt?: string | null;
	updatedAt?: string | null;
	createdAt?: string | null;
	hero?: { url?: string } | string | null;
	revision?: number | null;
};

export type CatalogueRecord = {
	payloadId: string;
	externalId: string;
	slug: string;
	title: string;
	description: string;
	status: string;
	publishedAt: string | null;
	updatedAt: string | null;
	hero: string | null;
	revision: number | null;
	canonicalUrl: string;
	contentRef: string;
};

export function catalogueFromDocs(docs: PayloadArticleDoc[], origin = 'https://folian.app'): CatalogueRecord[] {
	const base = origin.replace(/\/$/, '');
	return docs.flatMap((doc) => {
		const slug = String(doc.slug ?? '').trim();
		const title = String(doc.title ?? '').trim();
		if (!slug || !title) return [];
		const hero = typeof doc.hero === 'string' ? doc.hero : doc.hero?.url ?? null;
		return [{
			payloadId: String(doc.id),
			externalId: String(doc.externalId ?? `payload:${doc.id}`),
			slug,
			title,
			description: String(doc.seoDescription ?? doc.dek ?? ''),
			status: String(doc._status ?? 'published'),
			publishedAt: doc.publishedAt ?? doc.createdAt ?? null,
			updatedAt: doc.updatedAt ?? null,
			hero,
			revision: typeof doc.revision === 'number' ? doc.revision : null,
			canonicalUrl: `${base}/articles/${slug}`,
			contentRef: `payload:${doc.id}`,
		}];
	});
}

export type SyncMatch = { kind: 'create' } | { kind: 'update'; id: string; preserveHistory: boolean; changed: boolean };

export function matchCatalogueRecord(record: CatalogueRecord, existing: Array<{ id: string; slug?: string | null; canonicalUrl?: string | null; externalId?: string | null; hasHistory: boolean; syncedUpdatedAt?: string | null }>): SyncMatch {
	const found = existing.find((item) =>
		item.externalId === record.externalId
		|| item.externalId === record.contentRef
		|| item.slug === record.slug
		|| item.canonicalUrl === record.canonicalUrl,
	);
	if (!found) return { kind: 'create' };
	return {
		kind: 'update',
		id: found.id,
		preserveHistory: found.hasHistory,
		changed: Boolean(record.updatedAt && found.syncedUpdatedAt && record.updatedAt !== found.syncedUpdatedAt),
	};
}

export function metadataApplyDecision(input: {
	approved: boolean;
	baseUpdatedAt: string | null;
	currentUpdatedAt: string | null;
	live: boolean;
}): { apply: false; reason: string } | { apply: true } {
	if (!input.approved) return { apply: false, reason: 'The proposal is not approved. Payload was not changed.' };
	if (input.baseUpdatedAt && input.currentUpdatedAt && input.baseUpdatedAt !== input.currentUpdatedAt) {
		return { apply: false, reason: 'Payload changed since this proposal was prepared. Revalidate it before applying.' };
	}
	if (!input.live) return { apply: false, reason: 'Live publishing is disabled. The prepared update was not sent to Payload.' };
	return { apply: true };
}
