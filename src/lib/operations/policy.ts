import { productionCapacity, selectProductionOpportunities } from '@/lib/campaigns/productionPolicy';
import type { ApprovalMode, ContentOpportunity, ProductionJob, ProductionStage } from '@/lib/campaigns/types';
import { autopilotMayPublish } from '@/lib/operations/autopilot';

export type OperatingMode = 'assisted' | 'autonomous_approval' | 'autonomous_publishing';

export type OperationLifecycle =
	| 'discovered'
	| 'prioritised'
	| 'researching'
	| 'research_complete'
	| 'drafting'
	| 'editorial_review'
	| 'correcting'
	| 'quality_validation'
	| 'ready_for_publication'
	| 'scheduled'
	| 'publishing'
	| 'published'
	| 'monitoring'
	| 'failed'
	| 'blocked'
	| 'awaiting_approval'
	| 'budget_exceeded'
	| 'needs_human_review';

export type BrandOperationPolicy = {
	mode: OperatingMode;
	/** Brand-level switch. Autonomous publishing stays off until the owner turns this on. */
	autonomousPublishingEnabled: boolean;
	weeklyMaximum: number;
	maxConcurrentJobs: number;
	maxCostUsdPerArticle: number;
	maxCorrectionAttempts: number;
	allowPublishedUpdates: boolean;
	paused: boolean;
	themes: string[];
	/** Weekday numbers in publishingTimezone. Absent means the existing campaign is not restricted to particular days. */
	publishingDays?: number[];
	publishingTimezone?: string;
	lengthMinWords?: number;
	lengthMaxWords?: number;
	indexingMonitoring?: boolean;
	performanceMonitoring?: boolean;
	minimumScore?: number;
};

export const FOLIAN_PILOT_THEMES = [
	'Novel planning',
	'Story continuity',
	'Writing workflows',
	'AI-assisted writing',
	'Writing software comparisons',
] as const;

export const FOLIAN_PILOT_POLICY: BrandOperationPolicy = {
	mode: 'autonomous_approval',
	autonomousPublishingEnabled: false,
	weeklyMaximum: 3,
	maxConcurrentJobs: 1,
	maxCostUsdPerArticle: 1,
	maxCorrectionAttempts: 3,
	allowPublishedUpdates: false,
	paused: true,
	themes: [...FOLIAN_PILOT_THEMES],
};

export function operatingMode(approvalMode: ApprovalMode, stored?: Partial<BrandOperationPolicy> | null): OperatingMode {
	if (stored?.mode === 'assisted' || stored?.mode === 'autonomous_approval' || stored?.mode === 'autonomous_publishing') return stored.mode;
	return approvalMode === 'auto_draft' ? 'autonomous_approval' : 'assisted';
}

export function normaliseOperationPolicy(input: {
	approvalMode: ApprovalMode;
	weeklyCapacity: number;
	status: 'draft' | 'active' | 'paused';
	themes: string[];
	stored?: Partial<BrandOperationPolicy> | null;
}): BrandOperationPolicy {
	const mode = operatingMode(input.approvalMode, input.stored);
	return {
		mode,
		autonomousPublishingEnabled: input.stored?.autonomousPublishingEnabled === true && mode === 'autonomous_publishing',
		weeklyMaximum: clampNumber(input.stored?.weeklyMaximum, input.weeklyCapacity, 0, 14),
		maxConcurrentJobs: clampNumber(input.stored?.maxConcurrentJobs, 1, 1, 3),
		maxCostUsdPerArticle: clampNumber(input.stored?.maxCostUsdPerArticle, 1, 0.1, 5),
		maxCorrectionAttempts: clampNumber(input.stored?.maxCorrectionAttempts, 3, 1, 5),
		allowPublishedUpdates: input.stored?.allowPublishedUpdates === true,
		paused: input.status !== 'active' || input.stored?.paused === true,
		themes: input.stored?.themes?.length ? input.stored.themes.slice(0, 12) : input.themes,
		publishingDays: cleanDays(input.stored?.publishingDays),
		publishingTimezone: typeof input.stored?.publishingTimezone === 'string' ? input.stored.publishingTimezone : undefined,
		lengthMinWords: optionalBound(input.stored?.lengthMinWords, 300, 4000),
		lengthMaxWords: optionalBound(input.stored?.lengthMaxWords, 300, 6000),
		indexingMonitoring: input.stored?.indexingMonitoring === true,
		performanceMonitoring: input.stored?.performanceMonitoring === true,
		minimumScore: optionalBound(input.stored?.minimumScore, 0, 1),
	};
}

