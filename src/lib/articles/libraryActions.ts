import { ArticleWorkflowError } from './workspace';
import { canArchive, canDeleteDraft, canPermanentDelete, canRestore, canUnpublish, publicRemovalReport } from './library';
import { getNativeContentStore } from '@/lib/media/store';
import type { ArticleRecord } from './types';

async function requireOwned(ownerUserId: string, id: string): Promise<ArticleRecord> {
	const article = await getNativeContentStore().getArticle(ownerUserId, id);
	if (!article || article.ownerUserId !== ownerUserId) throw new ArticleWorkflowError('Article not found.', 404, 'article_missing');
	return article;
}

async function audit(userId: string, article: ArticleRecord, action: string, detail: Record<string, unknown>) {
	try {
		const { getSupabaseService } = await import('@/lib/supabaseService');
		await getSupabaseService().from('content_audit_events').insert({
			user_id: userId,
			brand_id: article.brandId,
			target_type: 'article',
			target_id: article.id,
			action,
			detail,
		});
	} catch {
		// The article change still stands. The audit row is recorded when the table is available.
	}
}

export async function archiveArticle(ownerUserId: string, id: string): Promise<ArticleRecord> {
	const article = await requireOwned(ownerUserId, id);
	const decision = canArchive(article);
	if (!decision.allowed) throw new ArticleWorkflowError(decision.reason, 409, 'archive_blocked');
	article.library = {
		archivedAt: new Date().toISOString(),
		canonicalUrl: article.library?.canonicalUrl ?? article.publication?.url ?? null,
		stageNote: 'Archived in the content library. The public URL was not changed.',
	};
	article.updatedAt = new Date().toISOString();
	const saved = await getNativeContentStore().saveArticle(article);
	await audit(ownerUserId, saved, 'archive', { publicUrl: saved.publication?.url ?? null });
	return saved;
}

export async function restoreArticle(ownerUserId: string, id: string): Promise<ArticleRecord> {
	const article = await requireOwned(ownerUserId, id);
	const decision = canRestore(article);
	if (!decision.allowed) throw new ArticleWorkflowError(decision.reason, 409, 'restore_blocked');
	article.library = { archivedAt: null, canonicalUrl: article.library?.canonicalUrl ?? null, stageNote: 'Restored to the active library.' };
	article.updatedAt = new Date().toISOString();
	return getNativeContentStore().saveArticle(article);
}

export async function deleteDraftArticle(ownerUserId: string, id: string, confirmTitle: string): Promise<{ deleted: true }> {
	const article = await requireOwned(ownerUserId, id);
	const decision = canDeleteDraft(article);
	if (!decision.allowed) throw new ArticleWorkflowError(decision.reason, 409, 'delete_blocked');
	if (confirmTitle.trim() !== article.title) throw new ArticleWorkflowError('Type the article title to confirm deletion.', 409, 'confirm_required');
	return removeDraft(ownerUserId, article);
}

export async function deleteDrafts(ownerUserId: string, ids: string[]): Promise<{ deleted: string[]; skipped: Array<{ id: string; reason: string }> }> {
	const deleted: string[] = [];
	const skipped: Array<{ id: string; reason: string }> = [];
	for (const id of ids) {
		const article = await getNativeContentStore().getArticle(ownerUserId, id);
		if (!article || article.ownerUserId !== ownerUserId || article.brandId == null) {
			skipped.push({ id, reason: 'Article not found for this account.' });
			continue;
		}
		const decision = canDeleteDraft(article);
		if (!decision.allowed) {
			skipped.push({ id, reason: decision.reason });
			continue;
		}
		await removeDraft(ownerUserId, article);
		deleted.push(id);
	}
	return { deleted, skipped };
}

async function removeDraft(ownerUserId: string, article: ArticleRecord): Promise<{ deleted: true }> {
	const store = getNativeContentStore();
	const links = await store.listLinks(ownerUserId, 'article', article.id);
	for (const link of links) {
		const shared = (await store.listLinksForAsset(ownerUserId, link.assetId)).some((item) => item.targetId !== article.id);
		await store.removeLink(ownerUserId, link.assetId, link.targetType, link.targetId);
		if (!shared) {
			// Keep the asset. Another article may still reference the file by id inside its document.
		}
	}
	await audit(ownerUserId, article, 'delete_draft', { title: article.title, assetsKept: links.map((link) => link.assetId) });
	await store.deleteArticle(ownerUserId, article.id);
	return { deleted: true };
}

export function unpublishReport(ownerUserId: string, article: ArticleRecord, input: { confirmTitle?: string; redirectTo?: string }) {
	void ownerUserId;
	const decision = canUnpublish(article, input);
	return { ...publicRemovalReport(article), changed: false, reason: decision.allowed ? null : decision.reason };
}

export async function rejectMetadataProposal(ownerUserId: string, id: string): Promise<ArticleRecord> {
	const article = await requireOwned(ownerUserId, id);
	if (!article.body.startsWith('# Metadata proposal')) throw new ArticleWorkflowError('This is not a metadata proposal.', 409, 'not_proposal');
	article.approval = { required: true, approver: 'human', status: 'rejected' };
	article.status = 'draft';
	article.updatedAt = new Date().toISOString();
	return getNativeContentStore().saveArticle(article);
}

export async function requestProposalChanges(ownerUserId: string, id: string, note: string): Promise<ArticleRecord> {
	const article = await requireOwned(ownerUserId, id);
	if (!article.body.startsWith('# Metadata proposal')) throw new ArticleWorkflowError('This is not a metadata proposal.', 409, 'not_proposal');
	article.status = 'draft';
	article.approval = { required: true, approver: 'human', status: 'pending' };
	article.library = {
		archivedAt: article.library?.archivedAt ?? null,
		canonicalUrl: article.library?.canonicalUrl ?? null,
		stageNote: note.trim() || 'Changes requested. The published article was not changed.',
	};
	article.updatedAt = new Date().toISOString();
	return getNativeContentStore().saveArticle(article);
}
