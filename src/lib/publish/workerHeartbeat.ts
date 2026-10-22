import 'server-only';

import { getSupabaseService } from '@/lib/supabaseService';
import { evaluatePublishWorkerStale } from '@/lib/publish/publishWatchdogLogic';

export type PublishWorkerId = 'meta-due' | 'threads-due' | 'linkedin-due' | 'publish-watchdog';

/** @deprecated Use publishWorkerStaleThresholdMs(worker) for per-worker thresholds (2x expected interval). */
export const PUBLISH_CRON_STALE_AFTER_MS = 60 * 60 * 1000;

export async function recordPublishWorkerRun(input: {
	worker: PublishWorkerId;
	ok: boolean;
	processed?: number;
	error?: string | null;
	at?: Date;
}): Promise<void> {
	const admin = getSupabaseService();
	const at = (input.at ?? new Date()).toISOString();
	const { error } = await admin.from('publish_worker_heartbeats').upsert(
		{
			worker: input.worker,
			last_run_at: at,
			last_ok: input.ok,
			last_error: input.error ?? null,
			last_processed: input.processed ?? 0,
			updated_at: at,
		},
		{ onConflict: 'worker' },
	);
	if (error) {
		console.error(`[Publish Worker] Failed to record heartbeat for ${input.worker}:`, error.message);
	}
}

export type PublishWorkerHeartbeat = {
	worker: PublishWorkerId;
	lastRunAt: string | null;
	stale: boolean;
	lastOk: boolean | null;
	lastError: string | null;
	lastProcessed: number | null;
};

export async function getPublishWorkerHeartbeats(workers: PublishWorkerId[]): Promise<PublishWorkerHeartbeat[]> {
	const admin = getSupabaseService();
	const { data, error } = await admin.from('publish_worker_heartbeats').select('*').in('worker', workers);
	if (error) {
		console.error('[Publish Worker] Failed to load heartbeats:', error.message);
		return workers.map((worker) => ({
			worker,
			lastRunAt: null,
			stale: true,
			lastOk: null,
			lastError: error.message,
			lastProcessed: null,
		}));
	}

	const byWorker = new Map((data ?? []).map((row) => [String(row.worker), row]));
	const now = Date.now();

	return workers.map((worker) => {
		const row = byWorker.get(worker);
		if (!row) {
			return {
				worker,
				lastRunAt: null,
				stale: true,
				lastOk: null,
				lastError: 'No heartbeat recorded yet',
				lastProcessed: null,
			};
		}
		const lastRunAt = String(row.last_run_at);
		const staleEval = evaluatePublishWorkerStale({ worker, lastRunAt, nowMs: now });
		return {
			worker,
			lastRunAt,
			stale: staleEval.stale,
			lastOk: Boolean(row.last_ok),
			lastError: typeof row.last_error === 'string' ? row.last_error : null,
			lastProcessed: typeof row.last_processed === 'number' ? row.last_processed : null,
		};
	});
}