function cleanDays(value: unknown): number[] | undefined {
	if (!Array.isArray(value)) return undefined;
	const days = [...new Set(value.filter((day): day is number => Number.isInteger(day) && day >= 0 && day <= 6))];
	return days.length ? days : undefined;
}

function optionalBound(value: unknown, min: number, max: number): number | undefined {
	if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
	return Math.min(max, Math.max(min, value));
}

function clampNumber(value: unknown, fallback: number, min: number, max: number): number {
	const numeric = typeof value === 'number' && Number.isFinite(value) ? value : fallback;
	return Math.min(max, Math.max(min, numeric));
}

export function lifecycleFor(input: {
	job: Pick<ProductionJob, 'stage' | 'status' | 'costUsd' | 'stageLog'> | null;
	opportunityStatus?: string;
	policy: Pick<BrandOperationPolicy, 'maxCostUsdPerArticle'>;
	publication?: 'scheduled' | 'publishing' | 'published' | 'verified_live' | null;
}): OperationLifecycle {
	if (input.publication === 'verified_live' || input.publication === 'published') return 'monitoring';
	if (input.publication === 'publishing') return 'publishing';
	if (input.publication === 'scheduled') return 'scheduled';
	if (!input.job) {
		if (input.opportunityStatus === 'approved' || input.opportunityStatus === 'in_production') return 'prioritised';
		return 'discovered';
	}
	if (input.job.costUsd >= input.policy.maxCostUsdPerArticle) return 'budget_exceeded';
	if (input.job.status === 'failed') return 'failed';
	if (input.job.status === 'paused') return 'blocked';
	if (input.job.status === 'needs_attention') return 'needs_human_review';
	if (input.job.status === 'ready_for_approval' || input.job.stage === 'approval') return 'awaiting_approval';
	if (input.job.status === 'completed') return 'ready_for_publication';
	return stageLifecycle(input.job.stage, input.job.stageLog.some((entry) => entry.stage === 'research'));
}

function stageLifecycle(stage: ProductionStage, researchLogged: boolean): OperationLifecycle {
	if (stage === 'research') return researchLogged ? 'research_complete' : 'researching';
	if (stage === 'brief' || stage === 'draft') return 'drafting';
	if (stage === 'editorial') return 'editorial_review';
	if (stage === 'corrections') return 'correcting';
	return 'quality_validation';
}

export type PublicationPolicyInput = {
	topicRelevant: boolean;
	researchApproved: boolean;
	articleComplete: boolean;
	factualClaimsVerified: boolean;
	productClaimsVerified: boolean;
	criticalOpen: number;
	majorOpen: number;
	blockingMinorOpen: number;
	substantialDuplicate: boolean;
	seoReady: boolean;
	categoryReady: boolean;
	heroReady: boolean;
	internalLinksValid: boolean;
	editorialReviewPassed: boolean;
	qualityScore?: number | null;
};

export function publicationPolicyDecision(input: PublicationPolicyInput): { allow: boolean; reasons: string[] } {
	const reasons: string[] = [];
	if (!input.topicRelevant) reasons.push('The topic is not relevant to the brand strategy.');
	if (!input.researchApproved) reasons.push('Approved research is required.');
	if (!input.articleComplete) reasons.push('The article is incomplete.');
	if (!input.factualClaimsVerified) reasons.push('Factual claims are not verified.');
	if (!input.productClaimsVerified) reasons.push('Product claims are not verified.');
	if (input.criticalOpen > 0) reasons.push('Critical findings are still open.');
	if (input.majorOpen > 0) reasons.push('Major findings are still open.');
	if (input.blockingMinorOpen > 0) reasons.push('Publication-blocking minor findings are still open.');
	if (input.substantialDuplicate) reasons.push('The article substantially duplicates existing content.');
	if (!input.seoReady) reasons.push('SEO metadata is incomplete.');
	if (!input.categoryReady) reasons.push('A destination category is required.');
	if (!input.heroReady) reasons.push('A verified hero image is required.');
	if (!input.internalLinksValid) reasons.push('Internal links are not valid.');
	if (!input.editorialReviewPassed) reasons.push('The final editorial review has not passed.');
	return { allow: reasons.length === 0, reasons };
}

