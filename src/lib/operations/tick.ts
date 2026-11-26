import { discoverOpportunities } from '@/lib/campaigns/service';
import { getOpportunityRepository } from '@/lib/campaigns/repository';
import { progressProductionJob, startProductionJob } from '@/lib/campaigns/workflow';
import type { ContentCampaign } from '@/lib/campaigns/types';
import { getSupabaseService } from '@/lib/supabaseService';
import { autopilotLabel } from '@/lib/operations/autopilot';
import { articlePolicyInput, normaliseOperationPolicy, performanceSignals, planOperationTick, publicationPolicyDecision, type TickAction } from '@/lib/operations/policy';

const WORKER = 'content-operations';

export type OperationTickResult = {
	ok: boolean;
	published: false;
	lease: 'acquired' | 'held' | 'unavailable';
	actions: TickAction[];
	errors: string[];
	continueWork: boolean;
};

export async function runOperationsTick(now = Date.now()): Promise<OperationTickResult> {
	const lease = await acquireLease(now);
	if (lease === 'held') return { ok: true, published: false, lease, actions: [{ type: 'skip', reason: 'lease_held' }], errors: [], continueWork: false };
	if (lease === 'unavailable') return { ok: false, published: false, lease, actions: [], errors: ['The operation lease table is not available, so no campaign was started.'], continueWork: false };
	const errors: string[] = [];
	const actions: TickAction[] = [];
	let continueWork = false;
	const deadline = now + 210_000;
	try {
		const campaigns = await listActiveCampaigns();
		for (const campaign of campaigns) {
			const policy = campaign.operation ?? normaliseOperationPolicy({ approvalMode: campaign.approvalMode, weeklyCapacity: campaign.weeklyCapacity, status: campaign.status, themes: campaign.themes, stored: null });
			const repository = getOpportunityRepository();
			const [opportunities, jobs] = await Promise.all([
				repository.list(campaign.ownerUserId, campaign.brandId),
				repository.listJobs(campaign.ownerUserId, campaign.brandId),
			]);
			const planned = planOperationTick({ policy, leaseHeld: false, opportunities, jobs, now, publishable: await publishableArticles(campaign, policy, jobs) });
			actions.push(...planned);
			for (const action of planned) {
				try {
					const outcome = await executeAction(campaign, action, deadline);
					if (outcome.continueWork) continueWork = true;
				} catch (error) {
					errors.push(error instanceof Error ? error.message : 'An operation action failed.');
				}
			}
		}
		for (const campaign of campaigns) {
			const jobs = await getOpportunityRepository().listJobs(campaign.ownerUserId, campaign.brandId);
			const { rememberRemotePublication } = await import('@/lib/publishing/reconcile');
			for (const job of jobs.filter((item) => item.articleId).slice(0, 5)) {
				await rememberRemotePublication(campaign.ownerUserId, job.articleId!).catch(() => null);
			}
		}
		await rememberRun(actions, errors);
		return { ok: errors.length === 0, published: false, lease, actions, errors, continueWork };
	} finally {
		await releaseLease();
	}
}

async function publishableArticles(campaign: ActiveCampaign, policy: NonNullable<ActiveCampaign['operation']>, jobs: import('@/lib/campaigns/types').ProductionJob[]) {
	if (!policy.autonomousPublishingEnabled || policy.mode !== 'autonomous_publishing') return [];
	const { getNativeContentStore } = await import('@/lib/media/store');
	const store = getNativeContentStore();
	const rows = [];
	for (const job of jobs) {
		if (!job.articleId || job.status !== 'ready_for_approval') continue;
		const article = await store.getArticle(campaign.ownerUserId, job.articleId);
		if (!article) continue;
		const publicationState = article.library?.publication?.state;
		const remoteStatus = article.workspace?.cms?.remoteStatus;
		rows.push({
			articleId: article.id,
			jobId: job.id,
			policyAllows: publicationPolicyDecision(articlePolicyInput(article)).allow,
			approved: article.approval.status === 'approved',
			alreadyLive: publicationState === 'verified_live' || publicationState === 'published' || remoteStatus === 'published',
		});
	}
	return rows;
}

