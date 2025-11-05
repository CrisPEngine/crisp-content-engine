import { NextResponse } from 'next/server';
import { enforceCaps } from '@/lib/enforceCaps';

export const runtime = 'nodejs';

export async function POST(req: Request) {
	const body = await req.json().catch(() => ({}));
	const userId: string | undefined = body?.userId;
	const items: any[] = body?.items ?? [];
	if (!userId) return NextResponse.json({ error: 'Missing userId' }, { status: 400 });
	if (!Array.isArray(items) || items.length === 0) {
		return NextResponse.json({ error: 'No content items' }, { status: 400 });
	}
	const check = await enforceCaps(userId);
	if (!check.ok) {
		return NextResponse.json({ error: check.reason, usage: check.usage, caps: check.caps }, { status: 403 });
	}
	const remaining = (check.caps?.posts_per_month ?? 999999) - (check.usage?.posts ?? 0);
	if (items.length > remaining) {
		return NextResponse.json({ error: `This would exceed your cap. Remaining: ${remaining}, trying to schedule: ${items.length}.` }, { status: 403 });
	}
	// TODO: integrate with Make/Airtable/Buffer here
	return NextResponse.json({ ok: true, scheduled: items.length });
}


