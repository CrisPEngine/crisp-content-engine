import { NextResponse } from 'next/server';
import { archiveArticle, deleteDraftArticle, deleteDrafts, restoreArticle, unpublishReport } from '@/lib/articles/libraryActions';
import { ArticleWorkflowError, createArticleBrief, listFailedArticleJobs, listWorkspaceArticles } from '@/lib/articles/workspace';
import { paginate } from '@/lib/articles/library';
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
		const [listed, failedJobs] = await Promise.all([
			listWorkspaceArticles(userId, { brandId, view }),
			listFailedArticleJobs(userId, brandId),
		]);
		const q = (url.searchParams.get('q') ?? '').trim().toLowerCase();
		const sort = url.searchParams.get('sort') ?? 'updated';
		const filtered = listed.filter((article) => !q || `${article.title} ${article.status}`.toLowerCase().includes(q));
		const sorted = [...filtered].sort((a, b) => sort === 'title' ? a.title.localeCompare(b.title) : sort === 'status' ? a.status.localeCompare(b.status) : b.updatedAt.localeCompare(a.updatedAt));
		const page = paginate(sorted, Number(url.searchParams.get('page') ?? 1), Number(url.searchParams.get('pageSize') ?? 20));
		return NextResponse.json({ articles: page.rows, page: page.page, pages: page.pages, total: page.total, failedJobs });
	} catch (error) {
		return fail(error);
	}
}

export async function POST(request: Request) {
	try {
		const { userId } = await requireIntelligenceUser();
		const body = (await request.json()) as Record<string, unknown>;
		const action = text(body.action);
		if (action === 'archive' && text(body.id)) return NextResponse.json({ article: await archiveArticle(userId, text(body.id)!) });
		if (action === 'restore' && text(body.id)) return NextResponse.json({ article: await restoreArticle(userId, text(body.id)!) });
		if (action === 'delete_draft' && text(body.id)) return NextResponse.json(await deleteDraftArticle(userId, text(body.id)!, text(body.confirmTitle) ?? ''));
		if (action === 'delete_drafts' && Array.isArray(body.ids)) return NextResponse.json(await deleteDrafts(userId, body.ids.filter((id): id is string => typeof id === 'string')));
		if (action === 'archive_many' && Array.isArray(body.ids)) {
			const articles = [];
			for (const id of body.ids.filter((item): item is string => typeof item === 'string')) articles.push(await archiveArticle(userId, id));
			return NextResponse.json({ articles });
		}
		if (action === 'restore_many' && Array.isArray(body.ids)) {
			const articles = [];
			for (const id of body.ids.filter((item): item is string => typeof item === 'string')) articles.push(await restoreArticle(userId, id));
			return NextResponse.json({ articles });
		}
		if (action === 'sync_payload' && text(body.brandId)) {
			const { fetchPayloadCatalogue, syncPayloadCatalogue } = await import('@/lib/publishing/cmsSync');
			const docs = await fetchPayloadCatalogue(text(body.origin) ?? 'https://folian.app');
			return NextResponse.json(await syncPayloadCatalogue(userId, text(body.brandId)!, docs, text(body.origin) ?? 'https://folian.app'));
		}
		if (action === 'prepare_publish' && text(body.id)) {
			const { getNativeContentStore } = await import('@/lib/media/store');
			const { prepareMetadataPublish } = await import('@/lib/publishing/payloadCatalogue');
			const article = await getNativeContentStore().getArticle(userId, text(body.id)!);
			if (!article || article.ownerUserId !== userId) return NextResponse.json({ error: 'Article not found.' }, { status: 404 });
			return NextResponse.json(prepareMetadataPublish({
				proposalStatus: article.library?.proposal?.status ?? null,
				baseUpdatedAt: article.library?.proposal?.baseUpdatedAt ?? null,
				currentUpdatedAt: article.library?.cms?.updatedAt ?? null,
			}));
		}
		if (action === 'unpublish_check' && text(body.id)) {
			const { getNativeContentStore } = await import('@/lib/media/store');
			const article = await getNativeContentStore().getArticle(userId, text(body.id)!);
			if (!article || article.ownerUserId !== userId) return NextResponse.json({ error: 'Article not found.' }, { status: 404 });
			return NextResponse.json(unpublishReport(userId, article, { confirmTitle: text(body.confirmTitle), redirectTo: text(body.redirectTo) }));
		}
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
