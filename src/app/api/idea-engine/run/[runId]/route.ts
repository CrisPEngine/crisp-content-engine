/**
 * GET /api/idea-engine/run/[runId]
 *
 * Polls the status of an Idea Engine run and returns its items once available.
 * Used by the client during the 'generating' and 'review' steps.
 */

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { getSupabaseService } from '@/lib/supabaseService';
import { releaseRunReservation } from '@/lib/enforceCaps';
import { buildRunPollResponse } from '@/lib/idea-engine/persistence/buildRunPollResponse';
import { markStaleGeneratingRunIfNeeded } from '@/lib/idea-engine/persistence/staleRunGuard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
	_request: Request,
	context: { params: Promise<{ runId: string }> }
) {
	try {
		const cookieStore = await cookies();
		const supabase = createServerClient(
			process.env.NEXT_PUBLIC_SUPABASE_URL!,
			process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
			{
				cookies: {
					get(name: string) { return cookieStore.get(name)?.value; },
					set(name: string, value: string, options: CookieOptions) { cookieStore.set({ name, value, ...options }); },
					remove(name: string, options: CookieOptions) { cookieStore.set({ name, value: '', ...options }); },
				},
			}
		);

		const { data: { user }, error: userError } = await supabase.auth.getUser();
		if (userError || !user) {
			return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
		}

		const { runId } = await context.params;
		const admin = getSupabaseService();

		let { data: run, error: runError } = await admin
			.from('idea_engine_runs')
			.select('id, series_run_id, user_id, idea, goal, selected_channels, publish_mode, status, total_expected, total_generated, error, generation_warning, generation_stage, generation_started_at, created_at')
			.eq('id', runId)
			.single();

		if (runError || !run) {
			return NextResponse.json({ error: 'Run not found' }, { status: 404 });
		}

		if (run.user_id !== user.id) {
			return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
		}

		if (run) {
			const staleError = await markStaleGeneratingRunIfNeeded(run);
			if (staleError) {
				run = {
					...run,
					status: 'failed',
					error: staleError,
					generation_stage: 'failed',
				};
			}
		}

		// ── Return items (placeholders + filled) for all states ───
		// During 'generating': show placeholder skeletons with any filled items
		// During 'review' / 'completed': show all filled items
		// This enables progressive reveal without waiting for completion.
		const { data: itemRows } = await admin
			.from('idea_engine_items')
			.select('id, channel, post_title, body_draft, image_prompt, hashtags, series_position, series_total, status')
			.eq('run_id', runId)
			.order('channel', { ascending: true })
			.order('series_position', { ascending: true });

		const items = itemRows || [];

		return NextResponse.json(buildRunPollResponse(run, items));

	} catch (error: any) {
		console.error('[IdeaEngine/RunStatus] Error:', error);
		return NextResponse.json({ error: error?.message || 'Server error' }, { status: 500 });
	}
}

/**
 * DELETE /api/idea-engine/run/[runId]
 * Cancel a pending or generating run.
 */
export async function DELETE(
	_request: Request,
	context: { params: Promise<{ runId: string }> }
) {
	try {
		const cookieStore = await cookies();
		const supabase = createServerClient(
			process.env.NEXT_PUBLIC_SUPABASE_URL!,
			process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
			{
				cookies: {
					get(name: string) { return cookieStore.get(name)?.value; },
					set(name: string, value: string, options: CookieOptions) { cookieStore.set({ name, value, ...options }); },
					remove(name: string, options: CookieOptions) { cookieStore.set({ name, value: '', ...options }); },
				},
			}
		);

		const { data: { user }, error: userError } = await supabase.auth.getUser();
		if (userError || !user) {
			return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
		}

		const { runId } = await context.params;
		const admin = getSupabaseService();

		const { data: run } = await admin
			.from('idea_engine_runs')
			.select('id, user_id, status')
			.eq('id', runId)
			.single();

		if (!run || run.user_id !== user.id) {
			return NextResponse.json({ error: 'Run not found' }, { status: 404 });
		}

		if (run.status === 'completed' || run.status === 'confirmed') {
			return NextResponse.json({ error: 'Cannot cancel a completed run' }, { status: 400 });
		}

		// Release any outstanding quota reservation for this run.
		// During 'generating' or 'review', a reservation row may exist in usage_reservations
		// (created by webhook/callback). Deleting it means no quota is ever consumed.
		await releaseRunReservation(runId).catch(() => {});

		await admin
			.from('idea_engine_runs')
			.update({ status: 'cancelled', cancelled_at: new Date().toISOString() })
			.eq('id', runId);

		return NextResponse.json({ ok: true });

	} catch (error: any) {
		console.error('[IdeaEngine/RunCancel] Error:', error);
		return NextResponse.json({ error: error?.message || 'Server error' }, { status: 500 });
	}
}
