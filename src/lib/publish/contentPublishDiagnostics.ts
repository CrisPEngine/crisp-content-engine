import 'server-only';

import { getSupabaseService } from '@/lib/supabaseService';
import type { ContentMemoryRecord } from '@/lib/intelligence/types';

export type ContentPublishDiagnostics = {
	lastPublishError?: string;
	publishAttempts?: number;
	graphErrorCode?: string | null;
	responseStatus?: number | null;
	publishJobStatus?: string | null;
};

function platformForChannel(channel: string): string | null {
	const normalized = channel.toLowerCase();
	if (normalized === 'threads') return 'threads';
	if (normalized === 'instagram') return 'instagram';
	if (normalized === 'facebook') return 'facebook';
	return null;
}

export function publishDiagnosticsFromMemory(metadata: ContentMemoryRecord['metadata']): ContentPublishDiagnostics | null {
	const lastPublishError =
		typeof metadata?.lastPublishError === 'string' && metadata.lastPublishError.trim()
			? metadata.lastPublishError.trim()
			: undefined;
	if (!lastPublishError) return null;
	return { lastPublishError };
}

export type PublishJobRow = {
	content_item_key: string;
	platform: string;
	status: string;
	error_message: string | null;
	attempts: number | null;
	graph_error_code: string | null;
	response_status: number | null;
	updated_at?: string | null;
};

/** Latest publish_jobs row per memory id (any platform). */
export async function loadLatestPublishJobByMemoryId(
	userId: string,
): Promise<Map<string, PublishJobRow>> {
	const admin = getSupabaseService();
	const { data } = await admin
		.from('publish_jobs')
		.select('content_item_key, platform, status, error_message, attempts, graph_error_code, response_status, updated_at')
		.eq('user_id', userId);

	const map = new Map<string, PublishJobRow>();
	for (const row of data ?? []) {
		const key = String(row.content_item_key);
		const existing = map.get(key);
		if (!existing || String(row.updated_at ?? '') > String(existing.updated_at ?? '')) {
			map.set(key, row as PublishJobRow);
		}
	}
	return map;
}

export function diagnosticsFromPublishJob(
	memory: Pick<ContentMemoryRecord, 'metadata'>,
	job: PublishJobRow | undefined,
): ContentPublishDiagnostics | null {
	const fromMemory = publishDiagnosticsFromMemory(memory.metadata);
	if (!job && !fromMemory) return null;
	const lastPublishError =
		(typeof job?.error_message === 'string' && job.error_message.trim()) || fromMemory?.lastPublishError;
	return {
		...(lastPublishError ? { lastPublishError } : {}),
		...(typeof job?.attempts === 'number' ? { publishAttempts: job.attempts } : {}),
		...(job ? { graphErrorCode: job.graph_error_code, responseStatus: job.response_status } : {}),
		...(typeof job?.status === 'string' ? { publishJobStatus: job.status } : {}),
	};
}

export async function loadContentPublishDiagnostics(
	userId: string,
	memory: Pick<ContentMemoryRecord, 'id' | 'channel' | 'metadata'>,
): Promise<ContentPublishDiagnostics | null> {
	const fromMemory = publishDiagnosticsFromMemory(memory.metadata);
	const platform = platformForChannel(String(memory.channel));
	if (!platform) return fromMemory;

	const admin = getSupabaseService();
	const { data: job } = await admin
		.from('publish_jobs')
		.select('status, error_message, attempts, graph_error_code, response_status')
		.eq('user_id', userId)
		.eq('platform', platform)
		.eq('content_item_key', memory.id)
		.order('updated_at', { ascending: false })
		.limit(1)
		.maybeSingle();

	return diagnosticsFromPublishJob(memory, job as PublishJobRow | undefined);
}
