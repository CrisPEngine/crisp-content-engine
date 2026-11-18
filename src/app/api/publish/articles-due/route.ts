import { NextResponse } from 'next/server';
import { authorizeCron } from '@/lib/intelligence/http';
import { ensureWorkspace } from '@/lib/articles/meta';
import type { ArticleRecord } from '@/lib/articles/types';
import { duePublicationAction } from '@/lib/publishing/payloadPublish';
import { websitePublishingEnabled } from '@/lib/publishing/websiteDestinations';
import { getSupabaseService } from '@/lib/supabaseService';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Website article schedule sweep.
 * It never reads social publish jobs. Payload is called only for an approved article
 * that was explicitly scheduled, and only while live publishing is enabled.
 */
export async function POST(request: Request) {
	if (!authorizeCron(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
	const supabase = getSupabaseService();
	const now = new Date().toISOString();
	const { data, error } = await supabase.from('articles').select('id, document, publish_at, status').not('publish_at', 'is', null).lte('publish_at', now);
	if (error) {
		if (/publish_at/.test(error.message)) {
			return NextResponse.json({ ok: false, error: 'articles.publish_at is not available until migration 038 is applied.', due: [] }, { status: 200 });
		}
		return NextResponse.json({ error: error.message }, { status: 500 });
	}
	const due: Array<{ id: string; destination: string | null; publishAt: string | null; published: boolean }> = [];
	const liveEnabled = websitePublishingEnabled();
	for (const row of data ?? []) {
		const article = row.document as ArticleRecord;
		const workspace = ensureWorkspace(article);
		const action = duePublicationAction({
			scheduleStatus: workspace.schedule.status,
			approval: article.approval.status,
			publicationState: article.library?.publication?.state ?? null,
			liveEnabled,
			error: article.library?.publication?.error ?? null,
		});
		if (action === 'ignore') continue;
		if (action === 'publish' && article.ownerUserId) {
			const { guardedArticlePublish } = await import('@/lib/publishing/publishArticle');
			const result = await guardedArticlePublish(article.ownerUserId, article.id, true);
			const { data: freshRow } = await supabase.from('articles').select('document').eq('id', article.id).maybeSingle();
			const fresh = (freshRow?.document ?? article) as ArticleRecord;
			const freshWorkspace = ensureWorkspace(fresh);
			freshWorkspace.schedule.status = 'due';
			freshWorkspace.schedule.blockedReason = result.message;
			fresh.workspace = freshWorkspace;
			await supabase.from('articles').update({ document: fresh, updated_at: new Date().toISOString() }).eq('id', article.id);
			due.push({
				id: article.id,
				destination: freshWorkspace.destinationId,
				publishAt: freshWorkspace.schedule.publishAt,
				published: result.sent && (result.phase === 'published' || result.phase === 'verified_live'),
			});
			continue;
		}
		if (article.approval.status !== 'approved') {
			workspace.schedule.status = 'blocked';
			workspace.schedule.blockedReason = 'Approval is required. The schedule was not published.';
		} else {
			workspace.schedule.status = 'due';
			workspace.schedule.blockedReason = liveEnabled
				? 'Due for publication. It has no armed publication schedule, so Payload was not called.'
				: 'Due for publication. Live publishing is disabled, so Payload was not called.';
			if (article.library?.publication?.state === 'scheduled') {
				article.library.publication.error = workspace.schedule.blockedReason;
				article.library.publication.updatedAt = new Date().toISOString();
			}
		}
		article.workspace = workspace;
		await supabase.from('articles').update({ document: article, updated_at: new Date().toISOString() }).eq('id', article.id);
		due.push({ id: article.id, destination: workspace.destinationId, publishAt: workspace.schedule.publishAt, published: false });
	}
	return NextResponse.json({ ok: true, published: due.some((item) => item.published), due });
}
