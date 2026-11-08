import type { ArticlePublishRequest, ArticlePublishResult, ArticlePublisher } from './types';
import type { ArticleRecord } from '@/lib/articles/types';
import { mapArticleRecordToFolianDraft } from './folianMap';
import { loadDestinationTaxonomy } from './destinationRegistry';
import { fetchAllowedImage, folianBaseUrl, folianHeaders, uploadImageToFolian } from './folianClient';

async function readJson(response: Response) {
	return (await response.json().catch(() => ({}))) as Record<string, unknown>;
}

export async function fetchFolianDraftRevision(externalId: string): Promise<number | null> {
	const url = folianBaseUrl();
	const headers = folianHeaders(true);
	if (!url || !headers) return null;
	const response = await fetch(`${url}/api/content/v1/drafts/${encodeURIComponent(externalId)}`, {
		headers,
		cache: 'no-store',
	});
	if (response.status === 404) return null;
	const payload = await readJson(response);
	if (!response.ok) {
		throw new Error(String(payload.message ?? payload.code ?? `Folian draft lookup failed (${response.status})`));
	}
	const draft = (payload.draft ?? payload) as { revision?: unknown };
	if (typeof draft.revision !== 'number') {
		throw new Error('Folian draft has no revision, so it cannot be updated safely.');
	}
	return draft.revision;
}

export async function submitFolianDraftFromRecord(
	article: ArticleRecord,
	options: {
		externalId: string;
		baseRevision?: number;
		mode?: 'update' | 'proposal';
		heroImageUrl?: string;
		heroAlt?: string;
		ogImageUrl?: string;
		ogAlt?: string;
	},
): Promise<ArticlePublishResult> {
	const url = folianBaseUrl();
	const headers = folianHeaders(true);
	if (!url || !headers) {
		return { ok: false, destination: 'folian', error: 'FOLIAN_CONTENT_API_URL or FOLIAN_CONTENT_API_KEY is not configured' };
	}

	let heroMediaId: string | undefined;
	if (options.heroImageUrl) {
		const image = await fetchAllowedImage(options.heroImageUrl);
		if (!image.ok) return { ok: false, destination: 'folian', error: image.error };
		const uploaded = await uploadImageToFolian({
			bytes: image.bytes,
			filename: 'hero.webp',
			mimeType: image.mimeType,
			alt: options.heroAlt || article.title,
			credit: 'Crisp Content Engine',
			license: 'Generated for Folian editorial use',
		});
		if (!uploaded.ok) return { ok: false, destination: 'folian', error: uploaded.error };
		heroMediaId = uploaded.mediaId;
	}

	let ogMediaId: string | undefined;
	if (options.ogImageUrl && options.ogImageUrl !== options.heroImageUrl) {
		const image = await fetchAllowedImage(options.ogImageUrl);
		if (!image.ok) return { ok: false, destination: 'folian', error: image.error };
		const uploaded = await uploadImageToFolian({
			bytes: image.bytes,
			filename: 'og.webp',
			mimeType: image.mimeType,
			alt: options.ogAlt || article.title,
			credit: 'Crisp Content Engine',
			license: 'Generated for Folian editorial use',
		});
		if (!uploaded.ok) return { ok: false, destination: 'folian', error: uploaded.error };
		ogMediaId = uploaded.mediaId;
	}

	const taxonomy = (await loadDestinationTaxonomy('folian')) ?? undefined;
	const body = mapArticleRecordToFolianDraft(article, { ...options, heroMediaId, ogMediaId, taxonomy });
	const response = await fetch(`${url}/api/content/v1/drafts/${encodeURIComponent(options.externalId)}`, {
		method: 'PUT',
		headers,
		body: JSON.stringify(body),
	});
	const payload = await readJson(response);
	if (!response.ok) {
		return {
			ok: false,
			destination: 'folian',
			error: String(payload.message ?? payload.code ?? `Folian API ${response.status}`),
		};
	}
	return {
		ok: true,
		destination: 'folian',
		externalId: options.externalId,
		url: typeof payload.adminUrl === 'string' ? payload.adminUrl : `${url}/admin/collections/articles`,
		previewUrl: typeof payload.previewUrl === 'string' ? payload.previewUrl : typeof payload.url === 'string' ? payload.url : undefined,
		revision: typeof payload.revision === 'number' ? payload.revision : undefined,
	};
}

export const folianPayloadPublisher: ArticlePublisher = {
	id: 'folian',

	async publish(request: ArticlePublishRequest): Promise<ArticlePublishResult> {
		const externalId =
			(typeof request.document.metadata?.externalId === 'string' && request.document.metadata.externalId) ||
			request.idempotencyKey ||
			request.memoryId;
		if (!externalId) {
			return { ok: false, destination: 'folian', error: 'externalId is required in document.metadata.externalId' };
		}

		const article = request.document.metadata?.articleRecord as ArticleRecord | undefined;
		if (!article) {
			return {
				ok: false,
				destination: 'folian',
				error: 'document.metadata.articleRecord is required for the Folian Payload adapter',
			};
		}

		return submitFolianDraftFromRecord(article, {
			externalId,
			baseRevision:
				typeof request.document.metadata?.baseRevision === 'number'
					? request.document.metadata.baseRevision
					: undefined,
			mode: request.document.metadata?.mode === 'proposal' ? 'proposal' : 'update',
			heroImageUrl: typeof request.document.imageUrl === 'string' ? request.document.imageUrl : undefined,
			heroAlt: article.title,
		});
	},
};
