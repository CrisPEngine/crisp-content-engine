import { NextResponse } from 'next/server';
import { enforceCaps } from '@/lib/enforceCaps';
import { createServerClient, type CookieOptions } from '@supabase/ssr';

export const runtime = 'nodejs';

async function getUserId(req: Request): Promise<string | null> {
	const res = NextResponse.next();
	const supabase = createServerClient(
		process.env.NEXT_PUBLIC_SUPABASE_URL!,
		process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
		{
			cookies: {
				get(name: string) { return (req as any).cookies?.get?.(name)?.value; },
				set(name: string, value: string, options: CookieOptions) { res.cookies.set({ name, value, ...options }); },
				remove(name: string, options: CookieOptions) { res.cookies.set({ name, value: '', ...options, expires: new Date(0) }); },
			},
		}
	);
	const { data: { user } } = await supabase.auth.getUser();
	return user?.id ?? null;
}

export async function GET(req: Request) {
	const userId = await getUserId(req);
	if (!userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
	const check = await enforceCaps(userId);
	return NextResponse.json(check);
}


