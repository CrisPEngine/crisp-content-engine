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
	ensureArticleCmsExternalId,
	acceptArticleImageCandidate,
	prepareArticleImageBrief,
	proposeArticleImageReferences,
	publishWorkspaceArticle,
	refreshArticleImageAlt,
	applyAcceptedEditorialProposals,
	approveWorkspaceEditorialBrief,
	critiqueWorkspaceArticle,
	decideEditorialProposal,
	generateWorkspaceEditorialBrief,
	previewAcceptedEditorialProposals,
	previewArticleEditorialImprovement,
	recordEditorialFeedback,
	previewArticleStructuralRepair,
	recordArticlePublication,
	regenerateArticleSeo,
	replaceArticleMedia,
	requestArticleApproval,
	researchArticle,
	resolveBriefSuggestion,
	restoreWorkspaceRevision,
	retryArticleGeneration,
	reviewArticle,
	saveArticleImageBrief,
	scheduleWorkspaceArticle,
	startArticleGeneration,
	submitArticleDraft,
	suggestWorkspaceTitles,
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
				const decision =
					body.decision === 'rejected'
						? 'rejected'
						: body.decision === 'dismissed'
							? 'dismissed'
							: body.decision === 'pending'
								? 'pending'
								: 'accepted';
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
				if (typeof body.assetId === 'string' || typeof body.selectAssetId === 'string') {
					return NextResponse.json({
						article: await replaceArticleMedia(userId, id, text(body.assetId || body.selectAssetId), role),
					});
				}
				return NextResponse.json({
					article: await generateArticleMedia(userId, id, role, {
						prompt: typeof body.prompt === 'string' ? body.prompt : undefined,
						concept: typeof body.concept === 'string' ? body.concept : undefined,
						negativeConstraints: typeof body.negativeConstraints === 'string' ? body.negativeConstraints : undefined,
						revisionInstructions: typeof body.revisionInstructions === 'string' ? body.revisionInstructions : undefined,
						brandStyleNotes: typeof body.brandStyleNotes === 'string' ? body.brandStyleNotes : undefined,
						referenceAssetIds: Array.isArray(body.referenceAssetIds)
							? body.referenceAssetIds.filter((value): value is string => typeof value === 'string')
							: undefined,
						forceNew: body.forceNew === true,
					}),
				});
			}
			case 'prepare_image_brief': {
				const role = body.role === 'og' ? 'og' : 'hero';
				return NextResponse.json(
					await prepareArticleImageBrief(userId, id, role, {
						rebuildPrompt: body.rebuildPrompt === true,
						applySuggestedConcept: body.applySuggestedConcept === true,
					}),
				);
			}
			case 'propose_image_references': {
				const role = body.role === 'og' ? 'og' : 'hero';
				return NextResponse.json(await proposeArticleImageReferences(userId, id, role));
			}
			case 'refresh_image_alt': {
				const role = body.role === 'og' ? 'og' : 'hero';
				return NextResponse.json({ article: await refreshArticleImageAlt(userId, id, role) });
			}
			case 'accept_image_candidate': {
				const role = body.role === 'og' ? 'og' : 'hero';
				return NextResponse.json({
					article: await acceptArticleImageCandidate(userId, id, role, text(body.assetId || body.selectAssetId)),
				});
			}
			case 'save_image_brief': {
				const role = body.role === 'og' ? 'og' : 'hero';
				return NextResponse.json({
					article: await saveArticleImageBrief(userId, id, role, {
						concept: typeof body.concept === 'string' ? body.concept : undefined,
						prompt: typeof body.prompt === 'string' ? body.prompt : undefined,
						promptManuallyEdited: body.promptManuallyEdited === true,
						negativeConstraints: typeof body.negativeConstraints === 'string' ? body.negativeConstraints : undefined,
						revisionInstructions: typeof body.revisionInstructions === 'string' ? body.revisionInstructions : undefined,
						brandStyleNotes: typeof body.brandStyleNotes === 'string' ? body.brandStyleNotes : undefined,
						referenceAssetIds: Array.isArray(body.referenceAssetIds)
							? body.referenceAssetIds.filter((value): value is string => typeof value === 'string')
							: undefined,
						effectivePrompt: typeof body.effectivePrompt === 'string' ? body.effectivePrompt : undefined,
					}),
				});
			}
			case 'suggest_titles':
				return NextResponse.json(await suggestWorkspaceTitles(userId, id));
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
			case 'ensure_cms_external_id':
				return NextResponse.json({ article: await ensureArticleCmsExternalId(userId, id) });
			case 'correct_published':
				return NextResponse.json({ article: await submitArticleDraft(userId, id, { correction: true }) });
			case 'submit_draft':
			case 'update_draft': {
				const submitted = await submitArticleDraft(userId, id);
				const submission = submitted.workspace?.cms.lastSubmission;
				return NextResponse.json({
					article: submitted,
					submission,
					message: submission?.ok
						? `Draft ${submission.action === 'create' ? 'created' : 'updated'} in ${submission.destinationName || 'the CMS'} as ${submission.externalId}${submission.cmsRevision != null ? ` · revision ${submission.cmsRevision}` : ''}. Not published.`
						: undefined,
				});
			}
			case 'generate_editorial_brief':
				return NextResponse.json({ article: await generateWorkspaceEditorialBrief(userId, id, text(body.instruction) || undefined) });
			case 'approve_editorial_brief':
				return NextResponse.json({ article: await approveWorkspaceEditorialBrief(userId, id) });
			case 'critique_article':
				return NextResponse.json({ article: await critiqueWorkspaceArticle(userId, id) });
			case 'editorial_feedback':
				return NextResponse.json({ article: await recordEditorialFeedback(userId, id, text(body.feedback)) });
			case 'editorial_proposal':
				return NextResponse.json({
					article: await decideEditorialProposal(
						userId,
						id,
						text(body.proposalId),
						text(body.status) as 'proposed' | 'accepted' | 'rejected' | 'deferred' | 'applied',
					),
				});
			case 'preview_editorial_proposals':
				return NextResponse.json({ article: await previewAcceptedEditorialProposals(userId, id) });
			case 'apply_editorial_proposals':
				return NextResponse.json(await applyAcceptedEditorialProposals(userId, id));
			case 'restore_revision':
				return NextResponse.json({ article: await restoreWorkspaceRevision(userId, id, text(body.revisionId)) });
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
