import 'server-only';

import { getSupabaseService } from '@/lib/supabaseService';
import { isThreadsPublishingEnabled } from '@/lib/featureFlags';
import { getIntelligenceStore } from '@/lib/intelligence/actions';
import type { ContentMemoryRecord } from '@/lib/intelligence/types';
import { resolvePublishDestination } from '@/lib/social/resolveDestination';
import { getAuthorizationSecrets } from '@/lib/social/authorizationSecrets';
import { AgentError } from '@/lib/agent/errors';
import { assertMemoryChannelConstraints } from '@/lib/channels/validateMemory';
import { getNativeContentStore } from '@/lib/media/store';

export function isAgentThreadsMemory(memory: Pick<ContentMemoryRecord, 'channel'>): boolean {
	return String(memory.channel).toLowerCase() === 'threads';
}

function isPublicHttpsUrl(url: string): boolean {
	try {
		return new URL(url).protocol === 'https:';
	} catch {
		return false;
	}
}

export async function resolveAgentThreadsAttachedImageUrl(ownerUserId: string, contentId: string): Promise<string | null> {
	const store = getNativeContentStore();
	const links = await store.listLinks(ownerUserId, 'content', contentId);
	for (const link of links) {
		const asset = await store.getAsset(ownerUserId, link.assetId);
		if (asset?.assetType !== 'image') continue;
		const url = asset.url?.trim();
		if (url && isPublicHttpsUrl(url)) return url;
	}
	return null;
}

export function buildAgentThreadsPayload(
	memory: ContentMemoryRecord,
	targetId: string,
	destinationId?: string,
	attachedImageUrl?: string | null,
) {
	const metadata = memory.metadata ?? {};
	const imageUrl =
		(typeof attachedImageUrl === 'string' && attachedImageUrl && isPublicHttpsUrl(attachedImageUrl) ? attachedImageUrl : null) ||
		(typeof metadata.imageReferenceUrl === 'string' && metadata.imageReferenceUrl) ||
		(typeof metadata.image_reference_url === 'string' && metadata.image_reference_url) ||
		null;
	const videoUrl =
		(typeof metadata.videoReferenceUrl === 'string' && metadata.videoReferenceUrl) ||
		(typeof metadata.video_reference_url === 'string' && metadata.video_reference_url) ||
		null;

	return {
		text: memory.body || '',
		imageUrl,
		videoUrl,
		contentItemKey: memory.id,
		platform: 'threads' as const,
		targetId,
		destinationId,
		source: 'agent' as const,
		memoryId: memory.id,
		createdAt: new Date().toISOString(),
	};
}

function normalizeScheduledTime(publishAt: string | undefined): Date {
	const now = new Date();
	let scheduledTime = publishAt ? new Date(publishAt) : now;
	if (Number.isNaN(scheduledTime.getTime())) {
		throw new AgentError('invalid_input', 'publishAt must be a valid ISO timestamp.', 400);
	}
	if (scheduledTime < now) scheduledTime = now;
	return scheduledTime;
}

async function applyPublishSpacing(admin: ReturnType<typeof getSupabaseService>, platform: string, targetId: string, scheduledTime: Date) {
	const { data: recentJobs } = await admin
		.from('publish_jobs')
		.select('scheduled_time')
		.eq('platform', platform)
		.eq('target_id', targetId)
		.order('scheduled_time', { ascending: false })
		.limit(1);

	if (recentJobs?.length) {
		const lastScheduledTime = new Date(recentJobs[0].scheduled_time);
		const sixtySecondsAfterLast = new Date(lastScheduledTime.getTime() + 60 * 1000);
		if (scheduledTime < sixtySecondsAfterLast) return sixtySecondsAfterLast;
	}
	return scheduledTime;
}

export async function cancelAgentThreadsPublishJob(userId: string, memoryId: string): Promise<void> {
	const admin = getSupabaseService();
	const { error } = await admin
		.from('publish_jobs')
		.delete()
		.eq('user_id', userId)
		.eq('platform', 'threads')
		.eq('content_item_key', memoryId)
		.in('status', ['queued', 'retrying']);

	if (error) {
		throw new AgentError('publish_queue_failed', `Failed to cancel Threads publish job: ${error.message}`, 502);
	}
}

