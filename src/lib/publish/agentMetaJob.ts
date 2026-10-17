import 'server-only';

import { getSupabaseService } from '@/lib/supabaseService';
import { isMetaPublishingEnabled } from '@/lib/featureFlags';
import { getIntelligenceStore } from '@/lib/intelligence/actions';
import type { ContentMemoryRecord } from '@/lib/intelligence/types';
import { resolvePublishDestination } from '@/lib/social/resolveDestination';
import { DESTINATION_TYPES } from '@/lib/social/providers';
import { getAuthorizationSecrets } from '@/lib/social/authorizationSecrets';
import { AgentError } from '@/lib/agent/errors';
import { assertMemoryChannelConstraints } from '@/lib/channels/validateMemory';
import { resolveAgentThreadsAttachedImageUrl } from '@/lib/publish/agentThreadsJob';
import { composeAgentPublishText } from '@/lib/content/socialPublishBody';

export type AgentMetaPlatform = 'facebook' | 'instagram';

export function agentMetaPlatformFromChannel(channel: string): AgentMetaPlatform | null {
	const c = String(channel).toLowerCase();
	if (c === 'instagram') return 'instagram';
	if (c === 'facebook') return 'facebook';
	return null;
}

export function isAgentMetaMemory(memory: Pick<ContentMemoryRecord, 'channel'>): boolean {
	return agentMetaPlatformFromChannel(memory.channel) !== null;
}

function airtablePlatformLabel(platform: AgentMetaPlatform): 'Facebook' | 'Instagram' {
	return platform === 'facebook' ? 'Facebook' : 'Instagram';
}

function isPublicHttpsUrl(url: string): boolean {
	try {
		return new URL(url).protocol === 'https:';
	} catch {
		return false;
	}
}