async function executeAction(campaign: ActiveCampaign, action: TickAction, deadline: number): Promise<{ continueWork: boolean }> {
	if (action.type === 'discover') {
		const failures: string[] = [];
		await discoverOpportunities(campaign.ownerUserId, { brandId: campaign.brandId, source: 'search_console' }).catch((error: unknown) => {
			failures.push(error instanceof Error ? error.message : 'Search Console discovery failed.');
		});
		await discoverOpportunities(campaign.ownerUserId, { brandId: campaign.brandId, source: 'pillars' }).catch((error: unknown) => {
			failures.push(error instanceof Error ? error.message : 'Pillar discovery failed.');
		});
		const { approveDistinctShortlist } = await import('@/lib/campaigns/service');
		await approveDistinctShortlist(campaign.ownerUserId, campaign.brandId).catch((error: unknown) => {
			failures.push(error instanceof Error ? error.message : 'Opportunity selection failed.');
		});
		if (failures.length) throw new Error(failures.join(' '));
		return { continueWork: false };
	}
	if (action.type === 'start') {
		await startProductionJob(campaign.ownerUserId, action.opportunityId, campaign.id);
		return { continueWork: false };
	}
	if (action.type === 'resume' || (action.type === 'skip' && action.reason === 'budget')) {
		const repository = getOpportunityRepository();
		const jobs = await repository.listJobs(campaign.ownerUserId, campaign.brandId);
		const policy = campaign.operation;
		for (const job of jobs) {
			if (action.type === 'resume' && job.id === action.jobId && job.status === 'running') {
				job.status = 'queued';
				job.note = 'Resumed after an interrupted run. The completed stages were not repeated.';
				await repository.saveJob(campaign.ownerUserId, job);
			}
			if (action.type === 'skip' && policy && job.costUsd >= policy.maxCostUsdPerArticle && (job.status === 'queued' || job.status === 'running')) {
				job.status = 'needs_attention';
				job.error = 'The article budget is used. A person needs to review it.';
				job.note = job.error;
				await repository.saveJob(campaign.ownerUserId, job);
			}
		}
		return { continueWork: false };
	}
	if (action.type === 'hold_update') {
		const repository = getOpportunityRepository();
		const jobs = await repository.listJobs(campaign.ownerUserId, campaign.brandId);
		const job = jobs.find((item) => item.id === action.jobId);
		if (job && (job.status === 'queued' || job.status === 'running')) {
			job.status = 'needs_attention';
			job.error = 'This article is already published. The worker did not update it.';
			job.note = job.error;
			await repository.saveJob(campaign.ownerUserId, job);
		}
		return { continueWork: false };
	}
	if (action.type === 'advance') {
		const job = await progressProductionJob(campaign.ownerUserId, action.jobId, { deadlineMs: deadline, maxCostUsd: campaign.operation?.maxCostUsdPerArticle });
		return { continueWork: job.status === 'queued' || job.status === 'running' };
	}
	if (action.type === 'publish') {
		const { guardedArticlePublish } = await import('@/lib/publishing/publishArticle');
		await guardedArticlePublish(campaign.ownerUserId, action.articleId, true);
	}
	return { continueWork: false };
}

type ActiveCampaign = ContentCampaign & { ownerUserId: string };

async function listActiveCampaigns(): Promise<ActiveCampaign[]> {
	const { data, error } = await getSupabaseService().from('content_campaigns').select('*').eq('status', 'active');
	if (error) throw new Error(error.message);
	return (data ?? []).map((row) => {
		const campaign = {
			id: String(row.id),
			brandId: String(row.brand_id),
			name: String(row.name),
			objective: String(row.objective ?? ''),
			audience: String(row.audience ?? ''),
			themes: Array.isArray(row.themes) ? row.themes.filter((item: unknown): item is string => typeof item === 'string') : [],
			weeklyCapacity: Number(row.weekly_capacity ?? 0),
			selectionPolicy: String(row.selection_policy ?? 'evidence_required'),
			approvalMode: row.approval_mode === 'auto_draft' || row.approval_mode === 'auto_publish' ? row.approval_mode : 'assisted',
			autoPublishEnabled: false as const,
			destinationId: typeof row.destination_id === 'string' ? row.destination_id : null,
			status: 'active' as const,
			createdAt: String(row.created_at),
			updatedAt: String(row.updated_at),
			ownerUserId: String(row.user_id),
		};
		return {
			...campaign,
			operation: normaliseOperationPolicy({
				approvalMode: campaign.approvalMode,
				weeklyCapacity: campaign.weeklyCapacity,
				status: 'active',
				themes: campaign.themes,
				stored: row.quality_policy && typeof row.quality_policy === 'object' ? row.quality_policy : null,
			}),
		};
	});
}

