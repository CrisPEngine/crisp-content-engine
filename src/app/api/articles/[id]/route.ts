import { NextResponse } from 'next/server';
import { ArticleWorkflowError, articleTaxonomy, getWorkspaceArticle, saveArticleDraft } from '@/lib/articles/workspace';
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

function text(value: unknown): string | undefined {
	return typeof value === 'string' ? value : undefined;
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
	try {
		const { userId } = await requireIntelligenceUser();
		const { id } = await context.params;
		const detail = await getWorkspaceArticle(userId, id);
		const taxonomy = await articleTaxonomy(userId, detail.article);
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
		const brief = body.brief && typeof body.brief === 'object' ? (body.brief as Record<string, unknown>) : undefined;
		const article = await saveArticleDraft(userId, id, {
			topic: text(body.topic),
			workingTitle: text(body.workingTitle),
			title: text(body.title),
			primaryKeyword: text(body.primaryKeyword),
			searchIntent: text(body.searchIntent),
			audience: text(body.audience),
			contentType: text(body.contentType),
			destinationId: text(body.destinationId),
			researchRequirements: text(body.researchRequirements),
			internalLinking: text(body.internalLinking),
			imageRequirements: text(body.imageRequirements),
			targetWords: typeof body.targetWords === 'number' ? body.targetWords : undefined,
			externalId: text(body.externalId),
			seoTitle: text(body.seoTitle),
			metaDescription: text(body.metaDescription),
			excerpt: text(body.excerpt),
			slug: text(body.slug),
			body: text(body.body),
			brief: brief ? (Object.fromEntries(Object.entries(brief).filter(([, value]) => typeof value === 'string')) as Record<string, string>) : undefined,
		});
		return NextResponse.json({ article });
	} catch (error) {
		return fail(error);
	}
}
