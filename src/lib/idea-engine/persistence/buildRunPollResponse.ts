import {
	generationStageLabel,
	IDEA_ENGINE_GENERATION_STAGES,
} from './generationStage';

export type IdeaEngineItemRow = {
	id: string;
	channel: string;
	post_title: string | null;
	body_draft: string | null;
	image_prompt: string | null;
	hashtags: string | null;
	series_position: number | null;
	series_total: number | null;
	status: string;
};

export type IdeaEngineRunRow = {
	id: string;
	series_run_id: string;
	idea: string;
	goal: string | null;
	selected_channels: string[];
	publish_mode: string;
	status: string;
	total_expected: number | null;
	total_generated: number | null;
	error: string | null;
	generation_warning: string | null;
	generation_stage: string | null;
	created_at: string;
};

export function countItemsByStatus(items: IdeaEngineItemRow[]): {
	ready: number;
	failed: number;
	generating: number;
	confirmed: number;
} {
	const counts = { ready: 0, failed: 0, generating: 0, confirmed: 0 };
	for (const item of items) {
		if (item.status === 'ready' || (!!item.body_draft && item.status !== 'failed')) {
			counts.ready += 1;
		} else if (item.status === 'failed') {
			counts.failed += 1;
		} else if (item.status === 'confirmed' || item.status === 'queued') {
			counts.confirmed += 1;
		} else if (
			item.status === 'generating' ||
			item.status === 'regenerating' ||
			item.status === 'pending'
		) {
			counts.generating += 1;
		}
	}
	return counts;
}

export function buildRunPollResponse(run: IdeaEngineRunRow, items: IdeaEngineItemRow[]) {
	const itemCounts = countItemsByStatus(items);
	const expectedCountsByChannel: Record<string, number> = {};
	const generatedCountsByChannel: Record<string, number> = {};

	for (const item of items) {
		const ch = item.channel;
		expectedCountsByChannel[ch] = (expectedCountsByChannel[ch] || 0) + 1;
		if (item.body_draft || item.status === 'ready') {
			generatedCountsByChannel[ch] = (generatedCountsByChannel[ch] || 0) + 1;
		}
	}

	const generatedItemsCount = itemCounts.ready + itemCounts.confirmed;
	const primaryChannel = run.selected_channels?.[0];
	const generationStage =
		run.status === 'failed'
			? IDEA_ENGINE_GENERATION_STAGES.failed
			: run.generation_stage;

	return {
		run: {
			id: run.id,
			series_run_id: run.series_run_id,
			idea: run.idea,
			goal: run.goal,
			selected_channels: run.selected_channels,
			publish_mode: run.publish_mode,
			status: run.status,
			total_expected: run.total_expected,
			total_generated: run.total_generated,
			error: run.error,
			generation_warning: run.generation_warning ?? null,
			generation_stage: generationStage,
			generation_stage_label: generationStageLabel(generationStage, primaryChannel),
			last_error: run.error,
			created_at: run.created_at,
		},
		items,
		item_counts: itemCounts,
		expected_total_items: run.total_expected || 0,
		generated_items_count: generatedItemsCount,
		expected_counts_by_channel: expectedCountsByChannel,
		generated_counts_by_channel: generatedCountsByChannel,
	};
}
