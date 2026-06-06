import 'server-only';

export type BatchTimingRecord = {
	runId: string;
	channel: string;
	itemCount: number;
	seriesPositionStart: number;
	seriesTotalForChannel: number;
	openaiDurationMs: number;
	validationDurationMs: number;
	persistenceDurationMs: number;
	totalDurationMs: number;
};

export type RunTimingSummary = {
	runId: string;
	contextLoadDurationMs: number;
	totalDurationMs: number;
	batchCount: number;
	itemCount: number;
	batches: BatchTimingRecord[];
};

export function createTimingMark(): number {
	return Date.now();
}

export function elapsedMs(startedAt: number): number {
	return Date.now() - startedAt;
}

export function logBatchTiming(record: BatchTimingRecord): void {
	console.log('[IdeaEngine/Timing] batch', {
		run_id: record.runId,
		channel: record.channel,
		item_count: record.itemCount,
		series_position_start: record.seriesPositionStart,
		series_total_for_channel: record.seriesTotalForChannel,
		openai_duration_ms: record.openaiDurationMs,
		validation_duration_ms: record.validationDurationMs,
		persistence_duration_ms: record.persistenceDurationMs,
		total_duration_ms: record.totalDurationMs,
	});
}

export function logRunTiming(summary: RunTimingSummary): void {
	console.log('[IdeaEngine/Timing] run_complete', {
		run_id: summary.runId,
		context_load_duration_ms: summary.contextLoadDurationMs,
		total_duration_ms: summary.totalDurationMs,
		batch_count: summary.batchCount,
		item_count: summary.itemCount,
		batches: summary.batches.map((batch) => ({
			channel: batch.channel,
			item_count: batch.itemCount,
			openai_duration_ms: batch.openaiDurationMs,
			validation_duration_ms: batch.validationDurationMs,
			persistence_duration_ms: batch.persistenceDurationMs,
			total_duration_ms: batch.totalDurationMs,
		})),
	});
}
