import 'server-only';

import { CAPS } from '@/config/pricing';
import { getChannelUsage } from '@/lib/enforceCaps';
import { resolvePlan } from '@/lib/planResolver';
import { getSupabaseService } from '@/lib/supabaseService';
import { computeIdeaEngineRequestedCounts } from '@/lib/ideaEngineQuota';
import type { IdeaEngineRunContext } from '../types';
import { IdeaEngineError } from '../errors';
import { extractTimezoneAndWindows, loadBrandProfile } from './loadBrandProfile';
import { loadContentHistory } from './loadContentHistory';

type RunRow = {
	id: string;
	series_run_id: string;
	user_id: string;
	brand_profile_id: string | null;
	idea: string;
	goal: string | null;
	notes: string | null;
	selected_channels: string[];
	publish_mode: string;
};

export async function loadRunContextFromDb(runId: string): Promise<{
	run: RunRow;
	context: IdeaEngineRunContext;
}> {
	const admin = getSupabaseService();
	const { data: run, error } = await admin
		.from('idea_engine_runs')
		.select(
			'id, series_run_id, user_id, brand_profile_id, idea, goal, notes, selected_channels, publish_mode',
		)
		.eq('id', runId)
		.single();

	if (error || !run) {
		throw new IdeaEngineError('Run not found', {
			status: 404,
			code: 'idea_engine_run_not_found',
		});
	}

	if (!run.brand_profile_id) {
		throw new IdeaEngineError('Run has no brand profile', {
			status: 400,
			code: 'idea_engine_missing_brand',
		});
	}

	const resolved = await resolvePlan(run.user_id);
	const plan = resolved.plan === 'free' ? 'starter' : resolved.plan;
	const planCaps = CAPS[plan as keyof typeof CAPS] || CAPS.starter;
	const usage = await getChannelUsage(run.user_id);

	const quotaRemaining = {
		linkedin: Math.max(0, planCaps.linkedinPostsMonthly - usage.linkedin),
		x: Math.max(0, planCaps.xPostsMonthly - usage.x),
		blog: Math.max(0, planCaps.blogArticlesMonthly - usage.blog),
		meta_pool: Math.max(0, planCaps.metaPoolMonthly - usage.meta_pool),
	};

	const { requestedCounts, activeChannels } = computeIdeaEngineRequestedCounts(
		run.selected_channels,
		plan,
		quotaRemaining,
	);

	const brandContext = await loadBrandProfile(run.brand_profile_id);
	const { timezone, postingWindows } = extractTimezoneAndWindows(brandContext);
	const previousContentJson = await loadContentHistory(run.brand_profile_id);

	const autopublishCapabilities: Record<string, boolean> = {
		linkedin: planCaps.autopublishLinkedIn,
		instagram: planCaps.autopublishMeta,
		facebook: planCaps.autopublishMeta,
		x: false,
		blog: false,
	};

	const context: IdeaEngineRunContext = {
		seriesRunId: run.series_run_id,
		runId: run.id,
		userId: run.user_id,
		plan,
		brandProfileId: run.brand_profile_id,
		idea: run.idea,
		goal: run.goal,
		notes: run.notes,
		selectedChannels: activeChannels,
		publishMode: run.publish_mode,
		requestedCounts,
		quotaRemainingByChannel: quotaRemaining,
		autopublishCapabilities,
		timezone,
		postingWindows,
		brandContext,
		previousContentJson,
	};

	return { run, context };
}
