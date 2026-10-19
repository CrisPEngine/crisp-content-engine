import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { getIntelligenceStore } from '@/lib/intelligence/actions';
import { getNativeContentStore } from '@/lib/media/store';
import { brandChannelRows } from '@/lib/social/brandChannels';
import { scoreStrategyCompleteness, strategyGenerationPhase } from '@/lib/intelligence/strategy/strategyCompleteness';
import { listNativeQueueForUser } from '@/lib/content/listNativeQueue';
import { humanStepLabel } from '@/lib/onboarding/stepLabels';

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
			steps: [
				{ id: 'questionnaire', label: humanStepLabel('questionnaire'), done: false, href: '/onboarding' },
			],
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

	const strategyDone = strategy?.status === 'active' && completeness.complete;
	const strategyReview =
		phase === 'draft_ready' && completeness.complete ? true : strategyDone;
	const reviewDone = strategyDone && pendingNative === 0;
	const steps = [
		{
			id: 'questionnaire',
			label: humanStepLabel('questionnaire'),
			done: true,
			href: '/onboarding',
		},
		{
			id: 'approve_strategy',
			label: humanStepLabel('approve_strategy'),
			done: strategyDone,
			href: `/intelligence?brand_profile_id=${encodeURIComponent(brain.airtableBrandId)}`,
		},
		{
			id: 'generate_content',
			label: humanStepLabel('generate_content'),
			done: pendingNative > 0,
			href: `/content/generate?brand=${encodeURIComponent(brain.airtableBrandId)}`,
		},
		{
			id: 'connect_social',
			label: humanStepLabel('connect_social'),
			done: connected > 0,
			href: `/connections?brand=${encodeURIComponent(brain.id)}`,
		},
		{
			id: 'review_content',
			label:
				pendingNative > 0
					? `${humanStepLabel('review_content')} (${pendingNative} pending)`
					: humanStepLabel('review_content'),
			done: reviewDone,
			href: `/content/approval?brand_profile_id=${encodeURIComponent(brain.airtableBrandId)}`,
		},
	];

	let currentStep = 1;
	if (!strategyReview && phase !== 'generating') currentStep = 2;
	else if (strategyDone && pendingNative === 0 && connected === 0) currentStep = 4;
	else if (strategyDone && pendingNative === 0) currentStep = 3;
	else if (pendingNative > 0) currentStep = 5;
	else if (strategyDone && reviewDone) currentStep = 0;
	else if (strategyDone) currentStep = 3;

	return NextResponse.json({
		brandBrainId: brain.id,
		airtableBrandId: brain.airtableBrandId,
		brandName: brain.identity.name,
		currentStep,
		nativePhase: phase,
		completeness,
		pendingApprovals: pendingNative,
		connectedChannels: connected,
		assetCount: assets.length,
		steps: steps.map((step) => ({ ...step, label: humanStepLabel(step.id, step.label) })),
	});
}
