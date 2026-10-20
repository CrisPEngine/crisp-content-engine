import 'server-only';

import type { getSupabaseService } from '@/lib/supabaseService';
import { META_PUBLISH_PLATFORMS } from '@/lib/publish/dueJobsQuery';
import { publishInstantMs } from '@/lib/publish/publishInstant';

export type MetaDueJobRowSummary = {
	id: string;
	platform: string;
	status: string;
	scheduled_time: string;
	next_attempt_at: string | null;
	attempts: number | null;
	error_message: string | null;
	remote_post_id: string | null;
	updated_at: string | null;
	content_item_key: string;
	notDueReason?: string;
};

export type MetaDueDiagnostics = {
	now: string;
	metaPublishingEnabled: boolean;
	dueJobsFound: number;
	jobInventory: {
		queuedDue: number;
		queuedNotYetDue: number;
		retryingDue: number;
		retryingWaiting: number;
		publishing: number;
		failed: number;
		published: number;
	};
	contentJob?: MetaDueJobRowSummary | null;
};

function notDueReason(row: {
	status: string;
	scheduled_time: string;
	next_attempt_at: string | null;
	now: string;
}): string | undefined {
	if (!['queued', 'retrying'].includes(row.status)) {
		if (row.status === 'publishing') return 'status_is_publishing';
		if (row.status === 'published') return 'already_published';
		if (row.status === 'failed') return 'status_is_failed';
		return `status_${row.status}`;
	}
	const nowMs = publishInstantMs(row.now);
	const scheduledMs = publishInstantMs(row.scheduled_time);
	if (nowMs != null && scheduledMs != null && scheduledMs > nowMs) return 'scheduled_time_in_future';
	const nextMs = row.next_attempt_at ? publishInstantMs(row.next_attempt_at) : null;
	if (nowMs != null && nextMs != null && nextMs > nowMs) return 'next_attempt_at_in_future';
	return undefined;
}

export async function buildMetaDueDiagnostics(
	admin: ReturnType<typeof getSupabaseService>,
	input: { now: string; metaPublishingEnabled: boolean; dueJobsFound: number; contentItemKey?: string },
): Promise<MetaDueDiagnostics> {
	const { data: rows } = await admin
		.from('publish_jobs')
		.select('id, platform, status, scheduled_time, next_attempt_at, attempts, error_message, remote_post_id, updated_at, content_item_key')
		.in('platform', [...META_PUBLISH_PLATFORMS]);

	const inventory = {
		queuedDue: 0,
		queuedNotYetDue: 0,
		retryingDue: 0,
		retryingWaiting: 0,
		publishing: 0,
		failed: 0,
		published: 0,
	};

	for (const row of rows ?? []) {
		const status = String(row.status);
		if (status === 'queued') {
			if (row.scheduled_time <= input.now && (!row.next_attempt_at || row.next_attempt_at <= input.now)) {
				inventory.queuedDue += 1;
			} else {
				inventory.queuedNotYetDue += 1;
			}
		} else if (status === 'retrying') {
			if (row.scheduled_time <= input.now && (!row.next_attempt_at || row.next_attempt_at <= input.now)) {
				inventory.retryingDue += 1;
			} else {
				inventory.retryingWaiting += 1;
			}
		} else if (status === 'publishing') inventory.publishing += 1;
		else if (status === 'failed') inventory.failed += 1;
		else if (status === 'published') inventory.published += 1;
	}

	let contentJob: MetaDueJobRowSummary | null | undefined;
	if (input.contentItemKey) {
		const match = (rows ?? []).find((row) => String(row.content_item_key) === input.contentItemKey);
		if (match) {
			const reason = notDueReason({
				status: String(match.status),
				scheduled_time: String(match.scheduled_time),
				next_attempt_at: match.next_attempt_at ? String(match.next_attempt_at) : null,
				now: input.now,
			});
			contentJob = {
				id: String(match.id),
				platform: String(match.platform),
				status: String(match.status),
				scheduled_time: String(match.scheduled_time),
				next_attempt_at: match.next_attempt_at ? String(match.next_attempt_at) : null,
				attempts: match.attempts ?? null,
				error_message: match.error_message ? String(match.error_message) : null,
				remote_post_id: match.remote_post_id ? String(match.remote_post_id) : null,
				updated_at: match.updated_at ? String(match.updated_at) : null,
				content_item_key: String(match.content_item_key),
				...(reason ? { notDueReason: reason } : {}),
			};
		} else {
			contentJob = null;
		}
	}

	return {
		now: input.now,
		metaPublishingEnabled: input.metaPublishingEnabled,
		dueJobsFound: input.dueJobsFound,
		jobInventory: inventory,
		...(input.contentItemKey !== undefined ? { contentJob } : {}),
	};
}
