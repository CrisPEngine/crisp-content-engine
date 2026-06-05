/**
 * POST /api/idea-engine/items/[itemId]/regenerate
 *
 * Regenerates a single item using native OpenAI or Make (legacy fallback).
 */

import { NextResponse, after } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { getSupabaseService } from '@/lib/supabaseService';
import { isIdeaEngineNativeEnabled } from '@/lib/featureFlags';
import { generateSingleItem } from '@/lib/idea-engine';

export const runtime = 'nodejs';

export async function POST(
	_request: Request,
	context: { params: Promise<{ itemId: string }> }
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
		if (userError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

		const { itemId } = await context.params;
		const admin = getSupabaseService();

		const { data: item } = await admin
			.from('idea_engine_items')
			.select('id, run_id, user_id, channel, series_position, series_total, status')
			.eq('id', itemId)
			.single();

		if (!item || item.user_id !== user.id) {
			return NextResponse.json({ error: 'Item not found' }, { status: 404 });
		}

		if (item.status === 'queued') {
			return NextResponse.json({ error: 'Item has already been added to the queue' }, { status: 400 });
		}

		const { data: run } = await admin
			.from('idea_engine_runs')
			.select('id, series_run_id, idea, goal, notes, brand_profile_id, selected_channels')
			.eq('id', item.run_id)
			.single();

		if (!run) {
			return NextResponse.json({ error: 'Parent run not found' }, { status: 404 });
		}

		await admin
			.from('idea_engine_items')
			.update({ status: 'regenerating', updated_at: new Date().toISOString() })
			.eq('id', itemId);

		if (isIdeaEngineNativeEnabled()) {
			if (!process.env.OPENAI_API_KEY?.trim()) {
				await admin.from('idea_engine_items').update({ status: 'pending' }).eq('id', itemId);
				return NextResponse.json({ error: 'Idea Engine is not configured' }, { status: 503 });
			}

			after(async () => {
				try {
					await generateSingleItem(itemId);
				} catch (err) {
					console.error('[IdeaEngine/Regenerate] Native regen failed:', err);
				}
			});

			return NextResponse.json({ ok: true, message: 'Regeneration started', generation: 'native' });
		}

		const MAKE_URL = process.env.MAKE_IDEA_ENGINE_SERIES_WEBHOOK_URL;
		if (!MAKE_URL) {
			await admin.from('idea_engine_items').update({ status: 'pending' }).eq('id', itemId);
			return NextResponse.json({ error: 'Idea Engine is not configured' }, { status: 503 });
		}

		const appUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || 'https://app.crispdigital.io';

		const makePayload = {
			action: 'regenerate_single',
			series_run_id: run.series_run_id,
			item_id: itemId,
			channel: item.channel,
			series_position: item.series_position,
			series_total: item.series_total,
			idea: run.idea,
			goal: run.goal,
			notes: run.notes,
			brand_profile_id: run.brand_profile_id,
			callback_url: `${appUrl}/api/idea-engine/webhook/item-update`,
		};

		try {
			await fetch(MAKE_URL, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					...(process.env.MAKE_API_KEY && { 'x-api-key': process.env.MAKE_API_KEY }),
				},
				body: JSON.stringify(makePayload),
			});
		} catch (makeErr) {
			console.error('[IdeaEngine/Regenerate] Make call failed:', makeErr);
			await admin.from('idea_engine_items').update({ status: 'pending' }).eq('id', itemId);
			return NextResponse.json({ error: 'Regeneration request failed. Please try again.' }, { status: 502 });
		}

		return NextResponse.json({ ok: true, message: 'Regeneration started' });

	} catch (error: any) {
		console.error('[IdeaEngine/Regenerate] Error:', error);
		return NextResponse.json({ error: error?.message || 'Server error' }, { status: 500 });
	}
}
