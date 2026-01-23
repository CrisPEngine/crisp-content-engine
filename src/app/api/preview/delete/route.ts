import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { z } from 'zod';
import { getSupabaseService } from '@/lib/supabaseService';

export const runtime = 'nodejs';

const requestSchema = z.object({
	previewPackId: z.string().uuid(),
});

export async function POST(req: Request) {
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

		const body = await req.json().catch(() => ({}));
		const { previewPackId } = requestSchema.parse(body);

		console.log('[Preview Delete] start', { previewPackId, userId: user.id });

		const admin = getSupabaseService();
		
		// Verify ownership and delete
		const { error: deleteError } = await admin
			.from('preview_packs')
			.delete()
			.eq('id', previewPackId)
			.eq('user_id', user.id); // Ensure ownership

		if (deleteError) {
			console.error('[Preview Delete] Error:', deleteError);
			return NextResponse.json({ error: 'Failed to delete preview pack' }, { status: 500 });
		}

		console.log('[Preview Delete] success', { previewPackId });
		return NextResponse.json({ ok: true });
	} catch (error: any) {
		console.error('[Preview Delete] Error:', error);
		if (error instanceof z.ZodError) {
			return NextResponse.json({ error: 'Invalid request body', details: error.issues }, { status: 400 });
		}
		return NextResponse.json({ error: error?.message || 'Failed to delete preview' }, { status: 500 });
	}
}
