import { NextResponse } from 'next/server';
import { ArticleWorkflowError, createArticleBrief, listFailedArticleJobs, listWorkspaceArticles } from '@/lib/articles/workspace';
import { requireIntelligenceUser } from '@/lib/intelligence/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function fail(error: unknown) {
	if (error instanceof ArticleWorkflowError) {
		return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
	}
	const message = error instanceof Error ? error.message : 'Request failed';
	const status = message === 'Unauthorized' ? 401 : 400;
	return NextResponse.json({ error: message }, { status });
}

function text(value: unknown): string | undefined {
	return typeof value === 'string' ? value : undefined;
}

export async function GET(request: Request) {
	try {
		const { userId } = await requireIntelligenceUser();
		const url = new URL(request.url);
		const brandId = url.searchParams.get('brandId') || undefined;
		const view = url.searchParams.get('view') || 'all';
		const [articles, failedJobs] = await Promise.all([
			listWorkspaceArticles(userId, { brandId, view }),
			listFailedArticleJobs(userId, brandId),
		]);
		return NextResponse.json({ articles, failedJobs });
	} catch (error) {
		return fail(error);
	}
}

export async function POST(request: Request) {
	try {
		const { userId } = await requireIntelligenceUser();
		const body = (await request.json()) as Record<string, unknown>;
		const brandId = text(body.brandId);
		const topic = text(body.topic);
		if (!brandId || !topic?.trim()) {
			return NextResponse.json({ error: 'Brand and topic are required.' }, { status: 400 });
		}
		const brief = body.brief && typeof body.brief === 'object' ? (body.brief as Record<string, unknown>) : {};
		const result = await createArticleBrief(userId, {
			brandId,
			destinationId: text(body.destinationId),
			topic,
			workingTitle: text(body.workingTitle),
			primaryKeyword: text(body.primaryKeyword),
			searchIntent: text(body.searchIntent),
			audience: text(body.audience),
			contentType: text(body.contentType),
			targetWords: typeof body.targetWords === 'number' ? body.targetWords : undefined,
			categoryId: text(body.categoryId),
			researchRequirements: text(body.researchRequirements),
			internalLinking: text(body.internalLinking),
			imageRequirements: text(body.imageRequirements),
			externalId: text(body.externalId),
			brief: Object.fromEntries(Object.entries(brief).filter(([, value]) => typeof value === 'string')) as Record<string, string>,
		});
		return NextResponse.json(result);
	} catch (error) {
		return fail(error);
	}
}
