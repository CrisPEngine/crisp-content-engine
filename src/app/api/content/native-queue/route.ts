import { NextResponse } from 'next/server';
import { getIntelligenceStore } from '@/lib/intelligence/actions';
import { requireIntelligenceUser } from '@/lib/intelligence/http';
import { workflowStatus } from '@/lib/content/workflow';
import { listNativeQueueForUser } from '@/lib/content/listNativeQueue';
import type { NativeQueueStage } from '@/lib/content/nativeQueueView';
import { isAgentMetaMemory, syncAgentMetaPublishJob } from '@/lib/publish/agentMetaJob';
import { isAgentThreadsMemory, syncAgentThreadsPublishJob } from '@/lib/publish/agentThreadsJob';
import { sanitizeSocialPublishFields } from '@/lib/content/socialPublishBody';
import { assertMemoryChannelConstraints } from '@/lib/channels/validateMemory';
import {
	applyNativeRewriteWithFeedback,
	captureNativeLearningEvent,
} from '@/lib/intelligence/learningLoop';
import { recordUserEdit } from '@/lib/intelligence/pipeline';
import { DateTime } from 'luxon';
import { timezoneFromBrandBrain } from '@/lib/intelligence/brandTimezone';
import {
	applyNativeQueueSchedulePatch,
	finalizeApprovalSchedule,
} from '@/lib/content/nativeQueueSchedule';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function parseStage(value: string | null): NativeQueueStage {
	if (value === 'schedule' || value === 'published') return value;
	return 'approval';
}

function formatScheduleLabel(iso: string, timezone: string): string {
	const dt = DateTime.fromISO(iso, { zone: 'utc' }).setZone(timezone);
	if (!dt.isValid) return iso;
	const suffix = timezone === 'Asia/Dubai' ? ' GST' : '';
	return `${dt.toFormat('ccc d LLL, h:mm a')}${suffix}`;
}

export async function GET(request: Request) {
	try {
		const { userId } = await requireIntelligenceUser();
		const url = new URL(request.url);
		const stage = parseStage(url.searchParams.get('stage'));
		const platform = url.searchParams.get('platform');
		const brandProfileId = url.searchParams.get('brand_profile_id');
		const contentBriefId = url.searchParams.get('content_brief_id');

		const items = await listNativeQueueForUser(userId, {
			stage,
			brandProfileId,
			platformTab: platform,
			contentBriefId,
		});

		return NextResponse.json({ items, source: 'native' });
	} catch {
		return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
	}
}

export async function POST(request: Request) {
	try {
		const { userId } = await requireIntelligenceUser();
		const body = (await request.json()) as {
			contentId?: string;
			decision?: 'approve' | 'reject';
			feedback?: string;
		};
		if (!body.contentId || (body.decision !== 'approve' && body.decision !== 'reject')) {
			return NextResponse.json({ error: 'contentId and decision are required' }, { status: 400 });
		}
		const store = getIntelligenceStore();
		const memory = await store.getMemory(userId, body.contentId);
		if (!memory) return NextResponse.json({ error: 'Content not found' }, { status: 404 });

		const feedback = (body.feedback ?? '').trim();

		if (body.decision === 'reject') {
			await captureNativeLearningEvent(store, {
				userId,
				brandBrainId: memory.brandBrainId,
				contentId: memory.id,
				channel: String(memory.channel),
				action: 'reject',
				feedbackText: feedback,
				beforeBody: memory.body ?? '',
			});

			if (feedback) {
				const rewritten = await applyNativeRewriteWithFeedback(store, userId, memory, feedback);
				return NextResponse.json({
					id: rewritten.id,
					workflowStatus: workflowStatus(rewritten),
					rewritten: true,
					scheduled: false,
				});
			}

			await store.saveMemory(userId, {
				...memory,
				publicationStatus: 'rejected',
				publicationDate: memory.publicationDate,
			});
			return NextResponse.json({
				id: memory.id,
				workflowStatus: workflowStatus({ publicationStatus: 'rejected', publicationDate: memory.publicationDate }),
				scheduled: false,
			});
		}

		const finalized = finalizeApprovalSchedule(memory);
		const approvedMemory = await store.saveMemory(userId, {
			...memory,
			publicationStatus: finalized.publicationStatus,
			publicationDate: finalized.publicationDate,
			metadata: finalized.metadata,
		});
		assertMemoryChannelConstraints(approvedMemory);

		if (finalized.scheduled && finalized.publishAt) {
			if (isAgentThreadsMemory(approvedMemory)) {
				await syncAgentThreadsPublishJob({ userId, memory: approvedMemory, publishAt: finalized.publishAt });
			} else if (isAgentMetaMemory(approvedMemory)) {
				await syncAgentMetaPublishJob({ userId, memory: approvedMemory, publishAt: finalized.publishAt });
			}
		}

		const ws = workflowStatus({
			publicationStatus: approvedMemory.publicationStatus,
			publicationDate: approvedMemory.publicationDate,
		});
		return NextResponse.json({
			id: approvedMemory.id,
			workflowStatus: ws,
			scheduled: finalized.scheduled,
			scheduled_date: approvedMemory.publicationDate ?? null,
		});
	} catch (error: unknown) {
		const message = error instanceof Error ? error.message : 'Request failed';
		return NextResponse.json({ error: message }, { status: error instanceof Error && message === 'Unauthorized' ? 401 : 400 });
	}
}

