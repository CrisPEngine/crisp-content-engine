import { NextResponse } from 'next/server';
import { getIntelligenceStore } from '@/lib/intelligence/actions';
import { requireIntelligenceUser } from '@/lib/intelligence/http';
import { workflowStatus } from '@/lib/content/workflow';
import { listNativeQueueForUser } from '@/lib/content/listNativeQueue';
import type { NativeQueueStage } from '@/lib/content/nativeQueueView';
import { isAgentMetaMemory, syncAgentMetaPublishJob } from '@/lib/publish/agentMetaJob';
import { isAgentThreadsMemory, syncAgentThreadsPublishJob } from '@/lib/publish/agentThreadsJob';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function parseStage(value: string | null): NativeQueueStage {
	if (value === 'schedule' || value === 'published') return value;
	return 'approval';
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
		const body = (await request.json()) as { contentId?: string; decision?: 'approve' | 'reject' };
		if (!body.contentId || (body.decision !== 'approve' && body.decision !== 'reject')) {
			return NextResponse.json({ error: 'contentId and decision are required' }, { status: 400 });
		}
		const store = getIntelligenceStore();
		const memory = await store.getMemory(userId, body.contentId);
		if (!memory) return NextResponse.json({ error: 'Content not found' }, { status: 404 });
		const nextStatus = body.decision === 'approve' ? 'approved' : 'rejected';
		await store.saveMemory(userId, {
			...memory,
			publicationStatus: nextStatus,
			publicationDate: body.decision === 'approve' ? undefined : memory.publicationDate,
		});
		return NextResponse.json({
			id: memory.id,
			workflowStatus: workflowStatus({ publicationStatus: nextStatus, publicationDate: null }),
			scheduled: false,
		});
	} catch {
		return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
	}
}

export async function PATCH(request: Request) {
	try {
		const { userId } = await requireIntelligenceUser();
		const body = (await request.json()) as {
			contentId?: string;
			scheduled_time?: string | null;
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

		const metadata = { ...(memory.metadata ?? {}) };
		if (body.hashtags !== undefined) metadata.hashtags = body.hashtags;
		if (body.image_prompt !== undefined) metadata.image_prompt = body.image_prompt;
		if (body.imageUrl) {
			metadata.image_reference_url = body.imageUrl;
			metadata.imageReferenceUrl = body.imageUrl;
			if (body.cloudinaryId) metadata.image_cloudinary_id = body.cloudinaryId;
		}

		let publicationDate = memory.publicationDate;
		let publicationStatus = memory.publicationStatus;

		if (body.scheduled_time !== undefined) {
			publicationDate = body.scheduled_time;
			if (body.scheduled_time) {
				publicationStatus = 'scheduled';
			} else if (publicationStatus === 'scheduled') {
				publicationStatus = 'approved';
			}
		}

		const updated = await store.saveMemory(userId, {
			...memory,
			hook: body.title !== undefined ? body.title : memory.hook,
			body: body.content !== undefined ? body.content : memory.body,
			publicationStatus,
			publicationDate,
			metadata,
		});

		if (body.scheduled_time && publicationStatus === 'scheduled') {
			if (isAgentThreadsMemory(updated)) {
				await syncAgentThreadsPublishJob({ userId, memory: updated, publishAt: body.scheduled_time });
			} else if (isAgentMetaMemory(updated)) {
				await syncAgentMetaPublishJob({ userId, memory: updated, publishAt: body.scheduled_time });
			}
		}

		return NextResponse.json({ ok: true, id: updated.id, scheduled_date: updated.publicationDate ?? null });
	} catch (error: unknown) {
		const message = error instanceof Error ? error.message : 'Update failed';
		return NextResponse.json({ error: message }, { status: 400 });
	}
}
