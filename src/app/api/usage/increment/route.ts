import { NextResponse } from 'next/server';
import { getSupabaseService } from '@/lib/supabaseService';
import dayjs from 'dayjs';

export const runtime = 'nodejs';

export async function POST(req: Request) {
	try {
		const { userId, count = 1, generation_job_id } = await req.json();
		if (!userId) return NextResponse.json({ error: 'Missing userId' }, { status: 400 });
		
		const apiKey = req.headers.get('x-api-key') || req.headers.get('authorization')?.replace('Bearer ', '');
		const expectedKey = process.env.MAKE_API_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
		if (expectedKey && apiKey !== expectedKey) {
			return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
		}
		
		const supabase = getSupabaseService();
		
		// Idempotency check: if generation_job_id is provided, check if we've already incremented for this job
		if (generation_job_id) {
			const { data: job } = await supabase
				.from('generation_jobs')
				.select('usage_incremented')
				.eq('generation_job_id', generation_job_id)
				.maybeSingle();
			
			if (job?.usage_incremented) {
				console.log('[Usage Increment] Already incremented for job:', generation_job_id);
				return NextResponse.json({ ok: true, already_incremented: true });
			}
		}
		
		const ym = dayjs().format('YYYY-MM');
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
		
		console.log('[Usage Increment] Incremented:', { userId, count, generation_job_id });
		return NextResponse.json({ ok: true });
	} catch (e: any) {
		return NextResponse.json({ error: e?.message || 'Failed to increment usage' }, { status: 500 });
	}
}


