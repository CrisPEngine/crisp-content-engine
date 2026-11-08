import { NextResponse } from 'next/server';
import { authorizeCron } from '@/lib/intelligence/http';
import { ensureWorkspace } from '@/lib/articles/meta';
import type { ArticleRecord } from '@/lib/articles/types';
import { getSupabaseService } from '@/lib/supabaseService';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Website article schedule sweep.
 * This does not publish, and it does not read social publish jobs.
 * Due articles stay drafts in the CMS until a person publishes them.
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
	const due: Array<{ id: string; destination: string | null; publishAt: string | null; published: false }> = [];
	for (const row of data ?? []) {
		const article = row.document as ArticleRecord;
		const workspace = ensureWorkspace(article);
		if (workspace.schedule.status !== 'scheduled' && workspace.schedule.status !== 'due') continue;
		if (article.approval.status !== 'approved') {
			workspace.schedule.status = 'blocked';
			workspace.schedule.blockedReason = 'Approval is required. The schedule was not published.';
		} else {
			workspace.schedule.status = 'due';
			workspace.schedule.blockedReason = 'Due for manual publication in the CMS. CCE did not publish it.';
		}
		article.workspace = workspace;
		await supabase.from('articles').update({ document: article, updated_at: new Date().toISOString() }).eq('id', article.id);
		due.push({ id: article.id, destination: workspace.destinationId, publishAt: workspace.schedule.publishAt, published: false });
	}
	return NextResponse.json({ ok: true, published: false, due });
}
