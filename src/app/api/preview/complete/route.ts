import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSupabaseService } from '@/lib/supabaseService';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const postSchema = z
	.object({
		title: z.string().min(1),
		body: z.string().min(1),
		hooks: z.array(z.string().min(1)).length(2),
	})
	.strict();

const sectionSchema = z
	.object({
		name: z.string().min(1),
		posts: z.array(postSchema).length(3),
	})
	.strict();

const outputSchema = z
	.object({
		packTitle: z.string().min(1),
		sections: z.array(sectionSchema).length(3),
	})
	.strict();

const requestSchema = z.object({
	previewSessionId: z.string().min(1),
	outputs: outputSchema,
});

function hasDisallowedText(value: string): boolean {
	const hasHashtag = value.includes('#');
	const hasEmoji = /\p{Extended_Pictographic}/u.test(value);
	return hasHashtag || hasEmoji;
}

function validateOutput(outputs: { packTitle: string; sections: any[] }): { ok: true } | { ok: false; error: string } {
	if (hasDisallowedText(outputs.packTitle)) {
		return { ok: false, error: 'Output includes disallowed characters in packTitle' };
	}
	for (const section of outputs.sections) {
		if (hasDisallowedText(section.name)) {
			return { ok: false, error: 'Output includes disallowed characters in section name' };
		}
		for (const post of section.posts) {
			if (hasDisallowedText(post.title) || hasDisallowedText(post.body)) {
				return { ok: false, error: 'Output includes disallowed characters in post content' };
			}
			if (post.hooks.some((hook: string) => hasDisallowedText(hook))) {
				return { ok: false, error: 'Output includes disallowed characters in hooks' };
			}
		}
	}

	const expectedNames = ['Point of view', 'How-to', 'Proof or story'];
	const namesMatch = outputs.sections.every((section, index) => section.name === expectedNames[index]);
	if (!namesMatch) {
		return { ok: false, error: 'Output sections do not match required names or order' };
	}

	return { ok: true };
}

export async function POST(req: Request) {
	try {
		// Authenticate via MAKE_SHARED_SECRET header
		const secret = req.headers.get('x-make-secret') || req.headers.get('make-secret');
		const expectedSecret = process.env.MAKE_SHARED_SECRET;
		if (!expectedSecret || secret !== expectedSecret) {
			return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
		}

		const body = await req.json().catch(() => ({}));
		const data = requestSchema.parse(body);

		const admin = getSupabaseService();
		const { data: session, error: sessionError } = await admin
			.from('preview_sessions')
			.select('*')
			.eq('preview_session_id', data.previewSessionId)
			.maybeSingle();

		if (sessionError || !session) {
			return NextResponse.json({ error: 'Preview session not found' }, { status: 404 });
		}

		// Validate output schema strictly
		const validation = validateOutput(data.outputs);
		if (!validation.ok) {
			console.error('[Preview Complete] Validation failed:', {
				previewSessionId: data.previewSessionId,
				error: validation.error,
			});
			await admin
				.from('preview_sessions')
				.update({ status: 'failed', error: validation.error })
				.eq('preview_session_id', data.previewSessionId);
			return NextResponse.json({ error: validation.error }, { status: 422 });
		}

		// Update session with generated outputs
		await admin
			.from('preview_sessions')
			.update({
				status: 'generated',
				outputs_json: JSON.stringify(data.outputs),
				error: null,
			})
			.eq('preview_session_id', data.previewSessionId);

		return NextResponse.json({ success: true });
	} catch (error: any) {
		console.error('[Preview Complete] Error:', error);
		if (error instanceof z.ZodError) {
			return NextResponse.json({ error: 'Invalid request body', details: error.issues }, { status: 400 });
		}
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
	}
}
