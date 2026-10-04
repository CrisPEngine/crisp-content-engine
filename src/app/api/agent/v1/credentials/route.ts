import { NextResponse } from 'next/server';
import { issueAgentCredential, toPublicCredential } from '@/lib/agent/credentials';
import { getAgentStore } from '@/lib/agent/controlStore';
import { AGENT_CAPABILITIES, CHIEF_OF_STAFF_CAPABILITIES, FOLIAN_GROK_CAPABILITIES, FOLIAN_GROK_RATE_LIMIT, type AgentCapability } from '@/lib/agent/policy';
import { requireSessionUserId } from '@/lib/agent/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function isCapability(value: string): value is AgentCapability {
	return (AGENT_CAPABILITIES as readonly string[]).includes(value);
}

export async function GET() {
	const userId = await requireSessionUserId();
	if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
	const credentials = await getAgentStore().listCredentials(userId);
	return NextResponse.json({ credentials: credentials.map(toPublicCredential) });
}

export async function POST(request: Request) {
	const userId = await requireSessionUserId();
	if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
	const body = (await request.json()) as {
		name?: string;
		allowedBrandIds?: string[];
		capabilities?: string[];
		environment?: 'production' | 'staging' | 'test';
		expiresAt?: string;
		useFolianPolicy?: boolean;
		useChiefOfStaffPolicy?: boolean;
	};
	const chiefOfStaff = body.useChiefOfStaffPolicy === true;
	if (!body.name?.trim() || (!chiefOfStaff && !body.allowedBrandIds?.length)) {
		return NextResponse.json({ error: 'name and allowedBrandIds are required' }, { status: 400 });
	}
	const requested = chiefOfStaff ? CHIEF_OF_STAFF_CAPABILITIES : body.useFolianPolicy ? FOLIAN_GROK_CAPABILITIES : (body.capabilities ?? []).filter(isCapability);
	if (requested.length === 0) return NextResponse.json({ error: 'At least one capability is required' }, { status: 400 });
	const issued = await issueAgentCredential({
		name: body.name.trim(),
		ownerUserId: userId,
		allowedBrandIds: chiefOfStaff ? [] : body.allowedBrandIds ?? [],
		capabilities: requested,
		scope: chiefOfStaff ? 'OWNER_ACCOUNT' : (body.allowedBrandIds ?? []).length > 1 ? 'SELECTED_BRANDS' : 'BRAND',
		environment: body.environment ?? 'production',
		expiresAt: body.expiresAt,
		rateLimit: body.useFolianPolicy || chiefOfStaff ? FOLIAN_GROK_RATE_LIMIT : undefined,
	});
	return NextResponse.json({ credential: issued.credential, secret: issued.secret, secretShownOnce: true });
}
