import type { getSupabaseService } from '@/lib/supabaseService';

/** Platforms processed by /api/publish/meta-due (Meta Graph). */
export const META_PUBLISH_PLATFORMS = ['facebook', 'instagram'] as const;

export type PublishJobAdmin = ReturnType<typeof getSupabaseService>;

/** Due jobs for a publish worker: queued/retrying, scheduled_time <= now, next_attempt_at due. */
export function duePublishJobsQuery(
	admin: PublishJobAdmin,
	input: { platforms: readonly string[]; now: string; limit?: number },
) {
	const limit = input.limit ?? 50;
	return admin
		.from('publish_jobs')
		.select('*')
		.in('platform', [...input.platforms])
		.in('status', ['queued', 'retrying'])
		.lte('scheduled_time', input.now)
		.or(`next_attempt_at.is.null,next_attempt_at.lte.${input.now}`)
		.order('scheduled_time', { ascending: true })
		.limit(limit);
}