export function buildAgentMetaPayload(
	memory: ContentMemoryRecord,
	platform: AgentMetaPlatform,
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
		text: composeAgentPublishText(memory),
		imageUrl,
		videoUrl,
		contentItemKey: memory.id,
		platform,
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

async function assertMetaDestinationReady(input: {
	userId: string;
	platform: AgentMetaPlatform;
	resolved: NonNullable<Awaited<ReturnType<typeof resolvePublishDestination>>>;
}): Promise<void> {
	const admin = getSupabaseService();
	const { userId, platform, resolved } = input;
	const targetId = resolved.providerDestinationId;

	if (platform === 'facebook') {
		const { data: page } = await admin
			.from('meta_pages')
			.select('page_access_token_encrypted')
			.eq('user_id', userId)
			.eq('page_id', targetId)
			.maybeSingle();
		if (!page?.page_access_token_encrypted && resolved.source === 'legacy') {
			throw new AgentError('destination_not_ready', 'Facebook Page token is missing. Reconnect Meta from Connections.', 409);
		}
		return;
	}

	const isNativeLogin =
		resolved.source === 'native' &&
		resolved.destinationId &&
		(await admin
			.from('social_destinations')
			.select('destination_type')
			.eq('id', resolved.destinationId)
			.maybeSingle()
			.then((r) => r.data?.destination_type === DESTINATION_TYPES.INSTAGRAM_PROFESSIONAL));

	if (!isNativeLogin) {
		const { data: igAccount } = await admin
			.from('meta_instagram_accounts')
			.select('connected_page_id')
			.eq('user_id', userId)
			.eq('ig_user_id', targetId)
			.maybeSingle();
		if (!igAccount) {
			throw new AgentError('destination_not_ready', 'Instagram account not found. Connect Meta and assign a destination.', 409);
		}
		const { data: page } = await admin
			.from('meta_pages')
			.select('page_access_token_encrypted')
			.eq('user_id', userId)
			.eq('page_id', igAccount.connected_page_id)
			.maybeSingle();
		if (!page?.page_access_token_encrypted) {
			throw new AgentError('destination_not_ready', 'Connected Facebook Page token is missing. Reconnect Meta.', 409);
		}
	} else {
		const secrets = resolved.authorizationId ? await getAuthorizationSecrets(resolved.authorizationId) : null;
		if (!secrets?.accessToken) {
			throw new AgentError('destination_not_ready', 'Instagram Login token is missing. Reconnect Instagram from Connections.', 409);
		}
	}
}

export async function cancelAgentMetaPublishJob(userId: string, memoryId: string, platform: AgentMetaPlatform): Promise<void> {
	const admin = getSupabaseService();
	const { error } = await admin
		.from('publish_jobs')
		.delete()
		.eq('user_id', userId)
		.eq('platform', platform)
		.eq('content_item_key', memoryId)
		.in('status', ['queued', 'retrying']);

	if (error) {
		throw new AgentError('publish_queue_failed', `Failed to cancel ${platform} publish job: ${error.message}`, 502);
	}
}

export async function syncAgentMetaPublishJob(input: {
	userId: string;
	memory: ContentMemoryRecord;
	publishAt?: string;
}): Promise<{ armed: boolean; skipped?: string; platform?: AgentMetaPlatform }> {
	const platform = agentMetaPlatformFromChannel(input.memory.channel);
	if (!platform) {
		return { armed: false, skipped: 'not_meta' };
	}
	if (!isMetaPublishingEnabled()) {
		return { armed: false, skipped: 'meta_disabled', platform };
	}
	assertMemoryChannelConstraints(input.memory);

	const store = getIntelligenceStore();
	const brain = await store.getBrandBrainById(input.userId, input.memory.brandBrainId);
	if (!brain) {
		throw new AgentError('not_found', 'Brand brain not found for this content.', 404);
	}

	const brandKey = brain.airtableBrandId?.trim() || brain.id;
	const resolved = await resolvePublishDestination({
		userId: input.userId,
		airtableBrandId: brandKey,
		platform: airtablePlatformLabel(platform),
	});
	if (!resolved) {
		throw new AgentError(
			'destination_not_ready',
			`No ${platform === 'instagram' ? 'Instagram' : 'Facebook'} destination for this brand. Assign a channel in Connections.`,
			409,
		);
	}

	await assertMetaDestinationReady({ userId: input.userId, platform, resolved });

	const attachedImageUrl = await resolveAgentThreadsAttachedImageUrl(input.userId, input.memory.id);
	if (platform === 'instagram' && !attachedImageUrl && !buildAgentMetaPayload(input.memory, platform, resolved.providerDestinationId).imageUrl) {
		throw new AgentError(
			'publish_queue_failed',
			'Instagram requires an image. Attach an image asset to this content before approving and scheduling.',
			409,
		);
	}

	const admin = getSupabaseService();
	const targetId = resolved.providerDestinationId;
	const contentItemKey = input.memory.id;
	let scheduledTime = await applyPublishSpacing(admin, platform, targetId, normalizeScheduledTime(input.publishAt));
	const payload = buildAgentMetaPayload(input.memory, platform, targetId, resolved.destinationId, attachedImageUrl);

	const { data: existing } = await admin
		.from('publish_jobs')
		.select('id, status')
		.eq('platform', platform)
		.eq('content_item_key', contentItemKey)
		.in('status', ['published', 'publishing'])
		.maybeSingle();

	if (existing?.status === 'published' || existing?.status === 'publishing') {
		return { armed: existing.status === 'publishing', platform };
	}

	await cancelAgentMetaPublishJob(input.userId, contentItemKey, platform);

	const row = {
		user_id: input.userId,
		brand_profile_id: brandKey,
		content_item_key: contentItemKey,
		platform,
		target_id: targetId,
		status: 'queued',
		scheduled_time: scheduledTime.toISOString(),
		payload_json: payload,
		airtable_record_id: input.memory.airtableContentId ?? input.memory.id,
		error_message: null,
		attempts: 0,
		next_attempt_at: null,
	};

	const { error } = await admin.from('publish_jobs').insert(row);
	if (error) {
		throw new AgentError('publish_queue_failed', `Failed to create ${platform} publish job: ${error.message}`, 502);
	}

	return { armed: true, platform };
}

export async function applyMetaJobOutcomeToAgentContent(job: {
	user_id: string;
	content_item_key: string;
	payload_json?: { source?: string; memoryId?: string; platform?: AgentMetaPlatform };
	status: string;
	remote_post_id?: string | null;
	error_message?: string | null;
}): Promise<boolean> {
	const payload = job.payload_json;
	if (payload?.source !== 'agent') return false;
	if (payload.platform !== 'instagram' && payload.platform !== 'facebook') return false;

	const memoryId = payload.memoryId || job.content_item_key;
	if (!memoryId) return false;

	const store = getIntelligenceStore();
	const memory = await store.getMemory(job.user_id, memoryId);
	if (!memory || !isAgentMetaMemory(memory)) return false;

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
				lastPublishError: job.error_message ?? `${payload.platform} publish failed`,
			},
		});
		return true;
	}

	return false;
}

