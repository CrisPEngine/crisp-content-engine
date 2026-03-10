/**
 * PATCH /api/idea-engine/items/[itemId]  — edit a draft item
 * DELETE /api/idea-engine/items/[itemId] — remove a draft item and release its quota reservation
 */

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { getSupabaseService } from '@/lib/supabaseService';
import { releaseItemFromReservation } from '@/lib/enforceCaps';

export const runtime = 'nodejs';

async function getAuthedUser(cookieStore: any) {
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
	return supabase.auth.getUser();
}

export async function PATCH(
	request: Request,
	context: { params: Promise<{ itemId: string }> }
) {
	try {
		const cookieStore = await cookies();
		const { data: { user }, error: userError } = await getAuthedUser(cookieStore);
		if (userError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

		const { itemId } = await context.params;
		const admin = getSupabaseService();

		const { data: item } = await admin
			.from('idea_engine_items')
			.select('id, user_id, status')
			.eq('id', itemId)
			.single();

		if (!item || item.user_id !== user.id) {
			return NextResponse.json({ error: 'Item not found' }, { status: 404 });
		}

		if (item.status === 'queued') {
			return NextResponse.json({ error: 'Item has already been added to the queue' }, { status: 400 });
		}

		const body = await request.json().catch(() => ({}));
		const updates: Record<string, any> = { updated_at: new Date().toISOString() };

		if (body.post_title !== undefined) updates.post_title = String(body.post_title);
		if (body.body_draft !== undefined) updates.body_draft = String(body.body_draft);
		if (body.image_prompt !== undefined) updates.image_prompt = String(body.image_prompt);
		if (body.hashtags !== undefined) updates.hashtags = String(body.hashtags);

		if (Object.keys(updates).length <= 1) {
			return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
		}

		const { error: updateError } = await admin
			.from('idea_engine_items')
			.update(updates)
			.eq('id', itemId);

		if (updateError) {
			return NextResponse.json({ error: 'Failed to update item' }, { status: 500 });
		}

		return NextResponse.json({ ok: true });

	} catch (error: any) {
		console.error('[IdeaEngine/Item PATCH] Error:', error);
		return NextResponse.json({ error: error?.message || 'Server error' }, { status: 500 });
	}
}

export async function DELETE(
	_request: Request,
	context: { params: Promise<{ itemId: string }> }
) {
	try {
		const cookieStore = await cookies();
		const { data: { user }, error: userError } = await getAuthedUser(cookieStore);
		if (userError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

		const { itemId } = await context.params;
		const admin = getSupabaseService();

		const { data: item } = await admin
			.from('idea_engine_items')
			.select('id, user_id, status, channel, run_id')
			.eq('id', itemId)
			.single();

		if (!item || item.user_id !== user.id) {
			return NextResponse.json({ error: 'Item not found' }, { status: 404 });
		}

		if (item.status === 'queued') {
			return NextResponse.json({ error: 'Item has already been added to the queue' }, { status: 400 });
		}

		// Release 1 unit of reservation for this channel before deleting.
		// The reservation was created in webhook/callback; confirm converts it to usage.
		// By reducing the reservation now, confirm will only consume quota for remaining items.
		const ch = (item.channel as string || '').toLowerCase();
		let reservationChannel: 'linkedin' | 'x' | 'blog' | 'meta_pool' | null = null;
		if (ch === 'linkedin') reservationChannel = 'linkedin';
		else if (ch === 'x') reservationChannel = 'x';
		else if (ch === 'blog') reservationChannel = 'blog';
		else if (ch === 'instagram' || ch === 'facebook') reservationChannel = 'meta_pool';

		if (reservationChannel) {
			await releaseItemFromReservation(item.run_id, reservationChannel).catch(() => {});
		}

		await admin.from('idea_engine_items').delete().eq('id', itemId);

		return NextResponse.json({ ok: true });

	} catch (error: any) {
		console.error('[IdeaEngine/Item DELETE] Error:', error);
		return NextResponse.json({ error: error?.message || 'Server error' }, { status: 500 });
	}
}
