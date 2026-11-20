import { sameSearchIntent } from './lanes';
import type { ContentOpportunity, ProductionJob, ProductionStage } from './types';

export type OpportunityPhase =
	| 'discovered'
	| 'awaiting_review'
	| 'approved_for_production'
	| 'queued'
	| 'researching'
	| 'writing'
	| 'editing'
	| 'awaiting_article_approval'
	| 'published'
	| 'deferred'
	| 'rejected'
	| 'archived';

export const PHASE_LABEL: Record<OpportunityPhase, string> = {
	discovered: 'Discovered',
	awaiting_review: 'Awaiting review',
	approved_for_production: 'Approved for production',
	queued: 'Queued',
	researching: 'Researching',
	writing: 'Writing',
	editing: 'Editing',
	awaiting_article_approval: 'Awaiting article approval',
	published: 'Published',
	deferred: 'Deferred',
	rejected: 'Rejected',
	archived: 'Archived',
};

const RESEARCH: ProductionStage[] = ['research', 'brief'];
const WRITING: ProductionStage[] = ['draft'];
const EDITING: ProductionStage[] = ['editorial', 'corrections', 'seo', 'hero', 'quality'];

export function opportunityKind(row: ContentOpportunity, publishedTitles: string[] = []): 'new' | 'refresh' {
	if (row.recommendedAction === 'update' || row.recommendedAction === 'reject') return 'refresh';
	if (publishedTitles.some((title) => sameSearchIntent(title, row.title))) return 'refresh';
	return 'new';
}

export function presentOpportunity(input: {
	opportunity: ContentOpportunity;
	job?: ProductionJob | null;
	articlePublished?: boolean;
	campaignPaused?: boolean;
}): { phase: OpportunityPhase; label: string; stage: string | null; next: string } {
	const { opportunity, job } = input;
	if (input.articlePublished) {
		return { phase: 'published', label: PHASE_LABEL.published, stage: job?.stage ?? null, next: 'This article is already live. The worker will not regenerate or overwrite it.' };
	}
	if (opportunity.status === 'rejected') return { phase: 'rejected', label: PHASE_LABEL.rejected, stage: null, next: 'Rejected. It will not enter production.' };
	if (opportunity.status === 'deferred') return { phase: 'deferred', label: PHASE_LABEL.deferred, stage: null, next: 'Deferred. It stays out of production until you approve it.' };
	if (opportunity.status === 'archived') return { phase: 'archived', label: PHASE_LABEL.archived, stage: null, next: 'Archived. The evidence is kept.' };
	if (job?.status === 'ready_for_approval') {
		return { phase: 'awaiting_article_approval', label: PHASE_LABEL.awaiting_article_approval, stage: job.stage, next: 'The unpublished draft is waiting for you. Nothing is published from this queue.' };
	}
	if (job && (job.status === 'queued' || job.status === 'running' || job.status === 'paused')) {
		const phase: OpportunityPhase = job.status === 'queued' && job.attempt === 0 ? 'queued' : RESEARCH.includes(job.stage) ? 'researching' : WRITING.includes(job.stage) ? 'writing' : EDITING.includes(job.stage) ? 'editing' : 'queued';
		const next = input.campaignPaused
			? 'The campaign is paused, so the daily worker will not advance this job.'
			: job.status === 'queued' && job.attempt === 0
				? 'Queued. The daily worker runs at 05:00 UTC. No completion time is estimated.'
				: `The job is in ${job.stage}. No completion time is estimated.`;
		return { phase, label: PHASE_LABEL[phase], stage: job.stage, next };
	}
	if (opportunity.status === 'approved' || opportunity.status === 'in_production') {
		return {
			phase: 'approved_for_production',
			label: PHASE_LABEL.approved_for_production,
			stage: null,
			next: input.campaignPaused
				? 'Approved. Production does not start while the campaign is paused. Resume turns the daily worker on. It runs at 05:00 UTC and does not publish.'
				: 'Approved. The daily worker runs at 05:00 UTC. No completion time is estimated, and it does not publish.',
		};
	}
	if (opportunity.status === 'needs_research' || opportunity.scoreDetail.promotionBlocked || opportunity.recommendedAction === 'research') {
		return { phase: 'discovered', label: PHASE_LABEL.discovered, stage: null, next: 'More evidence is required before this can be approved.' };
	}
	return { phase: 'awaiting_review', label: PHASE_LABEL.awaiting_review, stage: null, next: 'Waiting for you to approve, defer, or reject it. Approving does not start production while the campaign is paused.' };
}
