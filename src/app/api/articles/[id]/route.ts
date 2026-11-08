import { NextResponse } from 'next/server';
import { ArticleWorkflowError, getWorkspaceArticle, saveArticleDraft } from '@/lib/articles/workspace';
import { taxonomyForDestination } from '@/lib/publishing/websiteDestinations';
import { requireIntelligenceUser } from '@/lib/intelligence/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function fail(error: unknown) {
	if (error instanceof ArticleWorkflowError) {
		return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
	}
	const message = error instanceof Error ? error.message : 'Request failed';
	return NextResponse.json({ error: message }, { status: message === 'Unauthorized' ? 401 : 400 });
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
	try {
		const { userId } = await requireIntelligenceUser();
		const { id } = await context.params;
		const detail = await getWorkspaceArticle(userId, id);
		const taxonomy = detail.article.workspace?.destinationId
			? await taxonomyForDestination(detail.article.workspace.destinationId)
			: null;
		return NextResponse.json({ ...detail, taxonomy });
	} catch (error) {
		return fail(error);
	}
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
	try {
		const { userId } = await requireIntelligenceUser();
		const { id } = await context.params;
		const body = (await request.json()) as Record<string, unknown>;
		const article = await saveArticleDraft(userId, id, {
			topic: typeof body.topic === 'string' ? body.topic : undefined,
			workingTitle: typeof body.workingTitle === 'string' ? body.workingTitle : undefined,
			title: typeof body.title === 'string' ? body.title : undefined,
			primaryKeyword: typeof body.primaryKeyword === 'string' ? body.primaryKeyword : undefined,
			searchIntent: typeof body.searchIntent === 'string' ? body.searchIntent : undefined,
			audience: typeof body.audience === 'string' ? body.audience : undefined,
			contentType: typeof body.contentType === 'string' ? body.contentType : undefined,
			destinationId: typeof body.destinationId === 'string' ? body.destinationId : undefined,
			researchRequirements: typeof body.researchRequirements === 'string' ? body.researchRequirements : undefined,
			internalLinking: typeof body.internalLinking === 'string' ? body.internalLinking : undefined,
			imageRequirements: typeof body.imageRequirements === 'string' ? body.imageRequirements : undefined,
			targetWords: typeof body.targetWords === 'number' ? body.targetWords : undefined,
			body: typeof body.body === 'string' ? body.body : undefined,
		});
		return NextResponse.json({ article });
	} catch (error) {
		return fail(error);
	}
}
