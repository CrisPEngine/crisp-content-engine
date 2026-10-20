import 'server-only';

import type { getSupabaseService } from '@/lib/supabaseService';

const ACTIVE_JOB_STATUSES = ['queued', 'retrying', 'publishing'] as const;

/**
 * Enforce 60s spacing per Meta/Threads target using other in-flight jobs only.
 * Excludes the current content row so reschedules are not pushed by their own prior job.
 */
export async function applyPublishTargetSpacing(
	admin: ReturnType<typeof getSupabaseService>,
	input: {
		platform: string;
		targetId: string;
		scheduledTime: Date;
		excludeContentItemKey?: string;
		/** Never return a slot later than this instant (user-requested publish time). */
		requestedCeiling?: Date;
	},
): Promise<{ scheduledTime: Date; spacingCapped: boolean }> {
	let query = admin
		.from('publish_jobs')
		.select('scheduled_time')
		.eq('platform', input.platform)
		.eq('target_id', input.targetId)
		.in('status', [...ACTIVE_JOB_STATUSES]);

	if (input.excludeContentItemKey) {
		query = query.neq('content_item_key', input.excludeContentItemKey);
	}

	const { data: recentJobs } = await query.order('scheduled_time', { ascending: false }).limit(1);
	if (!recentJobs?.length) {
		return { scheduledTime: input.scheduledTime, spacingCapped: false };
	}

	const lastScheduledTime = new Date(recentJobs[0].scheduled_time);
	const sixtySecondsAfterLast = new Date(lastScheduledTime.getTime() + 60 * 1000);
	let result = input.scheduledTime;
	if (result < sixtySecondsAfterLast) result = sixtySecondsAfterLast;
	let spacingCapped = false;
	if (input.requestedCeiling && result.getTime() > input.requestedCeiling.getTime()) {
		result = input.requestedCeiling;
		spacingCapped = true;
	}
	return { scheduledTime: result, spacingCapped };
}
