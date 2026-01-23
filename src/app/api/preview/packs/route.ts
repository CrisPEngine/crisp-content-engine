import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { getSupabaseService } from '@/lib/supabaseService';

export const runtime = 'nodejs';

export async function GET(req: Request) {
	try {
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
			}
		);

		const { data: { user }, error: userError } = await supabase.auth.getUser();
		if (userError || !user) {
			return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
		}

		const admin = getSupabaseService();
		
		// Fetch user's preview packs, ordered by created_at desc
		const { data: packs, error: packsError } = await admin
			.from('preview_packs')
			.select('id, created_at, persona, tone, goal, channel, pack_title, status')
			.eq('user_id', user.id)
			.order('created_at', { ascending: false });

		if (packsError) {
			console.error('[Preview Packs] Error:', packsError);
			return NextResponse.json({ error: 'Failed to load preview packs' }, { status: 500 });
		}

		return NextResponse.json({ packs: packs || [] });
	} catch (error: any) {
		console.error('[Preview Packs] Error:', error);
		return NextResponse.json({ error: error?.message || 'Failed to load preview packs' }, { status: 500 });
	}
}
