/**
 * Pure timing simulation for Idea Engine scalability analysis.
 * No server-only import — safe for tests and CLI benchmarks.
 */

const MAX_ITEMS_PER_OPENAI_CALL = 3;

function splitChannelIntoBatches(totalCount: number): Array<{ count: number; positionStart: number }> {
	if (totalCount <= 0) return [];
	const batches: Array<{ count: number; positionStart: number }> = [];
	let positionStart = 1;
	let remaining = totalCount;
	while (remaining > 0) {
		const count = Math.min(remaining, MAX_ITEMS_PER_OPENAI_CALL);
		batches.push({ count, positionStart });
		positionStart += count;
		remaining -= count;
	}
	return batches;
}

const CHANNEL_ORDER = ['LinkedIn', 'X', 'Blog', 'Facebook', 'Instagram'] as const;

export type TimingSimulationInput = {
	requestedCounts: Record<string, number>;
	/** Assumed wall-clock ms per OpenAI batch call (incl. validation). */
	openAiBatchDurationMs: number;
	/** Assumed ms for Supabase placeholder updates per batch. */
	persistencePerBatchMs?: number;
	/** Assumed ms to load brand profile + content history + plan context. */
	contextLoadMs?: number;
};

export type SimulatedBatch = {
	channel: string;
	itemCount: number;
	positionStart: number;
	openAiDurationMs: number;
	persistenceDurationMs: number;
	totalDurationMs: number;
};

export type TimingSimulationResult = {
	mode: 'sequential';
	batches: SimulatedBatch[];
	batchCount: number;
	itemCount: number;
	contextLoadMs: number;
	sequentialTotalMs: number;
	parallelChannelsTotalMs: number;
	estimatedSavingsMs: number;
};

function sortedChannels(requestedCounts: Record<string, number>): string[] {
	return CHANNEL_ORDER.filter((ch) => (requestedCounts[ch] ?? 0) > 0);
}

export function simulateIdeaEngineRunTiming(
	input: TimingSimulationInput,
): TimingSimulationResult {
	const persistencePerBatchMs = input.persistencePerBatchMs ?? 200;
	const contextLoadMs = input.contextLoadMs ?? 2500;
	const batches: SimulatedBatch[] = [];

	for (const channel of sortedChannels(input.requestedCounts)) {
		const channelTotal = input.requestedCounts[channel] ?? 0;
		for (const batch of splitChannelIntoBatches(channelTotal)) {
			batches.push({
				channel,
				itemCount: batch.count,
				positionStart: batch.positionStart,
				openAiDurationMs: input.openAiBatchDurationMs,
				persistenceDurationMs: persistencePerBatchMs,
				totalDurationMs: input.openAiBatchDurationMs + persistencePerBatchMs,
			});
		}
	}

	const sequentialTotalMs =
		contextLoadMs + batches.reduce((sum, batch) => sum + batch.totalDurationMs, 0);

	const channelDurations = new Map<string, number>();
	for (const batch of batches) {
		channelDurations.set(
			batch.channel,
			(channelDurations.get(batch.channel) ?? 0) + batch.totalDurationMs,
		);
	}
	const parallelChannelsTotalMs =
		contextLoadMs + Math.max(0, ...Array.from(channelDurations.values()));

	return {
		mode: 'sequential',
		batches,
		batchCount: batches.length,
		itemCount: batches.reduce((sum, batch) => sum + batch.itemCount, 0),
		contextLoadMs,
		sequentialTotalMs,
		parallelChannelsTotalMs,
		estimatedSavingsMs: sequentialTotalMs - parallelChannelsTotalMs,
	};
}

/** Plan-scale maxima from IDEA_ENGINE_PLAN_DEFAULTS (pro/scale tier). */
export const PLAN_MAX_BATCH_COUNTS = {
	creator: { LinkedIn: 1, X: 1, Blog: 1 },
	growth: { LinkedIn: 1, X: 2, Blog: 1, Instagram: 1, Facebook: 1 },
	pro: { LinkedIn: 1, X: 2, Blog: 1, Instagram: 1, Facebook: 1 },
} as const;

export function estimateMaxItemsBeforeLimit(options: {
	vercelLimitMs: number;
	openAiBatchDurationMs: number;
	persistencePerBatchMs?: number;
	contextLoadMs?: number;
}): number {
	const overhead =
		(options.contextLoadMs ?? 2500) +
		(options.persistencePerBatchMs ?? 200);
	const perBatch = options.openAiBatchDurationMs + (options.persistencePerBatchMs ?? 200);
	const available = options.vercelLimitMs - overhead;
	if (available <= 0 || perBatch <= 0) return 0;
	const maxBatches = Math.floor(available / perBatch);
	return maxBatches * MAX_ITEMS_PER_OPENAI_CALL;
}
