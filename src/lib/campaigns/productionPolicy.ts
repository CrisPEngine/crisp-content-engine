import { sameSearchIntent } from './lanes';
import { planEditorialSelection } from '@/lib/operations/autopilot';
import { optimisationScope } from './scoring';
import type { ContentOpportunity, ProductionWorkType } from './types';

const UNSAFE_CATEGORIES = new Set(['accuracy', 'research', 'product', 'citations', 'brand']);
const TARGETED_CATEGORIES = new Set(['examples', 'structure', 'repetition', 'writing', 'seo', 'usefulness']);
const MATERIAL_FINDINGS = new Set(['intro-weak', 'opening-guide', 'definition-thin', 'cta-weak', 'answers-indirect', 'example-conflict']);

export type EditorialWork = {
	acceptIds: string[];
	escalate: string | null;
};

export function classifyEditorialWork(input: {
	proposals: Array<{ id: string; status: string; needsResearch?: boolean; needsBrandVerification?: boolean; sourceFindingId?: string | null }>;
	findings: Array<{ id: string; severity: string; category: string; status: string }>;
	correctionAttempts: number;
	maxCorrections?: number;
}): EditorialWork {
	const maxCorrections = input.maxCorrections ?? 2;
	const openCritical = input.findings.filter((finding) => finding.status === 'open' && finding.severity === 'critical');
	const unsafe = openCritical.filter((finding) => UNSAFE_CATEGORIES.has(finding.category));
	if (unsafe.length) {
		return { acceptIds: [], escalate: `${unsafe.length} critical finding${unsafe.length === 1 ? '' : 's'} need a person: ${unsafe.map((finding) => finding.category).join(', ')}.` };
	}
	if (input.correctionAttempts >= maxCorrections) {
		return { acceptIds: [], escalate: 'The automatic correction limit is used. A person needs to review the remaining findings.' };
	}
	const acceptIds = input.proposals.filter((proposal) => {
		if (proposal.status !== 'proposed') return false;
		if (proposal.needsResearch || proposal.needsBrandVerification) return false;
		const finding = input.findings.find((item) => item.id === proposal.sourceFindingId);
		if (!finding || finding.status !== 'open' || UNSAFE_CATEGORIES.has(finding.category)) return false;
		if (MATERIAL_FINDINGS.has(finding.id) || finding.severity === 'minor') return true;
		return TARGETED_CATEGORIES.has(finding.category);
	}).map((proposal) => proposal.id);
	if (openCritical.length && acceptIds.length === 0) {
		return { acceptIds: [], escalate: `${openCritical.length} critical finding${openCritical.length === 1 ? '' : 's'} remain. Automatic correction did not cover them.` };
	}
	return { acceptIds, escalate: null };
}

export function remainingCapacity(weeklyCapacity: number, startedThisWeek: number): number {
	return Math.max(0, Math.floor(weeklyCapacity) - Math.max(0, startedThisWeek));
}

export function workTypeForOpportunity(input: { recommendedAction: string; evidence?: Array<{ metrics: { position: number; ctr: number; impressions: number; clicks?: number; scope?: 'query' | 'page' } | null }> }): ProductionWorkType {
	if (input.recommendedAction !== 'update') return 'new_article';
	const measured = input.evidence?.find((item) => item.metrics)?.metrics ?? null;
	const scope = optimisationScope(measured ? { impressions: measured.impressions, clicks: measured.clicks ?? 0, ctr: measured.ctr, position: measured.position, startDate: '', endDate: '', scope: measured.scope } : null);
	return scope === 'section' || scope === 'expansion' ? 'content_improvement' : 'metadata';
}

export function countsAsArticleStart(job: { status: string; workType?: string; stageLog?: Array<{ workType?: string }> }): boolean {
	if (job.status === 'failed') return false;
	const workType = job.workType ?? job.stageLog?.find((item) => item.workType)?.workType;
	return workType !== 'metadata';
}

export function productionCapacity(jobs: Array<{ createdAt: string; status: string; workType?: string; stageLog?: Array<{ workType?: string }> }>, now: number, weeklyMaximum: number): { started: number; failed: number; completed: number; remaining: number; nextSlotAt: string | null } {
	const weekAgo = now - 7 * 24 * 60 * 60 * 1000;
	const recent = jobs.filter((job) => new Date(job.createdAt).getTime() >= weekAgo);
	const failed = recent.filter((job) => job.status === 'failed');
	const counted = recent.filter((job) => countsAsArticleStart(job));
	const completed = counted.filter((job) => job.status === 'completed' || job.status === 'ready_for_approval');
	const remaining = remainingCapacity(weeklyMaximum, counted.length);
	const nextSlotAt = remaining > 0 || !counted.length
		? null
		: new Date(Math.min(...counted.map((job) => new Date(job.createdAt).getTime())) + 7 * 24 * 60 * 60 * 1000).toISOString();
	return { started: counted.length, failed: failed.length, completed: completed.length, remaining, nextSlotAt };
}

export function productionHoldReason(input: { paused: boolean; remaining: number; concurrent: number; maxConcurrent: number; nextSlotAt: string | null }): string {
	if (input.paused) return 'The campaign is paused. Resume turns on the daily worker at 05:00 UTC. It does not publish.';
	if (input.concurrent >= input.maxConcurrent) return 'Another article is already in production. Only one runs at a time.';
	if (input.remaining <= 0) return `The weekly production limit is used. The next open slot is ${input.nextSlotAt ?? 'after a counted job is older than seven days'}. Failed jobs do not use a slot.`;
	return 'Approved. The daily worker can start it at 05:00 UTC. No completion time is estimated.';
}

export function selectProductionOpportunities(input: {
	opportunities: ContentOpportunity[];
	opportunityIdsInProduction: string[];
	remaining: number;
	minimumScore?: number;
	takenTopicKeys?: string[];
}): ContentOpportunity[] {
	if (input.remaining <= 0) return [];
	const used = new Set(input.opportunityIdsInProduction);
	const active = input.opportunities.filter((item) => used.has(item.id));
	const eligible = input.opportunities
		.filter((item) => item.status === 'approved' && (item.recommendedAction === 'create' || item.recommendedAction === 'update') && !item.scoreDetail.promotionBlocked && item.demandClass !== 'unvalidated' && !used.has(item.id))
		.filter((item) => !active.some((existing) => sameSearchIntent(existing.title, item.title)));
	const plan = planEditorialSelection({
		target: input.remaining,
		minimumScore: typeof input.minimumScore === 'number' ? input.minimumScore : 0,
		takenTopicKeys: input.takenTopicKeys ?? [],
		candidates: eligible.map((item) => ({
			id: item.id,
			score: item.score,
			approved: true,
			topicKey: item.title,
			overlapping: false,
		})),
	});
	const byId = new Map(eligible.map((item) => [item.id, item]));
	return plan.selected.map((id) => byId.get(id)).filter((item): item is ContentOpportunity => Boolean(item));
}
