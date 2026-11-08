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
		const body = (await request.json()) as {
			brandId?: string;
			destinationId?: string;
			topic?: string;
			workingTitle?: string;
			primaryKeyword?: string;
			searchIntent?: string;
			audience?: string;
			contentType?: string;
			targetWords?: number;
			researchRequirements?: string;
			internalLinking?: string;
			imageRequirements?: string;
			externalId?: string;
		};
		if (!body.brandId || !body.topic?.trim()) {
			return NextResponse.json({ error: 'Brand and topic are required.' }, { status: 400 });
		}
		const article = await createArticleBrief(userId, {
			brandId: body.brandId,
			destinationId: body.destinationId,
			topic: body.topic,
			workingTitle: body.workingTitle,
			primaryKeyword: body.primaryKeyword,
			searchIntent: body.searchIntent,
			audience: body.audience,
			contentType: body.contentType,
			targetWords: body.targetWords,
			researchRequirements: body.researchRequirements,
			internalLinking: body.internalLinking,
			imageRequirements: body.imageRequirements,
			externalId: body.externalId,
		});
		return NextResponse.json({ article });
	} catch (error) {
		return fail(error);
	}
}
