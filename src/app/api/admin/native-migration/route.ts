import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import {
	backfillBrandNativeStrategy,
	listBrandNativeMigrationStatus,
} from '@/lib/intelligence/strategy/brandNativeMigration';
import { dispatchStrategyGenerationWorker } from '@/lib/intelligence/strategy/generationJob';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function requireAdmin() {
	const cookieStore = await cookies();
	const supabase = createServerClient(
		process.env.NEXT_PUBLIC_SUPABASE_URL!,
		process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
		{
			cookies: {
				get(name: string) {
					return cookieStore.get(name)?.value;
				},
				set(name: string, value: string, options: CookieOptions) {
					cookieStore.set({ name, value, ...options });
				},
				remove(name: string, options: CookieOptions) {
					cookieStore.set({ name, value: '', ...options });
				},
			},
		},
	);
	const {
		data: { user },
	} = await supabase.auth.getUser();
	if (!user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
	const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', user.id).maybeSingle();
	if (!profile?.is_admin) return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
	return { userId: user.id };
}

export async function GET() {
	const auth = await requireAdmin();
	if ('error' in auth && auth.error) return auth.error;
	const brands = await listBrandNativeMigrationStatus(auth.userId!);
	return NextResponse.json({ brands });
}

export async function POST(request: Request) {
	const auth = await requireAdmin();
	if ('error' in auth && auth.error) return auth.error;
	const body = (await request.json()) as { airtableBrandId?: string; escalate?: boolean; runWebsiteResearch?: boolean };
	if (!body.airtableBrandId?.trim()) {
		return NextResponse.json({ error: 'airtableBrandId is required' }, { status: 400 });
	}
	const result = await backfillBrandNativeStrategy({
		ownerUserId: auth.userId!,
		airtableBrandId: body.airtableBrandId.trim(),
		escalate: body.escalate,
		runWebsiteResearch: body.runWebsiteResearch,
	});
	await dispatchStrategyGenerationWorker(result.jobId).catch((err) => {
		console.error('[Native migration] strategy worker dispatch failed:', err);
	});
	return NextResponse.json({ ok: true, ...result });
}