async function acquireLease(now: number): Promise<'acquired' | 'held' | 'unavailable'> {
	const supabase = getSupabaseService();
	const until = new Date(now + 15 * 60 * 1000).toISOString();
	const current = await supabase.from('content_operation_leases').select('leased_until').eq('worker', WORKER).maybeSingle();
	if (current.error) return 'unavailable';
	if (current.data && new Date(String(current.data.leased_until)).getTime() > now) return 'held';
	if (!current.data) {
		const inserted = await supabase.from('content_operation_leases').insert({ worker: WORKER, owner: crypto.randomUUID(), leased_until: until });
		return inserted.error ? 'unavailable' : 'acquired';
	}
	const updated = await supabase.from('content_operation_leases').update({ owner: crypto.randomUUID(), leased_until: until, updated_at: new Date(now).toISOString() }).eq('worker', WORKER).lte('leased_until', new Date(now).toISOString()).select('worker');
	if (updated.error) return 'unavailable';
	return updated.data?.length ? 'acquired' : 'held';
}

async function releaseLease(): Promise<void> {
	await getSupabaseService().from('content_operation_leases').update({ leased_until: new Date(0).toISOString(), updated_at: new Date().toISOString() }).eq('worker', WORKER);
}

async function rememberRun(actions: TickAction[], errors: string[]): Promise<void> {
	await getSupabaseService().from('publish_worker_heartbeats').upsert({
		worker: WORKER,
		last_run_at: new Date().toISOString(),
		last_ok: errors.length === 0,
		last_error: errors[0] ?? null,
		last_processed: actions.filter((action) => action.type === 'advance' || action.type === 'start').length,
		updated_at: new Date().toISOString(),
	});
}

export function operationSummary(input: { campaigns: ContentCampaign[]; jobs: import('@/lib/campaigns/types').ProductionJob[]; opportunities: import('@/lib/campaigns/types').ContentOpportunity[] }) {
	const campaign = input.campaigns.find((item) => item.status === 'active') ?? input.campaigns[0] ?? null;
	const policy = campaign?.operation ?? null;
	return {
		mode: policy?.mode ?? 'assisted',
		label: autopilotLabel({ paused: policy?.paused ?? true, mode: policy?.mode ?? 'assisted', autonomousPublishingEnabled: false }),
		paused: policy?.paused ?? true,
		autonomousPublishingEnabled: false,
		publishingDays: policy?.publishingDays ?? [],
		publishingTimezone: policy?.publishingTimezone ?? null,
		indexingMonitoring: policy?.indexingMonitoring === true,
		minimumScore: policy?.minimumScore ?? null,
		weeklyMaximum: policy?.weeklyMaximum ?? campaign?.weeklyCapacity ?? 0,
		maxCostUsdPerArticle: policy?.maxCostUsdPerArticle ?? 1,
		maxConcurrentJobs: policy?.maxConcurrentJobs ?? 1,
		themes: policy?.themes ?? [],
		discovered: input.opportunities.filter((item) => item.status === 'discovered').length,
		inProduction: input.jobs.filter((job) => job.status === 'queued' || job.status === 'running').length,
		awaitingApproval: input.jobs.filter((job) => job.status === 'ready_for_approval').length,
		attention: input.jobs.filter((job) => job.status === 'failed' || job.status === 'needs_attention' || job.status === 'paused').length,
		costUsd: Math.round(input.jobs.reduce((sum, job) => sum + job.costUsd, 0) * 10000) / 10000,
		signals: performanceSignals(input.opportunities).slice(0, 5),
	};
}