export async function syncAgentThreadsPublishJob(input: {
	userId: string;
	memory: ContentMemoryRecord;
	publishAt?: string;
}): Promise<{ armed: boolean; skipped?: string }> {
	if (!isAgentThreadsMemory(input.memory)) {
		return { armed: false, skipped: 'not_threads' };
	}
	if (!isThreadsPublishingEnabled()) {
		return { armed: false, skipped: 'threads_disabled' };
	}
	assertMemoryChannelConstraints(input.memory);

	const store = getIntelligenceStore();
	const brain = await store.getBrandBrainById(input.userId, input.memory.brandBrainId);
	if (!brain) {
		throw new AgentError('not_found', 'Brand brain not found for this content.', 404);
	}

	const resolved = await resolvePublishDestination({
		userId: input.userId,
		airtableBrandId: brain.airtableBrandId,
		platform: 'Threads',
	});
	if (!resolved) {
		throw new AgentError(
			'destination_not_ready',
			'No Threads destination for this brand. Assign a channel in Connections.',
			409,
		);
	}

	const secrets = resolved.authorizationId ? await getAuthorizationSecrets(resolved.authorizationId) : null;
	if (!secrets?.accessToken) {
		throw new AgentError('destination_not_ready', 'Threads token is missing. Reconnect Threads from Connections.', 409);
	}

	const admin = getSupabaseService();
	const targetId = resolved.providerDestinationId;
	const contentItemKey = input.memory.id;
	let scheduledTime = await applyPublishSpacing(admin, 'threads', targetId, normalizeScheduledTime(input.publishAt));
	const attachedImageUrl = await resolveAgentThreadsAttachedImageUrl(input.userId, input.memory.id);
	const payload = buildAgentThreadsPayload(input.memory, targetId, resolved.destinationId, attachedImageUrl);

	const { data: existing } = await admin
		.from('publish_jobs')
		.select('id, status')
		.eq('platform', 'threads')
		.eq('target_id', targetId)
		.eq('content_item_key', contentItemKey)
		.maybeSingle();

	if (existing?.status === 'published' || existing?.status === 'publishing') {
		return { armed: existing.status === 'publishing' };
	}

	const row = {
		user_id: input.userId,
		brand_profile_id: brain.airtableBrandId,
		content_item_key: contentItemKey,
		platform: 'threads',
		target_id: targetId,
		status: 'queued',
		scheduled_time: scheduledTime.toISOString(),
		payload_json: payload,
		airtable_record_id: input.memory.airtableContentId ?? input.memory.id,
		error_message: null,
		attempts: 0,
		next_attempt_at: null,
	};

	if (existing) {
		const { error } = await admin.from('publish_jobs').update({ ...row, updated_at: new Date().toISOString() }).eq('id', existing.id);
		if (error) {
			throw new AgentError('publish_queue_failed', `Failed to update Threads publish job: ${error.message}`, 502);
		}
	} else {
		const { error } = await admin.from('publish_jobs').insert(row);
		if (error) {
			throw new AgentError('publish_queue_failed', `Failed to create Threads publish job: ${error.message}`, 502);
		}
	}

	return { armed: true };
}

export async function applyThreadsJobOutcomeToAgentContent(job: {
	user_id: string;
	content_item_key: string;
	payload_json?: { source?: string; memoryId?: string };
	status: string;
	remote_post_id?: string | null;
	error_message?: string | null;
}): Promise<boolean> {
	const payload = job.payload_json;
	if (payload?.source !== 'agent') return false;
	const memoryId = payload.memoryId || job.content_item_key;
	if (!memoryId) return false;

	const store = getIntelligenceStore();
	const memory = await store.getMemory(job.user_id, memoryId);
	if (!memory || !isAgentThreadsMemory(memory)) return false;

	if (job.status === 'published') {
		await store.saveMemory(job.user_id, {
			...memory,
			publicationStatus: 'published',
			publicationDate: new Date().toISOString(),
			externalPostId: job.remote_post_id ?? undefined,
			metadata: {
				...(memory.metadata ?? {}),
				publishedByCce: true,
				lastPublishError: undefined,
			},
		});
		return true;
	}

	if (job.status === 'failed') {
		await store.saveMemory(job.user_id, {
			...memory,
			publicationStatus: 'failed',
			metadata: {
				...(memory.metadata ?? {}),
				lastPublishError: job.error_message ?? 'Threads publish failed',
			},
		});
		return true;
	}

	return false;
}

export async function agentThreadsJobIsArmed(userId: string, memoryId: string): Promise<boolean> {
	const admin = getSupabaseService();
	const { data } = await admin
		.from('publish_jobs')
		.select('status')
		.eq('user_id', userId)
		.eq('platform', 'threads')
		.eq('content_item_key', memoryId)
		.in('status', ['queued', 'retrying', 'publishing'])
		.maybeSingle();
	return Boolean(data);
}
