import { NextResponse } from 'next/server';
import { ArticleWorkflowError } from '@/lib/articles/workspace';
import {
	approveArticleBrief,
	approveWorkspaceArticle,
	classifyWorkspaceArticle,
	decideRecommendation,
	generateArticleMedia,
	publishWorkspaceArticle,
	recordArticlePublication,
	replaceArticleMedia,
	requestArticleApproval,
	requestArticleRevision,
	researchArticle,
	retryArticleGeneration,
	reviewArticle,
	scheduleWorkspaceArticle,
	startArticleGeneration,
	submitArticleDraft,
	updateArticleMediaMeta,
} from '@/lib/articles/workspace';
import { requireIntelligenceUser } from '@/lib/intelligence/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

function fail(error: unknown) {
	if (error instanceof ArticleWorkflowError) {
		return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
	}
	const message = error instanceof Error ? error.message : 'Request failed';
	return NextResponse.json({ error: message }, { status: message === 'Unauthorized' ? 401 : 400 });
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
	try {
		const { userId } = await requireIntelligenceUser();
		const { id } = await context.params;
		const body = (await request.json()) as Record<string, unknown>;
		const action = String(body.action ?? '');
		if (action === 'research') return NextResponse.json({ article: await researchArticle(userId, id) });
		if (action === 'approve_brief') return NextResponse.json({ article: await approveArticleBrief(userId, id) });
		if (action === 'generate') return NextResponse.json(await startArticleGeneration(userId, id));
		if (action === 'retry') return NextResponse.json(await retryArticleGeneration(userId, id));
		if (action === 'review') return NextResponse.json({ article: await reviewArticle(userId, id) });
		if (action === 'recommendation') {
			const decision = body.decision === 'rejected' ? 'rejected' : 'accepted';
			return NextResponse.json({ article: await decideRecommendation(userId, id, String(body.findingId ?? ''), decision) });
		}
		if (action === 'revise') return NextResponse.json({ article: await requestArticleRevision(userId, id) });
		if (action === 'classify') {
			return NextResponse.json({ article: await classifyWorkspaceArticle(userId, id, typeof body.categoryId === 'string' ? body.categoryId : undefined) });
		}
		if (action === 'media') {
			const role = body.role === 'og' ? 'og' : 'hero';
			if (typeof body.assetId === 'string') return NextResponse.json({ article: await replaceArticleMedia(userId, id, body.assetId, role) });
			return NextResponse.json({ article: await generateArticleMedia(userId, id, role) });
		}
		if (action === 'media_meta') {
			return NextResponse.json({
				article: await updateArticleMediaMeta(userId, id, {
					heroAlt: typeof body.heroAlt === 'string' ? body.heroAlt : undefined,
					ogAlt: typeof body.ogAlt === 'string' ? body.ogAlt : undefined,
					credit: typeof body.credit === 'string' ? body.credit : undefined,
					license: typeof body.license === 'string' ? body.license : undefined,
				}),
			});
		}
		if (action === 'submit_draft') return NextResponse.json({ article: await submitArticleDraft(userId, id, 'create') });
		if (action === 'update_draft') return NextResponse.json({ article: await submitArticleDraft(userId, id, 'update') });
		if (action === 'request_approval') return NextResponse.json({ article: await requestArticleApproval(userId, id) });
		if (action === 'approve') return NextResponse.json({ article: await approveWorkspaceArticle(userId, id) });
		if (action === 'publish') return NextResponse.json(await publishWorkspaceArticle(userId, id));
		if (action === 'record_publication') return NextResponse.json({ article: await recordArticlePublication(userId, id, String(body.url ?? '')) });
		if (action === 'schedule') {
			return NextResponse.json({
				article: await scheduleWorkspaceArticle(userId, id, {
					publishAt: String(body.publishAt ?? ''),
					destinationId: typeof body.destinationId === 'string' ? body.destinationId : undefined,
				}),
			});
		}
		return NextResponse.json({ error: 'Unknown article action.' }, { status: 400 });
	} catch (error) {
		return fail(error);
	}
}
