import { NextResponse } from 'next/server';
import { getAgentStore } from '@/lib/agent/controlStore';
import { requireSessionUserId } from '@/lib/agent/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
	const userId = await requireSessionUserId();
	if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
	const credentialId = new URL(request.url).searchParams.get('credentialId') ?? undefined;
	const entries = await getAgentStore().listAudit(userId, credentialId);
	return NextResponse.json({
		entries: entries.map((entry) => ({
			id: entry.id,
			credentialId: entry.credentialId,
			brandId: entry.brandId,
			action: entry.action,
			capability: entry.capability,
			consequenceLevel: entry.consequenceLevel,
			requestId: entry.requestId,
			resultStatus: entry.resultStatus,
			approvalRequired: entry.approvalRequired,
			errorCode: entry.errorCode,
			latencyMs: entry.latencyMs,
			createdAt: entry.createdAt,
		})),
	});
}
