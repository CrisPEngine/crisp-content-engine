/**
 * POST /api/idea-engine/webhook/callback
 *
 * Receives generated items from the Make.com Idea Engine scenario.
 * Stores items in idea_engine_items, updates run status to 'review',
 * and creates a quota RESERVATION (does NOT increment usage_posts).
 *
 * Quota is only converted to "used" when the user confirms items in
 * /api/idea-engine/confirm. This is the reservation-based quota model.
 *
 * Auth: x-make-secret header (MAKE_SHARED_SECRET).
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSupabaseService } from '@/lib/supabaseService';
import { upsertReservation } from '@/lib/enforceCaps';

export const runtime = 'nodejs';

const ItemSchema = z.object({
	channel: z.string(),
	post_title: z.string().optional(),
	body_draft: z.string().optional(),
	image_prompt: z.string().optional(),
	hashtags: z.string().optional(),
	series_position: z.number().int().optional(),
	series_total: z.number().int().optional(),
});

const CallbackSchema = z.object({
	series_run_id: z.string().uuid(),
	items: z.array(ItemSchema).min(1),
	// Make may also send error state
	error: z.string().optional(),
});

export async function POST(request: Request) {
	try {
		// ── Auth ──────────────────────────────────────────────────
		const secret = request.headers.get('x-make-secret');
		const expected = process.env.MAKE_SHARED_SECRET;
		// Allow MAKE_API_KEY as fallback
		const apiKey = request.headers.get('x-api-key') || request.headers.get('x-make-apikey');
		const expectedApiKey = process.env.MAKE_API_KEY;

		const isAuthorised =
			(expected && secret === expected) ||
			(expectedApiKey && apiKey === expectedApiKey);

		if (!isAuthorised) {
			console.warn('[IdeaEngine/Callback] Unauthorized call — bad secret or API key');
			return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
		}

		const body = await request.json().catch(() => null);
		if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 });

		const parsed = CallbackSchema.safeParse(body);
		if (!parsed.success) {
			console.error('[IdeaEngine/Callback] Validation failed:', parsed.error.issues);
			return NextResponse.json({ error: 'Invalid payload', details: parsed.error.issues }, { status: 400 });
		}

		const { series_run_id, items, error: makeError } = parsed.data;
		const admin = getSupabaseService();

		// ── Look up the run ───────────────────────────────────────
		const { data: run, error: runLookupError } = await admin
			.from('idea_engine_runs')
			.select('id, user_id, status, selected_channels')
			.eq('series_run_id', series_run_id)
			.single();

		if (runLookupError || !run) {
			console.error('[IdeaEngine/Callback] Run not found for series_run_id:', series_run_id);
			return NextResponse.json({ error: 'Run not found' }, { status: 404 });
		}

		if (run.status === 'cancelled') {
			return NextResponse.json({ ok: true, message: 'Run was cancelled; items discarded' });
		}

		// ── Handle Make error ─────────────────────────────────────
		if (makeError) {
			await admin
				.from('idea_engine_runs')
				.update({ status: 'failed', error: makeError })
				.eq('id', run.id);
			return NextResponse.json({ ok: true });
		}

		// ── Insert items ──────────────────────────────────────────
		const itemInserts = items.map((item, idx) => ({
			run_id: run.id,
			user_id: run.user_id,
			channel: item.channel,
			post_title: item.post_title || null,
			body_draft: item.body_draft || null,
			image_prompt: item.image_prompt || null,
			hashtags: item.hashtags || null,
			series_position: item.series_position ?? (idx + 1),
			series_total: item.series_total ?? items.length,
			status: 'pending',
		}));

		const { error: insertError } = await admin.from('idea_engine_items').insert(itemInserts);

		if (insertError) {
			console.error('[IdeaEngine/Callback] Failed to insert items:', insertError);
			await admin.from('idea_engine_runs').update({ status: 'failed', error: 'Failed to store generated items' }).eq('id', run.id);
			return NextResponse.json({ error: 'Failed to store items' }, { status: 500 });
		}

		// ── Create quota reservation (NOT a direct usage increment) ──
		// Count successfully returned items per channel
		const channelCounts: Record<string, number> = {};
		for (const item of items) {
			const ch = (item.channel || '').toLowerCase();
			channelCounts[ch] = (channelCounts[ch] || 0) + 1;
		}

		// Reservation is released on delete/cancel; converted to usage only on confirm
		await upsertReservation(run.user_id, run.id, {
			linkedin: channelCounts['linkedin'] ?? 0,
			x: channelCounts['x'] ?? 0,
			blog: channelCounts['blog'] ?? 0,
			meta_pool: (channelCounts['instagram'] ?? 0) + (channelCounts['facebook'] ?? 0),
		});

		// ── Update run status ─────────────────────────────────────
		await admin
			.from('idea_engine_runs')
			.update({
				status: 'review',
				total_generated: items.length,
				total_expected: items.length,
			})
			.eq('id', run.id);

		console.log('[IdeaEngine/Callback] Series ready for review:', {
			series_run_id,
			item_count: items.length,
			channels: Object.keys(channelCounts),
		});

		return NextResponse.json({ ok: true, items_received: items.length });

	} catch (error: any) {
		console.error('[IdeaEngine/Callback] Unexpected error:', error);
		return NextResponse.json({ error: error?.message || 'Server error' }, { status: 500 });
	}
}
