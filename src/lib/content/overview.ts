export type OverviewOpportunity = { id: string; title: string; status: string; recommendedAction: string };
export type OverviewJob = { id: string; opportunityId: string; articleId: string | null; stage: string; status: string; note: string; error: string | null; workType?: string; createdAt?: string };
export type OverviewArticle = { id: string; title: string; status: string; publicationPhase?: string; contentStage?: string; localChangesPending?: boolean; cmsState?: string | null; updatedAt?: string };

export type OverviewLink = { id: string; title: string; detail: string; href: string; at?: string | null };

export function isQaRecord(title: string): boolean {
	return /\(qa\b|qa copy|\btest article\b/i.test(title);
}

export function buildContentOverview(input: {
	paused: boolean;
	publishingEnabled: boolean;
	started: number;
	remaining: number;
	nextSlotAt: string | null;
	weeklyMaximum: number;
	indexed?: number | null;
	opportunities: OverviewOpportunity[];
	jobs: OverviewJob[];
	articles: OverviewArticle[];
}) {
	const articles = input.articles.filter((article) => !isQaRecord(article.title));
	const opportunities = input.opportunities.filter((item) => !isQaRecord(item.title));
	const approved = opportunities.filter((item) => item.status === 'approved');
	const producing = input.jobs.filter((job) => job.status === 'queued' || job.status === 'running');
	const blocked = input.jobs.filter((job) => job.status === 'needs_attention');
	const failed = input.jobs.filter((job) => job.status === 'failed');
	const awaitingJobs = input.jobs.filter((job) => job.status === 'ready_for_approval');
	const review = articles.filter((article) => article.status === 'review' || article.publicationPhase === 'ready_for_approval' || article.contentStage === 'optimisation');
	const scheduled = articles.filter((article) => article.publicationPhase === 'scheduled' || article.status === 'scheduled');
	const published = articles.filter((article) => article.cmsState === 'published' || article.publicationPhase === 'verified_live' || article.publicationPhase === 'published' || article.status === 'published');
	const pendingLocal = published.filter((article) => article.localChangesPending);
	const titleFor = (job: OverviewJob) => opportunities.find((item) => item.id === job.opportunityId)?.title ?? 'Article in production';
	const actions: OverviewLink[] = [
		...blocked.map((job) => ({ id: `job:${job.id}:attention`, title: titleFor(job), detail: 'Blocked. A person needs to resolve this before production continues.', href: job.articleId ? `/content/articles/${job.articleId}` : '/campaigns#production' })),
		...awaitingJobs.map((job) => ({ id: `job:${job.id}:approval`, title: titleFor(job), detail: job.workType === 'metadata' ? 'Awaiting approval of a metadata change. The article body is unchanged.' : 'Awaiting approval.', href: job.articleId ? `/content/articles/${job.articleId}` : '/campaigns#production' })),
		...approved.map((item) => ({ id: `opportunity:${item.id}`, title: item.title, detail: input.paused ? 'Paused. This opportunity has no scheduled start.' : item.recommendedAction === 'update' ? 'Existing article optimisation. It has not started.' : 'New article. It has not started.', href: '/campaigns#approved' })),
		...pendingLocal.map((article) => ({ id: `article:${article.id}:local`, title: article.title, detail: 'Published, with local changes pending. The live page has not been updated.', href: `/content/articles/${article.id}` })),
	];
	const pipeline = {
		research: input.jobs.filter((job) => job.stage === 'research' && (job.status === 'queued' || job.status === 'running')).length,
		draft: input.jobs.filter((job) => (job.stage === 'draft' || job.stage === 'brief') && (job.status === 'queued' || job.status === 'running')).length,
		review: review.length,
		scheduling: scheduled.length,
		publication: published.length,
	};
	const activity = [...articles].sort((left, right) => (right.updatedAt ?? '').localeCompare(left.updatedAt ?? '')).slice(0, 5).map((article) => ({
		id: `article:${article.id}:activity`,
		title: article.title,
		detail: article.localChangesPending ? 'Local changes pending' : article.cmsState === 'published' ? 'Published in the CMS' : article.contentStage === 'optimisation' ? 'Metadata proposal' : article.status,
		href: `/content/articles/${article.id}`,
		at: article.updatedAt ?? null,
	}));
	return {
		campaign: {
			paused: input.paused,
			publishingEnabled: input.publishingEnabled,
			started: input.started,
			remaining: input.remaining,
			nextSlotAt: input.paused ? null : input.nextSlotAt,
			capacitySlotAt: input.nextSlotAt,
			weeklyMaximum: input.weeklyMaximum,
			state: input.paused ? 'paused' : blocked.length ? 'blocked' : 'active',
		},
		metrics: {
			approved: approved.length,
			production: producing.length,
			review: review.length,
			scheduled: scheduled.length,
			published: published.length,
			attention: blocked.length + failed.length,
			indexed: input.indexed ?? null,
		},
		actions: actions.slice(0, 8),
		pipeline,
		activity,
		failures: failed.map((job) => ({ id: `job:${job.id}:failed`, title: titleFor(job), detail: job.error || job.note || 'The job failed. It does not use a weekly slot.', href: job.articleId ? `/content/articles/${job.articleId}` : '/campaigns#production' })),
	};
}
