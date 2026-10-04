import { NextResponse } from 'next/server';
import { getAgentStore } from '@/lib/agent/controlStore';
import { requireSessionUserId } from '@/lib/agent/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
	const userId = await requireSessionUserId();
	if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
	const { id } = await context.params;
	const credential = await getAgentStore().getCredential(userId, id);
	if (!credential) return NextResponse.json({ error: 'Not found' }, { status: 404 });
	await getAgentStore().updateCredential(id, { revokedAt: new Date().toISOString() });
	return NextResponse.json({ id, revoked: true });
}
