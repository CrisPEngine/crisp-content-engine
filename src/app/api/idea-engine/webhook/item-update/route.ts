/**
 * POST /api/idea-engine/webhook/item-update
 *
 * Receives a regenerated single item from Make.com.
 * Updates the specific idea_engine_items row and resets status to 'pending'.
 *
 * Auth: x-make-secret or x-api-key header.
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSupabaseService } from '@/lib/supabaseService';

export const runtime = 'nodejs';

const ItemUpdateSchema = z.object({
	item_id: z.string().uuid(),
	channel: z.string(),
	post_title: z.string().optional(),
	body_draft: z.string().optional(),
	image_prompt: z.string().optional(),
	hashtags: z.string().optional(),
	error: z.string().optional(),
});

export async function POST(request: Request) {
	try {
		const secret = request.headers.get('x-make-secret');
		const apiKey = request.headers.get('x-api-key') || request.headers.get('x-make-apikey');
		const isAuthorised =
			(process.env.MAKE_SHARED_SECRET && secret === process.env.MAKE_SHARED_SECRET) ||
			(process.env.MAKE_API_KEY && apiKey === process.env.MAKE_API_KEY);

		if (!isAuthorised) {
			return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
		}

		const body = await request.json().catch(() => null);
		if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 });

		const parsed = ItemUpdateSchema.safeParse(body);
		if (!parsed.success) {
			return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
		}

		const { item_id, post_title, body_draft, image_prompt, hashtags, error: makeError } = parsed.data;
		const admin = getSupabaseService();

		if (makeError) {
			await admin
				.from('idea_engine_items')
				.update({ status: 'pending', updated_at: new Date().toISOString() })
				.eq('id', item_id);
			return NextResponse.json({ ok: true, message: 'Regeneration failed; status reset' });
		}

		const updates: Record<string, any> = {
			status: 'pending',
			updated_at: new Date().toISOString(),
		};
		if (post_title !== undefined) updates.post_title = post_title;
		if (body_draft !== undefined) updates.body_draft = body_draft;
		if (image_prompt !== undefined) updates.image_prompt = image_prompt;
		if (hashtags !== undefined) updates.hashtags = hashtags;

		await admin.from('idea_engine_items').update(updates).eq('id', item_id);

		return NextResponse.json({ ok: true });

	} catch (error: any) {
		console.error('[IdeaEngine/ItemUpdate] Error:', error);
		return NextResponse.json({ error: error?.message || 'Server error' }, { status: 500 });
	}
}
