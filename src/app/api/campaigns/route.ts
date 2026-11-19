import { NextResponse } from 'next/server';
import { archiveWeakOpportunities, CampaignError, createContentCampaign, decideOpportunity, discoverOpportunities, listContentOpportunities, recordContentOpportunity, rescoreStoredEvidence, testBrandAnalytics } from '@/lib/campaigns/service';
import { advanceProductionJob, revalidateMetadataJob, scheduleCampaign, startProductionJob } from '@/lib/campaigns/workflow';
import type { ApprovalMode, CampaignStatus, DemandClass, OpportunityStatus } from '@/lib/campaigns/types';
import { requireIntelligenceUser } from '@/lib/intelligence/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

function fail(error: unknown) {
	if (error instanceof CampaignError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
	const message = error instanceof Error ? error.message : 'Request failed';
	return NextResponse.json({ error: message }, { status: message === 'Unauthorized' ? 401 : 400 });
}

export async function GET(request: Request) {
	try {
		const { userId } = await requireIntelligenceUser();
		const brandId = new URL(request.url).searchParams.get('brandId') ?? '';
		if (!brandId) return NextResponse.json({ error: 'Choose a brand.' }, { status: 400 });
		const listed = await listContentOpportunities(userId, brandId);
		const { operationSummary } = await import('@/lib/operations/tick');
		return NextResponse.json({ ...listed, operations: operationSummary(listed) });
	} catch (error) {
		return fail(error);
	}
}

export async function POST(request: Request) {
	try {
		const { userId } = await requireIntelligenceUser();
		const body = (await request.json()) as Record<string, unknown>;
		const action = typeof body.action === 'string' ? body.action : '';
		const brandId = typeof body.brandId === 'string' ? body.brandId : '';
		if (action === 'record') {
			if (!brandId || typeof body.title !== 'string' || typeof body.audienceProblem !== 'string') {
				return NextResponse.json({ error: 'Brand, title, and audience problem are required.' }, { status: 400 });
			}
			const demandClass = body.demandClass === 'strategic' || body.demandClass === 'inferred' ? body.demandClass : 'unvalidated';
			const opportunity = await recordContentOpportunity(userId, {
				brandId,
				title: body.title,
				audienceProblem: body.audienceProblem,
				searchIntent: typeof body.searchIntent === 'string' ? body.searchIntent : undefined,
				demandClass: demandClass as DemandClass,
				sourceUrl: typeof body.sourceUrl === 'string' ? body.sourceUrl : undefined,
				excerpt: typeof body.excerpt === 'string' ? body.excerpt : undefined,
			});
			return NextResponse.json({ opportunity });
		}
		if (action === 'start_production') {
			if (typeof body.opportunityId !== 'string') return NextResponse.json({ error: 'Choose an opportunity.' }, { status: 400 });
			return NextResponse.json({ job: await startProductionJob(userId, body.opportunityId, typeof body.campaignId === 'string' ? body.campaignId : null) });
		}
		if (action === 'advance_production') {
			if (typeof body.jobId !== 'string') return NextResponse.json({ error: 'Choose a production job.' }, { status: 400 });
			return NextResponse.json({ job: await advanceProductionJob(userId, body.jobId) });
		}
		if (action === 'schedule_campaign') {
			if (!brandId || typeof body.campaignId !== 'string') return NextResponse.json({ error: 'Choose a campaign.' }, { status: 400 });
			return NextResponse.json(await scheduleCampaign(userId, brandId, body.campaignId));
		}
		if (action === 'test_analytics') {
			if (!brandId) return NextResponse.json({ error: 'Choose a brand.' }, { status: 400 });
			const test = await testBrandAnalytics(userId, brandId, {
				startDate: typeof body.startDate === 'string' ? body.startDate : undefined,
				endDate: typeof body.endDate === 'string' ? body.endDate : undefined,
			});
			return NextResponse.json({ test });
		}
		if (action === 'archive_ids' && Array.isArray(body.ids)) {
			const archived = [];
			for (const id of body.ids) {
				if (typeof id !== 'string') continue;
				archived.push(await decideOpportunity(userId, id, 'archived'));
			}
			return NextResponse.json({ archived });
		}
		if (action === 'archive_weak') {
			if (!brandId) return NextResponse.json({ error: 'Choose a brand.' }, { status: 400 });
			return NextResponse.json({ archived: await archiveWeakOpportunities(userId, brandId) });
		}
		if (action === 'rescore') {
			if (!brandId) return NextResponse.json({ error: 'Choose a brand.' }, { status: 400 });
			return NextResponse.json({ changes: await rescoreStoredEvidence(userId, brandId) });
		}
		if (action === 'revalidate_proposal') {
			if (typeof body.jobId !== 'string') return NextResponse.json({ error: 'Choose a production job.' }, { status: 400 });
			return NextResponse.json({ job: await revalidateMetadataJob(userId, body.jobId) });
		}
		if (action === 'run_production') {
			if (typeof body.jobId !== 'string') return NextResponse.json({ error: 'Choose a production job.' }, { status: 400 });
			const { runProductionToApproval } = await import('@/lib/campaigns/workflow');
			return NextResponse.json({ job: await runProductionToApproval(userId, body.jobId) });
		}
		if (action === 'discover') {
			const source = body.source === 'community' || body.source === 'search_console' || body.source === 'themes' || body.source === 'market' ? body.source : 'search';
			const opportunities = await discoverOpportunities(userId, {
				brandId,
				source,
				topic: typeof body.topic === 'string' ? body.topic : undefined,
				startDate: typeof body.startDate === 'string' ? body.startDate : undefined,
				endDate: typeof body.endDate === 'string' ? body.endDate : undefined,
				areas: Array.isArray(body.areas) ? body.areas.filter((item): item is string => typeof item === 'string') : undefined,
			});
			return NextResponse.json({ opportunities });
		}
		if (action === 'decide') {
			const status = body.status as OpportunityStatus;
			if (!['approved', 'rejected', 'deferred', 'needs_research', 'archived'].includes(status) || typeof body.id !== 'string') {
				return NextResponse.json({ error: 'Choose a valid decision.' }, { status: 400 });
			}
			return NextResponse.json({ opportunity: await decideOpportunity(userId, body.id, status) });
		}
		if (action === 'apply_pilot' || action === 'pause_operation' || action === 'resume_operation' || action === 'update_operation') {
			if (!brandId || typeof body.campaignId !== 'string') return NextResponse.json({ error: 'Choose a campaign.' }, { status: 400 });
			const { getOpportunityRepository } = await import('@/lib/campaigns/repository');
			const { FOLIAN_PILOT_POLICY } = await import('@/lib/operations/policy');
			const repository = getOpportunityRepository();
			const current = (await repository.listCampaigns(userId, brandId)).find((item) => item.id === body.campaignId);
			if (!current?.operation) return NextResponse.json({ error: 'Campaign not found.' }, { status: 404 });
			if (body.autonomousPublishingEnabled === true) {
				return NextResponse.json({ error: 'Autonomous publishing is not turned on from this action. Nothing was published.' }, { status: 403 });
			}
			if (action === 'apply_pilot') {
				const campaign = await repository.updateCampaign(userId, current.id, { status: 'paused', weeklyCapacity: FOLIAN_PILOT_POLICY.weeklyMaximum, approvalMode: 'auto_draft', themes: FOLIAN_PILOT_POLICY.themes, operation: FOLIAN_PILOT_POLICY });
				return NextResponse.json({ campaign, published: false });
			}
			if (action === 'pause_operation') {
				const campaign = await repository.updateCampaign(userId, current.id, { status: 'paused', operation: { ...current.operation, paused: true, autonomousPublishingEnabled: false } });
				return NextResponse.json({ campaign, published: false });
			}
			if (action === 'resume_operation') {
				const campaign = await repository.updateCampaign(userId, current.id, { status: 'active', approvalMode: 'auto_draft', operation: { ...current.operation, paused: false, mode: 'autonomous_approval', autonomousPublishingEnabled: false } });
				return NextResponse.json({ campaign, published: false });
			}
			const weekly = typeof body.weeklyMaximum === 'number' ? Math.max(0, Math.min(14, body.weeklyMaximum)) : current.operation.weeklyMaximum;
			const budget = typeof body.maxCostUsdPerArticle === 'number' ? Math.max(0.1, Math.min(5, body.maxCostUsdPerArticle)) : current.operation.maxCostUsdPerArticle;
			const campaign = await repository.updateCampaign(userId, current.id, { weeklyCapacity: weekly, operation: { ...current.operation, weeklyMaximum: weekly, maxCostUsdPerArticle: budget, autonomousPublishingEnabled: false } });
			return NextResponse.json({ campaign, published: false });
		}
		if (action === 'create_campaign') {
			if (!brandId || typeof body.name !== 'string') return NextResponse.json({ error: 'Brand and campaign name are required.' }, { status: 400 });
			const approvalMode: ApprovalMode = body.approvalMode === 'auto_draft' ? 'auto_draft' : 'assisted';
			const status: CampaignStatus = body.status === 'active' || body.status === 'paused' ? body.status : 'draft';
			const campaign = await createContentCampaign(userId, {
				brandId,
				name: body.name,
				objective: typeof body.objective === 'string' ? body.objective : '',
				audience: typeof body.audience === 'string' ? body.audience : '',
				themes: Array.isArray(body.themes) ? body.themes.filter((item): item is string => typeof item === 'string') : [],
				weeklyCapacity: typeof body.weeklyCapacity === 'number' ? body.weeklyCapacity : 0,
				selectionPolicy: 'evidence_required',
				approvalMode,
				destinationId: typeof body.destinationId === 'string' ? body.destinationId : null,
				status,
			});
			return NextResponse.json({ campaign });
		}
		return NextResponse.json({ error: 'Unknown campaign action.' }, { status: 400 });
	} catch (error) {
		return fail(error);
	}
}
