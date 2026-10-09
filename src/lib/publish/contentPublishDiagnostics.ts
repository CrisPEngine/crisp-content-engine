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

	if (!job && !fromMemory) return null;

	const lastPublishError =
		(typeof job?.error_message === 'string' && job.error_message.trim()) || fromMemory?.lastPublishError;

	return {
		...(lastPublishError ? { lastPublishError } : {}),
		...(typeof job?.attempts === 'number' ? { publishAttempts: job.attempts } : {}),
		...(job && 'graph_error_code' in job ? { graphErrorCode: job.graph_error_code as string | null } : {}),
		...(job && 'response_status' in job ? { responseStatus: job.response_status as number | null } : {}),
		...(typeof job?.status === 'string' ? { publishJobStatus: job.status } : {}),
	};
}
