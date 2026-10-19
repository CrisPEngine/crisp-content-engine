import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { getIntelligenceStore } from '@/lib/intelligence/actions';
import { getNativeContentStore } from '@/lib/media/store';
import { brandChannelRows } from '@/lib/social/brandChannels';
import { scoreStrategyCompleteness, strategyGenerationPhase } from '@/lib/intelligence/strategy/strategyCompleteness';
import { listNativeQueueForUser } from '@/lib/content/listNativeQueue';
import { humanStepLabel } from '@/lib/onboarding/stepLabels';
import { contentApprovalHref } from '@/lib/brands/workingBrand';
import { computeGetStartedCurrentStep, computeGetStartedStepDone } from '@/lib/dashboard/getStartedProgress';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
	const cookieStore = await cookies();
	const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
		cookies: {
			get(name: string) {
				return cookieStore.get(name)?.value;
			},
			set(name: string, value: string, options: CookieOptions) {
				cookieStore.set({ name, value, ...options });
			},
			remove(name: string, options: CookieOptions) {
				cookieStore.set({ name, value: '', ...options });
			},
		},
	});
	const {
		data: { user },
	} = await supabase.auth.getUser();
	if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

	const airtableBrandId = new URL(request.url).searchParams.get('airtableBrandId')?.trim();
	const store = getIntelligenceStore();
	const brains = await store.listBrandBrains(user.id);
	const brain =
		(airtableBrandId ? brains.find((row) => row.airtableBrandId === airtableBrandId) : undefined) ?? brains[0];

	if (!brain) {
		return NextResponse.json({
			brandName: null,
			currentStep: 1,
			hasApprovedStrategy: false,
			hasContentToReview: false,
			steps: [{ id: 'questionnaire', label: humanStepLabel('questionnaire'), done: false, href: '/onboarding' }],
		});
	}

	const strategy = await store.getStrategyForBrand(user.id, brain.id);
	const completeness = scoreStrategyCompleteness(strategy);
	const phase = strategyGenerationPhase(strategy);
	const assets = await getNativeContentStore().listAssets(user.id, brain.id);
	const channels = await brandChannelRows(user.id, brain.id);
	const connected = channels.filter((row) => row.phase === 'READY' || row.phase === 'ASSIGNED').length;
	const nativeQueue = await listNativeQueueForUser(user.id, { brandProfileId: brain.airtableBrandId, stage: 'approval' });
	const pendingNative = nativeQueue.length;

	const strategyApproved = strategy?.status === 'active' && completeness.complete && !completeness.isSkeleton;
	const progressInput = {
		strategyApproved,
		phase,
		pendingNative,
		assetCount: assets.length,
		connected,
	};
	const stepDone = computeGetStartedStepDone(progressInput);

	const intelligenceHref = `/intelligence?brand_profile_id=${encodeURIComponent(brain.airtableBrandId)}&tab=strategy`;
	const approvalHref = contentApprovalHref(brain.airtableBrandId);

	const steps = [
		{
			id: 'questionnaire',
			label: humanStepLabel('questionnaire'),
			done: stepDone.questionnaire,
			href: '/onboarding',
		},
		{
			id: 'approve_strategy',
			label: humanStepLabel('approve_strategy'),
			done: stepDone.approve_strategy,
			href: intelligenceHref,
		},
		{
			id: 'generate_content',
			label: humanStepLabel('generate_content'),
			done: stepDone.generate_content,
			href: `/content/generate?brand=${encodeURIComponent(brain.airtableBrandId)}`,
		},
		{
			id: 'connect_social',
			label: humanStepLabel('connect_social'),
			done: stepDone.connect_social,
			href: `/connections?brand=${encodeURIComponent(brain.id)}`,
		},
		{
			id: 'review_content',
			label:
				pendingNative > 0
					? `${humanStepLabel('review_content')} (${pendingNative} pending)`
					: humanStepLabel('review_content'),
			done: stepDone.review_content,
			href: approvalHref,
		},
	];

	const currentStep = computeGetStartedCurrentStep(progressInput);

	return NextResponse.json({
		brandBrainId: brain.id,
		airtableBrandId: brain.airtableBrandId,
		brandName: brain.identity.name,
		currentStep,
		nativePhase: phase,
		completeness,
		pendingApprovals: pendingNative,
		hasContentToReview: pendingNative > 0,
		hasApprovedStrategy: strategyApproved,
		hasBrandProfiles: true,
		connectedChannels: connected,
		assetCount: assets.length,
		steps: steps.map((step) => ({ ...step, label: humanStepLabel(step.id, step.label) })),
	});
}
