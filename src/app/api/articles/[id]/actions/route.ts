import { NextResponse } from 'next/server';
import {
	applyAcceptedRevisions,
	applyArticleEditorialImprovement,
	applyArticleCmsTitleCleanup,
	applyArticleStructuralRepair,
	approveArticleBrief,
	approveArticleResearch,
	approveWorkspaceArticle,
	ArticleWorkflowError,
	classifyWorkspaceArticle,
	decideRecommendation,
	destinationPreview,
	editArticleResearch,
	editRecommendation,
	applyFindingFix,
	enhanceArticleBrief,
	generateArticleMedia,
	getWorkspaceArticle,
	lookupArticleDraft,
	publishWorkspaceArticle,
	previewArticleEditorialImprovement,
	previewArticleStructuralRepair,
	recordArticlePublication,
	regenerateArticleSeo,
	replaceArticleMedia,
	requestArticleApproval,
	researchArticle,
	resolveBriefSuggestion,
	retryArticleGeneration,
	reviewArticle,
	scheduleWorkspaceArticle,
	startArticleGeneration,
	submitArticleDraft,
	updateArticleMediaMeta,
	type ResearchEdit,
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

function text(value: unknown): string {
	return typeof value === 'string' ? value : '';
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
	try {
		const { userId } = await requireIntelligenceUser();
		const { id } = await context.params;
		const body = (await request.json()) as Record<string, unknown>;
		const action = text(body.action);
		switch (action) {
			case 'research': {
				const mode = body.mode === 'follow_up' || body.mode === 'deeper' ? body.mode : 'initial';
				return NextResponse.json({ article: await researchArticle(userId, id, { mode, question: text(body.question) }) });
			}
			case 'research_edit':
				return NextResponse.json({ article: await editArticleResearch(userId, id, body.edit as ResearchEdit) });
			case 'approve_research':
				return NextResponse.json({ article: await approveArticleResearch(userId, id) });
			case 'approve_brief':
				return NextResponse.json({ article: await approveArticleBrief(userId, id) });
			case 'enhance_brief':
				return NextResponse.json({ article: await enhanceArticleBrief(userId, id) });
			case 'brief_suggestion':
				return NextResponse.json({ article: await resolveBriefSuggestion(userId, id, Number(body.index), body.apply === true) });
			case 'generate':
				return NextResponse.json(await startArticleGeneration(userId, id));
			case 'retry':
				return NextResponse.json(await retryArticleGeneration(userId, id));
			case 'review':
				return NextResponse.json({ article: await reviewArticle(userId, id) });
			case 'recommendation': {
				const decision = body.decision === 'rejected' ? 'rejected' : body.decision === 'pending' ? 'pending' : 'accepted';
				return NextResponse.json({ article: await decideRecommendation(userId, id, text(body.findingId), decision) });
			}
			case 'edit_recommendation':
				return NextResponse.json({ article: await editRecommendation(userId, id, text(body.findingId), text(body.instruction)) });
			case 'apply_fix':
				return NextResponse.json({ article: await applyFindingFix(userId, id, text(body.findingId)) });
			case 'destination_preview':
				return NextResponse.json({ preview: await destinationPreview(userId, id) });
			case 'apply_revisions':
			case 'revise':
				return NextResponse.json(await applyAcceptedRevisions(userId, id));
			case 'preview_structural_repair': {
				const detail = await getWorkspaceArticle(userId, id);
				return NextResponse.json({ preview: previewArticleStructuralRepair(userId, detail.article) });
			}
			case 'apply_structural_repair':
				return NextResponse.json({ article: await applyArticleStructuralRepair(userId, id) });
			case 'apply_cms_title_cleanup':
				return NextResponse.json({ article: await applyArticleCmsTitleCleanup(userId, id) });
			case 'preview_improve':
				return NextResponse.json({ preview: await previewArticleEditorialImprovement(userId, id) });
			case 'apply_improve':
				return NextResponse.json({
					article: await applyArticleEditorialImprovement(userId, id, text(body.proposedBody), text(body.baseRevisionId)),
				});
			case 'regenerate_seo':
				return NextResponse.json({
					article: await regenerateArticleSeo(userId, id, {
						useAi: body.useAi === true,
						overwriteEdited: body.overwriteEdited === true,
					}),
				});
			case 'classify':
				return NextResponse.json({ article: await classifyWorkspaceArticle(userId, id, text(body.categoryId) || undefined) });
			case 'media': {
				const role = body.role === 'og' ? 'og' : 'hero';
				if (typeof body.assetId === 'string') return NextResponse.json({ article: await replaceArticleMedia(userId, id, body.assetId, role) });
				return NextResponse.json({ article: await generateArticleMedia(userId, id, role) });
			}
			case 'media_meta':
				return NextResponse.json({
					article: await updateArticleMediaMeta(userId, id, {
						heroAlt: typeof body.heroAlt === 'string' ? body.heroAlt : undefined,
						ogAlt: typeof body.ogAlt === 'string' ? body.ogAlt : undefined,
						credit: typeof body.credit === 'string' ? body.credit : undefined,
						license: typeof body.license === 'string' ? body.license : undefined,
					}),
				});
			case 'lookup_draft':
				return NextResponse.json(await lookupArticleDraft(userId, id, text(body.externalId) || undefined));
			case 'correct_published':
				return NextResponse.json({ article: await submitArticleDraft(userId, id, { correction: true }) });
			case 'submit_draft':
			case 'update_draft':
				return NextResponse.json({ article: await submitArticleDraft(userId, id) });
			case 'request_approval':
				return NextResponse.json({ article: await requestArticleApproval(userId, id) });
			case 'approve':
				return NextResponse.json({ article: await approveWorkspaceArticle(userId, id) });
			case 'publish':
				return NextResponse.json(await publishWorkspaceArticle(userId, id));
			case 'record_publication':
				return NextResponse.json({ article: await recordArticlePublication(userId, id, text(body.url)) });
			case 'schedule':
				return NextResponse.json({
					article: await scheduleWorkspaceArticle(userId, id, {
						publishAt: text(body.publishAt),
						destinationId: text(body.destinationId) || undefined,
					}),
				});
			default:
				return NextResponse.json({ error: 'Unknown article action.' }, { status: 400 });
		}
	} catch (error) {
		return fail(error);
	}
}
