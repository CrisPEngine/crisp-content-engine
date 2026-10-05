import { NextResponse } from 'next/server';
import { getIntelligenceStore } from '@/lib/intelligence/actions';
import { requireIntelligenceUser } from '@/lib/intelligence/http';
import { workflowStatus } from '@/lib/content/workflow';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function platformLabel(channel: string): string {
	if (channel === 'linkedin') return 'LinkedIn';
	if (channel === 'x') return 'X';
	if (channel === 'blog') return 'Blog';
	if (channel === 'instagram' || channel === 'facebook') return 'Meta';
	return channel;
}

export async function GET(request: Request) {
	try {
		const { userId } = await requireIntelligenceUser();
		const url = new URL(request.url);
		const platform = url.searchParams.get('platform');
		const brandProfileId = url.searchParams.get('brand_profile_id');
		const store = getIntelligenceStore();
		const brains = await store.listBrandBrains(userId);
		const items = [];
		for (const brain of brains) {
			if (brandProfileId && brain.airtableBrandId !== brandProfileId && brain.id !== brandProfileId) continue;
			const memory = await store.listMemory(userId, brain.id);
			for (const item of memory) {
				const status = workflowStatus(item);
				if (!['NEEDS_APPROVAL', 'APPROVED_UNSCHEDULED', 'REJECTED'].includes(status)) continue;
				const label = platformLabel(item.channel);
				if (platform && label !== platform) continue;
				items.push({
					id: item.id,
					airtableContentId: item.airtableContentId ?? null,
					source: 'native',
					title: item.hook || item.topic || 'Untitled draft',
					platform: label,
					content: item.body ?? '',
					status: status === 'NEEDS_APPROVAL' ? 'Needs Approval' : status,
					workflowStatus: status,
					content_type: item.contentType,
					scheduled_date: status === 'SCHEDULED' ? item.publicationDate ?? null : null,
					proposedSchedule: typeof item.metadata?.proposedSchedule === 'string' ? item.metadata.proposedSchedule : null,
					created_time: item.createdAt,
					brand_name: brain.identity.name,
					brand_profile_id: brain.airtableBrandId,
					destination: item.destination ?? null,
		evidence: /source:/i.test(`${item.body ?? ''}\n${item.sourceIdea ?? ''}`),
					createdBy: typeof item.metadata?.submittedBy === 'string' ? 'Agent' : 'CCE',
				});
			}
		}
		return NextResponse.json({ items });
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
		return NextResponse.json({ id: memory.id, workflowStatus: workflowStatus({ publicationStatus: nextStatus, publicationDate: null }), scheduled: false });
	} catch {
		return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
	}
}