export async function agentMetaJobIsArmed(
	userId: string,
	memoryId: string,
	platform: AgentMetaPlatform,
): Promise<boolean> {
	const admin = getSupabaseService();
	const { data } = await admin
		.from('publish_jobs')
		.select('status')
		.eq('user_id', userId)
		.eq('platform', platform)
		.eq('content_item_key', memoryId)
		.in('status', ['queued', 'retrying', 'publishing'])
		.maybeSingle();
	return Boolean(data);
}

export async function recordAgentMetaScheduleFailure(
	userId: string,
	memory: ContentMemoryRecord,
	errorMessage: string,
): Promise<void> {
	const store = getIntelligenceStore();
	await store.saveMemory(userId, {
		...memory,
		publicationStatus: 'failed',
		metadata: {
			...(memory.metadata ?? {}),
			lastPublishError: errorMessage,
			scheduleRepairFailedAt: new Date().toISOString(),
		},
	});
}

/** Re-queue publish_jobs for approved scheduled agent Meta content missing a job. */
export async function repairAgentMetaPublishJobIfMissing(input: {
	userId: string;
	memory: ContentMemoryRecord;
	publishAt?: string;
	/** When true, persist a failed status + error on the content record. */
	recordFailure?: boolean;
}): Promise<{ repaired: boolean; error?: string }> {
	const platform = agentMetaPlatformFromChannel(input.memory.channel);
	if (!platform || input.memory.publicationStatus !== 'scheduled') {
		return { repaired: false };
	}
	const armed = await agentMetaJobIsArmed(input.userId, input.memory.id, platform);
	if (armed) return { repaired: false };
	try {
		await syncAgentMetaPublishJob(input);
		return { repaired: true };
	} catch (error: unknown) {
		const message =
			error instanceof AgentError
				? error.message
				: error instanceof Error
					? error.message
					: 'Meta publish queue sync failed';
		if (input.recordFailure) {
			await recordAgentMetaScheduleFailure(input.userId, input.memory, message);
		}
		return { repaired: false, error: message };
	}
}

/** Before meta-due runs: queue missing jobs or surface errors for overdue scheduled Meta content. */
export async function reconcileDueAgentMetaScheduledContent(input: {
	userId?: string;
	now?: Date;
	limit?: number;
}): Promise<{ scanned: number; repaired: number; failed: number; skipped: number }> {
	const admin = getSupabaseService();
	const now = input.now ?? new Date();
	const limit = input.limit ?? 100;
	let query = admin
		.from('content_memory')
		.select('id, user_id, channel, publication_status, publication_date, brand_brain_id')
		.eq('publication_status', 'scheduled')
		.in('channel', ['instagram', 'facebook'])
		.lte('publication_date', now.toISOString())
		.order('publication_date', { ascending: true })
		.limit(limit);
	if (input.userId) query = query.eq('user_id', input.userId);

	const { data: rows, error } = await query;
	if (error) {
		throw new AgentError('publish_queue_failed', `Failed to scan scheduled Meta content: ${error.message}`, 502);
	}

	const store = getIntelligenceStore();
	const stats = { scanned: 0, repaired: 0, failed: 0, skipped: 0 };

	for (const row of rows ?? []) {
		stats.scanned += 1;
		if (!isAgentMetaMemory({ channel: row.channel })) {
			stats.skipped += 1;
			continue;
		}
		const memory = await store.getMemory(row.user_id, row.id);
		if (!memory || memory.publicationStatus !== 'scheduled') {
			stats.skipped += 1;
			continue;
		}
		const outcome = await repairAgentMetaPublishJobIfMissing({
			userId: row.user_id,
			memory,
			publishAt: memory.publicationDate ?? row.publication_date ?? undefined,
			recordFailure: true,
		});
		if (outcome.repaired) stats.repaired += 1;
		else if (outcome.error) stats.failed += 1;
		else stats.skipped += 1;
	}

	return stats;
}
