import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSupabaseService } from '@/lib/supabaseService';
import { randomUUID } from 'crypto';

export const runtime = 'nodejs';

const requestSchema = z.object({
	persona: z.string().min(1),
	topics: z.any().optional(),
	tone: z.string().min(1),
	goal: z.string().min(1),
	utm_source: z.string().optional().nullable(),
	utm_campaign: z.string().optional().nullable(),
});

export async function POST(req: Request) {
	try {
		const body = await req.json().catch(() => ({}));
		const data = requestSchema.parse(body);
		const previewSessionId = randomUUID();

		const admin = getSupabaseService();
		const { error } = await admin.from('preview_sessions').insert({
			preview_session_id: previewSessionId,
			status: 'created',
			persona: data.persona,
			topics: data.topics ?? null,
			tone: data.tone,
			goal: data.goal,
			utm_source: data.utm_source ?? null,
			utm_campaign: data.utm_campaign ?? null,
		});

		if (error) {
			console.error('[Preview Create] Supabase error:', error);
			return NextResponse.json({ error: 'Failed to create preview session' }, { status: 500 });
		}

		return NextResponse.json({ previewSessionId });
	} catch (error: any) {
		const message = error?.message || 'Failed to create preview session';
		return NextResponse.json({ error: message }, { status: error instanceof z.ZodError ? 400 : 500 });
	}
}