export type TickAction =
	| { type: 'skip'; reason: 'paused' | 'assisted' | 'lease_held' | 'capacity' | 'concurrency' | 'budget' }
	| { type: 'discover' }
	| { type: 'start'; opportunityId: string }
	| { type: 'resume'; jobId: string }
	| { type: 'advance'; jobId: string }
	| { type: 'hold_publish'; jobId: string; reason: string }
	| { type: 'hold_update'; jobId: string }
	| { type: 'publish'; articleId: string };

export function planOperationTick(input: {
	policy: BrandOperationPolicy;
	leaseHeld: boolean;
	opportunities: ContentOpportunity[];
	jobs: ProductionJob[];
	now?: number;
	staleAfterMs?: number;
	publishable?: Array<{ articleId: string; jobId: string; policyAllows: boolean; approved: boolean; alreadyLive?: boolean }>;
}): TickAction[] {
	if (input.leaseHeld) return [{ type: 'skip', reason: 'lease_held' }];
	if (input.policy.paused) return [{ type: 'skip', reason: 'paused' }];
	if (input.policy.mode === 'assisted') return [{ type: 'skip', reason: 'assisted' }];
	const now = input.now ?? Date.now();
	const staleAfter = input.staleAfterMs ?? 20 * 60 * 1000;
	const actions: TickAction[] = [{ type: 'discover' }];
	const publishedUpdate = (job: ProductionJob) => !input.policy.allowPublishedUpdates && input.opportunities.some((item) => item.id === job.opportunityId && item.recommendedAction === 'update');
	for (const job of input.jobs) {
		if ((job.status === 'queued' || job.status === 'running') && publishedUpdate(job)) {
			actions.push({ type: 'hold_update', jobId: job.id });
		}
	}
	const active = input.jobs.filter((job) => (job.status === 'queued' || job.status === 'running') && !publishedUpdate(job));
	for (const job of input.jobs) {
		if (publishedUpdate(job)) continue;
		if (job.status === 'running' && now - new Date(job.updatedAt).getTime() > staleAfter) {
			actions.push({ type: 'resume', jobId: job.id });
		}
		if (job.costUsd >= input.policy.maxCostUsdPerArticle && (job.status === 'queued' || job.status === 'running')) {
			actions.push({ type: 'skip', reason: 'budget' });
		}
	}
	const resumable = input.jobs.find((job) => !publishedUpdate(job) && (job.status === 'queued' || (job.status === 'running' && now - new Date(job.updatedAt).getTime() > staleAfter)));
	const withinBudget = resumable && resumable.costUsd < input.policy.maxCostUsdPerArticle;
	if (withinBudget && resumable) actions.push({ type: 'advance', jobId: resumable.id });
	const capacity = productionCapacity(input.jobs, now, input.policy.weeklyMaximum);
	const remaining = capacity.remaining;
	const concurrent = active.length;
	if (concurrent < input.policy.maxConcurrentJobs && remaining > 0 && !withinBudget) {
		const chosen = selectProductionOpportunities({
			opportunities: input.opportunities.filter((item) => input.policy.allowPublishedUpdates || item.recommendedAction !== 'update'),
			opportunityIdsInProduction: input.jobs.map((job) => job.opportunityId),
			remaining: 1,
		});
		if (chosen[0]) actions.push({ type: 'start', opportunityId: chosen[0].id });
		else actions.push({ type: 'skip', reason: 'capacity' });
	} else if (concurrent >= input.policy.maxConcurrentJobs) {
		actions.push({ type: 'skip', reason: 'concurrency' });
	}
	for (const item of input.publishable ?? []) {
		if (item.alreadyLive) {
			actions.push({ type: 'hold_publish', jobId: item.jobId, reason: 'Payload already has this article live. It was not published or overwritten.' });
			continue;
		}
		const decision = autopilotMayPublish({
			paused: input.policy.paused,
			mode: input.policy.mode,
			autonomousPublishingEnabled: input.policy.autonomousPublishingEnabled,
			approved: item.approved,
			policyAllows: item.policyAllows,
			publishingDays: input.policy.publishingDays,
			publishingTimezone: input.policy.publishingTimezone,
			now: new Date(now),
		});
		if (!decision.allow) {
			actions.push({ type: 'hold_publish', jobId: item.jobId, reason: decision.reason });
			continue;
		}
		actions.push({ type: 'publish', articleId: item.articleId });
	}
	return actions;
}

