import 'server-only';

import { getSupabaseService } from '@/lib/supabaseService';
import { upsertReservation } from '@/lib/enforceCaps';
import type { GeneratedItemInput } from '../types';
import { serializeImagePrompt } from '../validation/normalize';
import { updateRunReviewStatus } from './runStatus';

export async function applyGeneratedItems(options: {
	runId: string;
	userId: string;
	items: GeneratedItemInput[];
	markRunComplete?: boolean;
}): Promise<{ applied: number }> {
	const admin = getSupabaseService();
	const { data: placeholders } = await admin
		.from('idea_engine_items')
		.select('id, channel, series_position, status')
		.eq('run_id', options.runId)
		.order('channel', { ascending: true })
		.order('series_position', { ascending: true });

	if (!placeholders?.length) {
		console.warn('[IdeaEngine] No placeholders for run', options.runId);
		return { applied: 0 };
	}

	const channelCounters: Record<string, number> = {};
	let applied = 0;

	for (const item of options.items) {
		const channel = item.channel;
		let placeholder = item.series_position
			? placeholders.find(
					(p) =>
						p.channel === channel &&
						p.series_position === item.series_position &&
						(p.status === 'generating' || p.status === 'regenerating'),
				)
			: undefined;

		if (!placeholder) {
			const channelIndex = channelCounters[channel] || 0;
			const channelPlaceholders = placeholders.filter(
				(p) =>
					p.channel === channel &&
					(p.status === 'generating' || p.status === 'regenerating'),
			);
			placeholder = channelPlaceholders[channelIndex];
			channelCounters[channel] = channelIndex + 1;
		}

		if (!placeholder) continue;

		const { error } = await admin
			.from('idea_engine_items')
			.update({
				post_title: item.post_title || null,
				post_type: item.post_type || null,
				hook: item.hook || item.post_title || null,
				body_draft: item.body_draft || null,
				image_prompt: serializeImagePrompt(item.image_prompt),
				hashtags: item.hashtags || null,
				series_position: item.series_position ?? placeholder.series_position ?? null,
				series_total: item.series_total ?? null,
				scheduled_time: item.scheduled_time || null,
				status: 'ready',
				updated_at: new Date().toISOString(),
			})
			.eq('id', placeholder.id);

		if (!error) applied += 1;
	}

	if (options.markRunComplete) {
		const channelCounts: Record<string, number> = {};
		for (const item of options.items) {
			const ch = (item.channel || '').toLowerCase();
			channelCounts[ch] = (channelCounts[ch] || 0) + 1;
		}

		await upsertReservation(options.userId, options.runId, {
			linkedin: channelCounts['linkedin'] ?? 0,
			x: channelCounts['x'] ?? 0,
			blog: channelCounts['blog'] ?? 0,
			meta_pool: (channelCounts['instagram'] ?? 0) + (channelCounts['facebook'] ?? 0),
		});

		await updateRunReviewStatus({
			runId: options.runId,
			hasChannelErrors: false,
		});
	}

	return { applied };
}

export async function markChannelItemsFailed(
	runId: string,
	channel: string,
	errorMessage?: string,
): Promise<void> {
	const admin = getSupabaseService();
	await admin
		.from('idea_engine_items')
		.update({
			status: 'failed',
			updated_at: new Date().toISOString(),
		})
		.eq('run_id', runId)
		.eq('channel', channel)
		.in('status', ['generating', 'regenerating']);

	console.warn('[IdeaEngine] Channel generation failed', {
		runId,
		channel,
		error: errorMessage,
	});
}

export async function markRunFailed(
	runId: string,
	errorMessage: string,
): Promise<void> {
	const admin = getSupabaseService();

	const { count: readyCount } = await admin
		.from('idea_engine_items')
		.select('id', { count: 'exact', head: true })
		.eq('run_id', runId)
		.eq('status', 'ready');

	await admin
		.from('idea_engine_items')
		.update({ status: 'failed' })
		.eq('run_id', runId)
		.in('status', ['generating', 'regenerating']);

	if ((readyCount ?? 0) > 0) {
		await updateRunReviewStatus({
			runId,
			hasChannelErrors: true,
			error: errorMessage,
		});
		return;
	}

	await admin
		.from('idea_engine_runs')
		.update({ status: 'failed', error: errorMessage })
		.eq('id', runId);
}

export async function finalizeRunAfterGeneration(options: {
	runId: string;
	userId: string;
	items: GeneratedItemInput[];
	channelErrors: Array<{ channel: string; message: string }>;
	existingWarning?: string | null;
}): Promise<void> {
	const admin = getSupabaseService();

	if (options.items.length === 0) {
		const detail =
			options.channelErrors.map((e) => `${e.channel}: ${e.message}`).join('; ') ||
			'No items were generated';
		await markRunFailed(options.runId, detail);
		return;
	}

	await applyGeneratedItems({
		runId: options.runId,
		userId: options.userId,
		items: options.items,
		markRunComplete: true,
	});

	const partialWarning =
		options.channelErrors.length > 0
			? options.channelErrors.map((e) => `${e.channel} generation failed`).join('; ')
			: null;
	const generationWarning =
		partialWarning && options.existingWarning
			? `${options.existingWarning} ${partialWarning}`
			: partialWarning ?? options.existingWarning ?? null;

	await updateRunReviewStatus({
		runId: options.runId,
		hasChannelErrors: options.channelErrors.length > 0,
		error: partialWarning,
		generationWarning,
	});
}
