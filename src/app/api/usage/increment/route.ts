import { NextResponse } from 'next/server';
import { getSupabaseService } from '@/lib/supabaseService';
import dayjs from 'dayjs';

export const runtime = 'nodejs';

export async function POST(req: Request) {
	try {
		const { userId, count = 1 } = await req.json();
		if (!userId) return NextResponse.json({ error: 'Missing userId' }, { status: 400 });
		const apiKey = req.headers.get('x-api-key') || req.headers.get('authorization')?.replace('Bearer ', '');
		const expectedKey = process.env.MAKE_API_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
		if (expectedKey && apiKey !== expectedKey) {
			return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
		}
		const ym = dayjs().format('YYYY-MM');
		const supabase = getSupabaseService();
		const { data: existing } = await supabase
			.from('usage_posts')
			.select('*')
			.eq('user_id', userId)
			.eq('year_month', ym)
			.maybeSingle();
		if (existing) {
			await supabase.from('usage_posts').update({ posts: (existing as any).posts + count }).eq('id', (existing as any).id);
		} else {
			await supabase.from('usage_posts').insert({ user_id: userId, year_month: ym, posts: count });
		}
		return NextResponse.json({ ok: true });
	} catch (e: any) {
		return NextResponse.json({ error: e?.message || 'Failed to increment usage' }, { status: 500 });
	}
}


