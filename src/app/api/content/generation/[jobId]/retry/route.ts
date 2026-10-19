import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { getSupabaseService } from '@/lib/supabaseService';
import { dispatchNativeContentBatchWorker } from '@/lib/intelligence/content/nativeBatchGeneration';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(_request: Request, context: { params: Promise<{ jobId: string }> }) {
	const { jobId } = await context.params;
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

	const admin = getSupabaseService();
	const { data: job, error } = await admin
		.from('generation_jobs')
		.select('generation_job_id, user_id, status, engine')
		.eq('generation_job_id', jobId)
		.eq('user_id', user.id)
		.maybeSingle();

	if (error || !job) {
		return NextResponse.json({ error: 'Generation job not found' }, { status: 404 });
	}

	if (job.engine && job.engine !== 'native') {
		return NextResponse.json(
			{
				error: 'Only native generation jobs can be retried here. Legacy Make jobs require LEGACY_MAKE_ENABLED rollback.',
				code: 'legacy_job',
			},
			{ status: 400 },
		);
	}

	if (!['failed', 'partial', 'stalled'].includes(String(job.status))) {
		return NextResponse.json(
			{ error: `Job status "${job.status}" cannot be retried. Wait for completion or start a new generation.` },
			{ status: 400 },
		);
	}

	await admin
		.from('generation_jobs')
		.update({ status: 'in_progress', error_message: null, completed_at: null })
		.eq('generation_job_id', jobId);

	try {
		await dispatchNativeContentBatchWorker(jobId);
	} catch (dispatchError) {
		console.error('[Generation Retry] Dispatch failed:', dispatchError);
		return NextResponse.json(
			{
				error: 'Retry queued but worker dispatch failed. Try again in a moment.',
				generation_job_id: jobId,
			},
			{ status: 502 },
		);
	}

	return NextResponse.json({
		ok: true,
		generation_job_id: jobId,
		message: 'Native generation retry started.',
		status_href: `/api/content/generation/${jobId}`,
	});
}
