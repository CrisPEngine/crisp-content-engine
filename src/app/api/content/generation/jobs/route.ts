import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { getSupabaseService } from '@/lib/supabaseService';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
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
	if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

	const brandProfileId = new URL(request.url).searchParams.get('brand_profile_id')?.trim();
	const limit = Math.min(Number(new URL(request.url).searchParams.get('limit') ?? 8), 20);
	const admin = getSupabaseService();

	let query = admin
		.from('generation_jobs')
		.select(
			'generation_job_id, brand_profile_id, status, requested_count, created_count, created_counts, channels, error_message, engine, created_at, completed_at',
		)
		.eq('user_id', user.id)
		.order('created_at', { ascending: false })
		.limit(limit);

	if (brandProfileId) {
		query = query.eq('brand_profile_id', brandProfileId);
	}

	const { data: jobs, error } = await query;
	if (error) return NextResponse.json({ error: error.message }, { status: 500 });

	return NextResponse.json({ jobs: jobs ?? [] });
}