export async function PATCH(request: Request) {
	try {
		const { userId } = await requireIntelligenceUser();
		const body = (await request.json()) as {
			contentId?: string;
			scheduled_time?: string | null;
			scheduleIntent?: 'preference' | 'publish';
			content?: string;
			title?: string;
			hashtags?: string;
			image_prompt?: string;
			imageUrl?: string;
			cloudinaryId?: string;
		};
		if (!body.contentId) {
			return NextResponse.json({ error: 'contentId is required' }, { status: 400 });
		}

		const store = getIntelligenceStore();
		const memory = await store.getMemory(userId, body.contentId);
		if (!memory) return NextResponse.json({ error: 'Content not found' }, { status: 404 });

		const beforeBody = memory.body ?? '';
		const metadata = { ...(memory.metadata ?? {}) };
		if (body.hashtags !== undefined) metadata.hashtags = body.hashtags;
		if (body.image_prompt !== undefined) metadata.image_prompt = body.image_prompt;
		if (body.imageUrl) {
			metadata.image_reference_url = body.imageUrl;
			metadata.imageReferenceUrl = body.imageUrl;
			if (body.cloudinaryId) metadata.image_cloudinary_id = body.cloudinaryId;
		}

		const scheduleIntent = body.scheduleIntent ?? 'preference';
		let schedulePatch = applyNativeQueueSchedulePatch({
			memory: { ...memory, metadata },
			scheduledTime: body.scheduled_time,
			scheduleIntent,
		});

		if (body.scheduled_time && scheduleIntent === 'preference' && schedulePatch.metadata.proposedScheduleAt) {
			const brain = await store.getBrandBrainById(userId, memory.brandBrainId);
			const timezone = brain ? timezoneFromBrandBrain(brain) : 'UTC';
			const label = formatScheduleLabel(String(schedulePatch.metadata.proposedScheduleAt), timezone);
			schedulePatch.metadata.proposedScheduleLabel = label;
			schedulePatch.metadata.proposedSchedule = label;
		}

		const publicationDate = schedulePatch.publicationDate;
		const publicationStatus = schedulePatch.publicationStatus;
		Object.assign(metadata, schedulePatch.metadata);

		const draftBody = body.content !== undefined ? body.content : memory.body;
		const sanitized = sanitizeSocialPublishFields({
			channel: String(memory.channel),
			body: draftBody ?? '',
			cta: memory.cta,
			metadata,
		});
		const updated = await store.saveMemory(userId, {
			...memory,
			hook: body.title !== undefined ? body.title : memory.hook,
			body: sanitized.body,
			...(sanitized.cta != null ? { cta: sanitized.cta } : {}),
			publicationStatus,
			publicationDate,
			metadata: sanitized.metadata,
		});
		assertMemoryChannelConstraints(updated);

		if (body.content !== undefined && beforeBody.trim() !== sanitized.body.trim()) {
			const drafts = await store.listDrafts(userId, memory.id);
			const latestDraft = drafts.at(-1);
			if (latestDraft) {
				await recordUserEdit(store, userId, latestDraft.id, sanitized.body, memory.brandBrainId);
			}
			await captureNativeLearningEvent(store, {
				userId,
				brandBrainId: memory.brandBrainId,
				contentId: memory.id,
				channel: String(memory.channel),
				action: 'edit',
				beforeBody,
				afterBody: sanitized.body,
			});
		}

		if (schedulePatch.shouldSyncPublishJob && schedulePatch.publishAt) {
			if (isAgentThreadsMemory(updated)) {
				await syncAgentThreadsPublishJob({ userId, memory: updated, publishAt: schedulePatch.publishAt });
			} else if (isAgentMetaMemory(updated)) {
				await syncAgentMetaPublishJob({ userId, memory: updated, publishAt: schedulePatch.publishAt });
			}
		}

		return NextResponse.json({
			ok: true,
			id: updated.id,
			scheduled_date: updated.publicationDate ?? null,
			proposedSchedule: metadata.proposedScheduleLabel ?? null,
		});
	} catch (error: unknown) {
		const message = error instanceof Error ? error.message : 'Update failed';
		return NextResponse.json({ error: message }, { status: 400 });
	}
}
