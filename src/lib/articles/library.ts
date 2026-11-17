import type { ArticleRecord } from './types';

export type ContentStage = 'idea' | 'research' | 'draft' | 'review' | 'approved' | 'scheduled' | 'published' | 'optimisation' | 'archived';

export type LibraryDecision = { allowed: true } | { allowed: false; reason: string };

export function contentStage(article: Pick<ArticleRecord, 'status' | 'body' | 'publication' | 'library' | 'workspace'>): ContentStage {
	if (article.library?.archivedAt) return 'archived';
	if (article.body.startsWith('# Metadata proposal')) return 'optimisation';
	if (article.status === 'published' || article.publication?.url) return 'published';
	if (article.workspace?.schedule.status === 'scheduled' || article.workspace?.schedule.status === 'due') return 'scheduled';
	if (article.status === 'approved') return 'approved';
	if (article.status === 'review') return 'review';
	if (article.workspace?.research?.status === 'approved' && !article.body.trim()) return 'research';
	if (article.status === 'brief' && !article.body.trim()) return 'idea';
	return 'draft';
}

export function canDeleteDraft(article: ArticleRecord): LibraryDecision {
	if (article.library?.archivedAt) return { allowed: false, reason: 'Restore the article before deleting it.' };
	if (article.status === 'published' || article.publication?.url) return { allowed: false, reason: 'A published article cannot be deleted from the draft action.' };
	if (article.workspace?.cms.lastSyncAt) return { allowed: false, reason: 'This draft is linked to a CMS record. Remove that link before deleting it.' };
	return { allowed: true };
}

export function canArchive(article: ArticleRecord): LibraryDecision {
	if (article.library?.archivedAt) return { allowed: false, reason: 'This article is already archived.' };
	return { allowed: true };
}

export function canRestore(article: ArticleRecord): LibraryDecision {
	if (!article.library?.archivedAt) return { allowed: false, reason: 'This article is not archived.' };
	return { allowed: true };
}

export function publicRemovalReport(article: ArticleRecord): { blocked: boolean; cmsId: string | null; publicUrl: string | null; warnings: string[] } {
	const warnings = [];
	if (article.publication?.url) warnings.push(`The public URL ${article.publication.url} would disappear for readers and Search Console.`);
	if (article.workspace?.cms.externalId || article.workspace?.cms.lastSyncAt) warnings.push('A CMS record exists. CCE will not remove it.');
	if ((article.internalLinkOpportunities ?? []).length) warnings.push(`${article.internalLinkOpportunities.length} internal link note${article.internalLinkOpportunities.length === 1 ? '' : 's'} refer to this article.`);
	warnings.push('Unpublishing can waste indexed demand. Record a redirect before removing a public URL.');
	return {
		blocked: Boolean(article.publication?.url || article.status === 'published'),
		cmsId: article.workspace?.cms.externalId ?? null,
		publicUrl: article.publication?.url ?? null,
		warnings,
	};
}

export function canUnpublish(article: ArticleRecord, input: { confirmTitle?: string; redirectTo?: string }): LibraryDecision {
	const report = publicRemovalReport(article);
	if (!report.blocked) return { allowed: false, reason: 'This article has no public URL to unpublish.' };
	if (input.confirmTitle?.trim() !== article.title) return { allowed: false, reason: 'Type the article title to confirm. The public URL was not changed.' };
	if (!input.redirectTo?.trim()) return { allowed: false, reason: 'Add a redirect target. CCE will not remove a public URL without one.' };
	return { allowed: false, reason: 'CCE does not remove the CMS page. Unpublish it in the CMS, then record the redirect here.' };
}

export function canPermanentDelete(article: ArticleRecord, confirmTitle?: string): LibraryDecision {
	if (article.status === 'published' || article.publication?.url || article.workspace?.cms.lastSyncAt) {
		return { allowed: false, reason: 'Published or CMS-linked articles cannot be permanently deleted here.' };
	}
	if (confirmTitle?.trim() !== article.title) return { allowed: false, reason: 'Type the article title to confirm permanent deletion.' };
	return { allowed: true };
}

export function paginate<T>(rows: T[], page: number, pageSize: number): { rows: T[]; page: number; pages: number; total: number } {
	const size = Math.min(50, Math.max(1, pageSize));
	const pages = Math.max(1, Math.ceil(rows.length / size));
	const current = Math.min(Math.max(1, page), pages);
	return { rows: rows.slice((current - 1) * size, current * size), page: current, pages, total: rows.length };
}
