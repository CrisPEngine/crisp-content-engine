import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSupabaseService } from '@/lib/supabaseService';

export const runtime = 'nodejs';

const requestSchema = z.object({
	previewSessionId: z.string().min(1),
});

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

const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 10;
const rateBuckets = new Map<string, { count: number; resetAt: number }>();

function getClientIp(req: Request): string | null {
	const forwarded = req.headers.get('x-forwarded-for');
	if (forwarded) {
		return forwarded.split(',')[0]?.trim() || null;
	}
	return req.headers.get('x-real-ip') || null;
}

function isRateLimited(ip: string): boolean {
	const now = Date.now();
	const bucket = rateBuckets.get(ip);
	if (!bucket || bucket.resetAt <= now) {
		rateBuckets.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
		return false;
	}
	if (bucket.count >= RATE_MAX) {
		return true;
	}
	bucket.count += 1;
	return false;
}

function hasDisallowedText(value: string): boolean {
	const hasHashtag = value.includes('#');
	const hasEmoji = /\p{Extended_Pictographic}/u.test(value);
	return hasHashtag || hasEmoji;
}

function validateOutput(outputs: unknown): { ok: true } | { ok: false; error: string } {
	const parsed = outputSchema.safeParse(outputs);
	if (!parsed.success) {
		return { ok: false, error: 'Output schema validation failed' };
	}
	const expectedNames = ['Point of view', 'How-to', 'Proof or story'];
	const namesMatch = parsed.data.sections.every((section, index) => section.name === expectedNames[index]);
	if (!namesMatch) {
		return { ok: false, error: 'Output sections do not match required names or order' };
	}
	if (hasDisallowedText(parsed.data.packTitle)) {
		return { ok: false, error: 'Output includes disallowed characters' };
	}
	for (const section of parsed.data.sections) {
		if (hasDisallowedText(section.name)) {
			return { ok: false, error: 'Output includes disallowed characters' };
		}
		for (const post of section.posts) {
			if (hasDisallowedText(post.title) || hasDisallowedText(post.body)) {
				return { ok: false, error: 'Output includes disallowed characters' };
			}
			if (post.hooks.some((hook) => hasDisallowedText(hook))) {
				return { ok: false, error: 'Output includes disallowed characters' };
			}
		}
	}
	return { ok: true };
}

export async function POST(req: Request) {
	try {
		const ip = getClientIp(req);
		if (ip && isRateLimited(ip)) {
			return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
		}

		const body = await req.json().catch(() => ({}));
		const { previewSessionId } = requestSchema.parse(body);

		const admin = getSupabaseService();
		const { data: session, error: sessionError } = await admin
			.from('preview_sessions')
			.select('*')
			.eq('preview_session_id', previewSessionId)
			.maybeSingle();

		if (sessionError || !session) {
			return NextResponse.json({ error: 'Preview session not found' }, { status: 404 });
		}

		if (session.status === 'generated' && session.outputs_json) {
			const cachedOutputs = typeof session.outputs_json === 'string'
				? JSON.parse(session.outputs_json)
				: session.outputs_json;
			return NextResponse.json({ status: 'generated', outputs: cachedOutputs });
		}

		const webhookUrl = process.env.MAKE_PREVIEW_WEBHOOK_URL;
		if (!webhookUrl) {
			return NextResponse.json({ error: 'Preview generation webhook not configured' }, { status: 500 });
		}

		await admin
			.from('preview_sessions')
			.update({ status: 'generating', error: null })
			.eq('preview_session_id', previewSessionId);

		const headers: Record<string, string> = { 'Content-Type': 'application/json' };
		if (process.env.MAKE_PREVIEW_WEBHOOK_KEY) {
			headers['x-make-apikey'] = process.env.MAKE_PREVIEW_WEBHOOK_KEY;
		}

		const payload = {
			previewSessionId,
			persona: session.persona,
			topics: session.topics,
			tone: session.tone,
			goal: session.goal,
			utm_source: session.utm_source,
			utm_campaign: session.utm_campaign,
		};

		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout

		let webhookRes: Response;
		try {
			webhookRes = await fetch(webhookUrl, {
				method: 'POST',
				headers,
				body: JSON.stringify(payload),
				signal: controller.signal,
			});
		} catch (fetchError: any) {
			clearTimeout(timeoutId);
			if (fetchError.name === 'AbortError') {
				await admin
					.from('preview_sessions')
					.update({ status: 'failed', error: 'Request timeout' })
					.eq('preview_session_id', previewSessionId);
				return NextResponse.json({ error: 'generation_failed', message: 'Request timeout. Please try again.' }, { status: 504 });
			}
			await admin
				.from('preview_sessions')
				.update({ status: 'failed', error: fetchError?.message || 'Network error' })
				.eq('preview_session_id', previewSessionId);
			return NextResponse.json({ error: 'generation_failed', message: 'Network error. Please try again.' }, { status: 502 });
		}
		clearTimeout(timeoutId);

		if (!webhookRes.ok) {
			const errorText = await webhookRes.text().catch(() => 'Unknown error');
			await admin
				.from('preview_sessions')
				.update({ status: 'failed', error: errorText })
				.eq('preview_session_id', previewSessionId);
			return NextResponse.json({ error: 'generation_failed', message: 'Preview generation failed. Please try again.' }, { status: 502 });
		}

		let webhookData: any;
		try {
			webhookData = await webhookRes.json();
		} catch (parseError) {
			await admin
				.from('preview_sessions')
				.update({ status: 'failed', error: 'Invalid JSON response from webhook' })
				.eq('preview_session_id', previewSessionId);
			return NextResponse.json({ error: 'generation_failed', message: 'Invalid response format. Please try again.' }, { status: 502 });
		}

		const outputs = webhookData?.outputs;
		if (!outputs) {
			await admin
				.from('preview_sessions')
				.update({ status: 'failed', error: 'Missing outputs in response' })
				.eq('preview_session_id', previewSessionId);
			return NextResponse.json({ error: 'generation_failed', message: 'Invalid response format. Please try again.' }, { status: 422 });
		}

		const validation = validateOutput(outputs);
		if (!validation.ok) {
			await admin
				.from('preview_sessions')
				.update({ status: 'failed', error: validation.error })
				.eq('preview_session_id', previewSessionId);
			return NextResponse.json({ error: 'generation_failed', message: validation.error }, { status: 422 });
		}

		await admin
			.from('preview_sessions')
			.update({
				status: 'generated',
				outputs_json: JSON.stringify(outputs),
				error: null,
			})
			.eq('preview_session_id', previewSessionId);

		return NextResponse.json({ status: 'generated', outputs });
	} catch (error: any) {
		console.error('[Preview Generate] Unexpected error:', error);
		const admin = getSupabaseService();
		try {
			const body = await req.json().catch(() => ({}));
			const parseResult = requestSchema.safeParse(body);
			if (parseResult.success && parseResult.data.previewSessionId) {
				await admin
					.from('preview_sessions')
					.update({ status: 'failed', error: error?.message || 'Unexpected error' })
					.eq('preview_session_id', parseResult.data.previewSessionId);
			}
		} catch (updateError) {
			// Ignore update errors in catch block
		}
		const message = error?.message || 'Failed to generate preview';
		return NextResponse.json({ error: 'generation_failed', message }, { status: error instanceof z.ZodError ? 400 : 500 });
	}
}