export function articlePolicyInput(article: {
	body: string;
	wordCount: number;
	categories?: string[];
	approval: { status: string };
	seo?: { title?: string | null; description?: string | null };
	workspace?: {
		research?: { status?: string | null } | null;
		media?: { deliveryVerified?: boolean | null } | null;
		editorial?: { findings?: Array<{ decision?: string; severity?: string; code?: string }> | null } | null;
	} | null;
}): PublicationPolicyInput {
	const findings = article.workspace?.editorial?.findings ?? [];
	const open = findings.filter((finding) => finding.decision === 'pending');
	const blockingMinor = new Set(['intro-weak', 'opening-guide', 'definition-thin', 'cta-weak', 'answers-indirect', 'example-conflict', 'missing_destination_resource']);
	return {
		topicRelevant: article.body.trim().length > 0,
		researchApproved: article.workspace?.research?.status === 'approved',
		articleComplete: article.wordCount >= 600,
		factualClaimsVerified: !open.some((finding) => finding.severity === 'critical' && /FACT|ACCURACY|CITATION|SOURCE/i.test(finding.code ?? '')),
		productClaimsVerified: !open.some((finding) => /PRODUCT/i.test(finding.code ?? '')),
		criticalOpen: open.filter((finding) => finding.severity === 'critical').length,
		majorOpen: open.filter((finding) => finding.severity === 'major').length,
		blockingMinorOpen: open.filter((finding) => finding.severity === 'minor' && blockingMinor.has(finding.code ?? '')).length,
		substantialDuplicate: open.some((finding) => finding.code === 'near_duplicate_sentences'),
		seoReady: Boolean(article.seo?.title && article.seo?.description),
		categoryReady: Boolean(article.categories?.length),
		heroReady: article.workspace?.media?.deliveryVerified === true,
		internalLinksValid: !open.some((finding) => finding.code === 'missing_required_link'),
		editorialReviewPassed: article.approval.status === 'approved' && !open.some((finding) => finding.severity === 'critical' || finding.severity === 'major'),
	};
}

export function performanceSignals(opportunities: ContentOpportunity[]): Array<{ opportunityId: string; title: string; kind: 'refresh' | 'emerging'; reason: string }> {
	const signals: Array<{ opportunityId: string; title: string; kind: 'refresh' | 'emerging'; reason: string }> = [];
	for (const opportunity of opportunities) {
		const measured = opportunity.evidence.find((item) => item.metrics && item.metrics.scope !== 'page')?.metrics;
		if (!measured) continue;
		if (measured.impressions >= 20 && measured.ctr < 0.03) {
			signals.push({ opportunityId: opportunity.id, title: opportunity.title, kind: 'refresh', reason: `${measured.impressions} impressions and a ${(measured.ctr * 100).toFixed(1)}% click rate. A person must approve any change to the published article.` });
		} else if (measured.impressions >= 5 && opportunity.status === 'discovered') {
			signals.push({ opportunityId: opportunity.id, title: opportunity.title, kind: 'emerging', reason: `${measured.impressions} observed impressions. This is not keyword volume.` });
		}
	}
	return signals;
}
