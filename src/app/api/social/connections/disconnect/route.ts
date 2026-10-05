import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getDisconnectImpact } from '@/lib/social/disconnectImpact';
import { revokeNativeAuthorizationById } from '@/lib/social/revokeNativeAuthorization';

export const runtime = 'nodejs';

export async function GET(request: Request) {
	const supabase = await createClient();
	const {
		data: { user },
	} = await supabase.auth.getUser();
	if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

	const authorizationId = new URL(request.url).searchParams.get('authorizationId') || '';
	if (!authorizationId) {
		return NextResponse.json({ error: 'authorizationId is required' }, { status: 400 });
	}

	const impact = await getDisconnectImpact(user.id, authorizationId);
	if (!impact) return NextResponse.json({ error: 'Authorization not found' }, { status: 404 });
	return NextResponse.json({ ok: true, impact });
}

export async function POST(request: Request) {
	const supabase = await createClient();
	const {
		data: { user },
	} = await supabase.auth.getUser();
	if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

	const body = await request.json().catch(() => ({}));
	const authorizationId = body.authorizationId as string | undefined;
	if (!authorizationId) {
		return NextResponse.json({ error: 'authorizationId is required' }, { status: 400 });
	}

	const impact = await getDisconnectImpact(user.id, authorizationId);
	if (!impact) return NextResponse.json({ error: 'Authorization not found' }, { status: 404 });

	const result = await revokeNativeAuthorizationById(user.id, authorizationId);
	if (!result.removed) {
		return NextResponse.json({ error: 'Could not disconnect' }, { status: 400 });
	}

	return NextResponse.json({ ok: true, impact });
}
