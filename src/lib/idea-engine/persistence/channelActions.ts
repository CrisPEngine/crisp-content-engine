import 'server-only';

import { getSupabaseService } from '@/lib/supabaseService';
import { computeSingleChannelActionCount } from '@/lib/ideaEngineQuota';
import { getChannelUsage } from '@/lib/enforceCaps';
import { resolvePlan } from '@/lib/planResolver';
import { CAPS } from '@/config/pricing';
import { IdeaEngineError } from '../errors';

export async function assertRunOwnedByUser(
	runId: string,
	userId: string,
): Promise<{
	id: string;
	user_id: string;
	brand_profile_id: string | null;
	selected_channels: string[];
	status: string;
	total_expected: number | null;
}> {
	const admin = getSupabaseService();
	const { data: run, error } = await admin
		.from('idea_engine_runs')
		.select('id, user_id, brand_profile_id, selected_channels, status, total_expected')
		.eq('id', runId)
		.single();

	if (error || !run || run.user_id !== userId) {
		throw new IdeaEngineError('Run not found', {
			status: 404,
			code: 'idea_engine_run_not_found',
		});
	}
	return run;
}

export async function computeChannelActionCounts(
	userId: string,
	channel: string,
): Promise<{ count: number; dropped: boolean }> {
	const resolved = await resolvePlan(userId);
	const plan = resolved.plan === 'free' ? 'starter' : resolved.plan;
	const planCaps = CAPS[plan as keyof typeof CAPS] || CAPS.starter;
	const usage = await getChannelUsage(userId);
	const quotaRemaining = {
		linkedin: Math.max(0, planCaps.linkedinPostsMonthly - usage.linkedin),
		x: Math.max(0, planCaps.xPostsMonthly - usage.x),
		blog: Math.max(0, planCaps.blogArticlesMonthly - usage.blog),
		meta_pool: Math.max(0, planCaps.metaPoolMonthly - usage.meta_pool),
	};
	const { requestedCounts, droppedChannels } = computeSingleChannelActionCount(
		channel,
		plan,
		quotaRemaining,
	);
	const count = requestedCounts[channel] ?? 0;
	return { count, dropped: count === 0 || droppedChannels.includes(channel) };
}

export async function prepareChannelPlaceholders(options: {
	runId: string;
	userId: string;
	channel: string;
	count: number;
	replaceFailed?: boolean;
}): Promise<void> {
	const admin = getSupabaseService();

	if (options.replaceFailed) {
		await admin
			.from('idea_engine_items')
			.delete()
			.eq('run_id', options.runId)
			.eq('channel', options.channel)
			.eq('status', 'failed');
	}

	const { data: existing } = await admin
		.from('idea_engine_items')
		.select('id, status')
		.eq('run_id', options.runId)
		.eq('channel', options.channel);

	const active = (existing ?? []).filter(
		(row) =>
			row.status === 'ready' ||
			row.status === 'generating' ||
			row.status === 'regenerating' ||
			row.status === 'confirmed' ||
			row.status === 'queued',
	);

	if (active.length > 0 && !options.replaceFailed) {
		throw new IdeaEngineError(`${options.channel} already has generated content for this run`, {
			status: 409,
			code: 'idea_engine_channel_exists',
		});
	}

	const placeholders = [];
	for (let position = 1; position <= options.count; position++) {
		placeholders.push({
			run_id: options.runId,
			user_id: options.userId,
			channel: options.channel,
			series_position: position,
			series_total: options.count,
			status: 'generating',
			post_title: null,
			body_draft: null,
			image_prompt: null,
			hashtags: null,
		});
	}

	if (placeholders.length > 0) {
		const { error } = await admin.from('idea_engine_items').insert(placeholders);
		if (error) {
			throw new IdeaEngineError('Failed to create channel placeholders', {
				status: 500,
				code: 'idea_engine_placeholder_failed',
			});
		}
	}

	const { data: run } = await admin
		.from('idea_engine_runs')
		.select('selected_channels, total_expected')
		.eq('id', options.runId)
		.single();

	const selected = new Set(run?.selected_channels ?? []);
	selected.add(options.channel);

	const { count: itemCount } = await admin
		.from('idea_engine_items')
		.select('id', { count: 'exact', head: true })
		.eq('run_id', options.runId);

	await admin
		.from('idea_engine_runs')
		.update({
			selected_channels: Array.from(selected),
			status: 'generating',
			total_expected: itemCount ?? options.count,
			error: null,
		})
		.eq('id', options.runId);
}
