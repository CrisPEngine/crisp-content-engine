import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSupabaseService } from '@/lib/supabaseService';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

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

// Normalize field names (handle "Pack title" vs "packTitle", "Sections" vs "sections")
function normalizeFieldName(obj: any, ...possibleNames: string[]): any {
	if (!obj || typeof obj !== 'object') return undefined;
	for (const name of possibleNames) {
		if (name in obj) {
			return obj[name];
		}
	}
	return undefined;
}

// Normalize Make response to standard format
function normalizeMakeResponse(data: any, previewSessionId: string): { packTitle: string; sections: any[] } | null {
	if (!data || typeof data !== 'object') return null;

	// Try to extract outputs from various shapes
	let outputs = data.outputs || data;
	
	// Handle case where outputs is nested
	if (data.outputs && typeof data.outputs === 'object') {
		outputs = data.outputs;
	}

	if (!outputs || typeof outputs !== 'object') return null;

	// Normalize packTitle (handle "Pack title" vs "packTitle")
	const packTitle = normalizeFieldName(outputs, 'packTitle', 'Pack title', 'pack_title', 'Pack Title') || '';
	if (!packTitle || typeof packTitle !== 'string') return null;

	// Normalize sections (handle "Sections" vs "sections")
	let sections = normalizeFieldName(outputs, 'sections', 'Sections', 'Sections') || [];
	if (!Array.isArray(sections)) return null;

	// Normalize each section
	const normalizedSections = sections.map((section: any) => {
		if (!section || typeof section !== 'object') return null;
		const name = normalizeFieldName(section, 'name', 'Name', 'Name') || '';
		let posts = normalizeFieldName(section, 'posts', 'Posts', 'Posts') || [];
		if (!Array.isArray(posts)) posts = [];

		const normalizedPosts = posts.map((post: any) => {
			if (!post || typeof post !== 'object') return null;
			const title = normalizeFieldName(post, 'title', 'Title', 'Title') || '';
			const body = normalizeFieldName(post, 'body', 'Body', 'Body', 'content', 'Content') || '';
			let hooks = normalizeFieldName(post, 'hooks', 'Hooks', 'Hooks') || [];
			if (!Array.isArray(hooks)) hooks = [];

			// Ensure hooks is array of 2 non-empty strings
			const validHooks = hooks
				.filter((h: any) => typeof h === 'string' && h.trim().length > 0)
				.map((h: string) => h.trim())
				.slice(0, 2);

			// If hooks missing or invalid, return null (will fail validation)
			if (validHooks.length !== 2) return null;

			return { title: title.trim(), body: body.trim(), hooks: validHooks as [string, string] };
		}).filter((p: any): p is NonNullable<typeof p> => p !== null);

		if (normalizedPosts.length !== 3) return null;
		return { name: name.trim(), posts: normalizedPosts };
	}).filter((s: any): s is NonNullable<typeof s> => s !== null);

	if (normalizedSections.length !== 3) return null;
	return { packTitle: packTitle.trim(), sections: normalizedSections };
}

function validateOutput(outputs: { packTitle: string; sections: any[] }): { ok: true } | { ok: false; error: string } {
	if (!outputs.packTitle || typeof outputs.packTitle !== 'string' || outputs.packTitle.trim().length === 0) {
		return { ok: false, error: 'packTitle is required and must be a non-empty string' };
	}

	if (!Array.isArray(outputs.sections) || outputs.sections.length !== 3) {
		return { ok: false, error: 'sections must be an array with exactly 3 items' };
	}

	const expectedNames = ['Point of view', 'How-to', 'Proof or story'];
	for (let i = 0; i < outputs.sections.length; i++) {
		const section = outputs.sections[i];
		if (!section || typeof section !== 'object') {
			return { ok: false, error: `Section ${i + 1} is invalid` };
		}
		if (typeof section.name !== 'string' || section.name.trim().length === 0) {
			return { ok: false, error: `Section ${i + 1} name is required` };
		}
		if (section.name !== expectedNames[i]) {
			return { ok: false, error: `Section ${i + 1} name must be "${expectedNames[i]}"` };
		}
		if (!Array.isArray(section.posts) || section.posts.length !== 3) {
			return { ok: false, error: `Section "${section.name}" must have exactly 3 posts` };
		}

		for (let j = 0; j < section.posts.length; j++) {
			const post = section.posts[j];
			if (!post || typeof post !== 'object') {
				return { ok: false, error: `Post ${j + 1} in section "${section.name}" is invalid` };
			}
			if (typeof post.title !== 'string' || post.title.trim().length === 0) {
				return { ok: false, error: `Post ${j + 1} in section "${section.name}" title is required` };
			}
			if (typeof post.body !== 'string' || post.body.trim().length === 0) {
				return { ok: false, error: `Post ${j + 1} in section "${section.name}" body is required` };
			}
			if (!Array.isArray(post.hooks) || post.hooks.length !== 2) {
				return { ok: false, error: `Post ${j + 1} in section "${section.name}" must have exactly 2 hooks` };
			}
			for (let k = 0; k < post.hooks.length; k++) {
				if (typeof post.hooks[k] !== 'string' || post.hooks[k].trim().length === 0) {
					return { ok: false, error: `Post ${j + 1} in section "${section.name}" hook ${k + 1} must be a non-empty string` };
				}
			}
		}
	}

	// Check for disallowed characters
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

		// If already generated, return cached
		if (session.status === 'generated' && session.outputs_json) {
			const cachedOutputs = typeof session.outputs_json === 'string'
				? JSON.parse(session.outputs_json)
				: session.outputs_json;
			return NextResponse.json({ previewSessionId, status: 'generated', outputs: cachedOutputs });
		}

		// If already generating, return generating status
		if (session.status === 'generating') {
			return NextResponse.json({ previewSessionId, status: 'generating' }, { status: 202 });
		}

		const webhookUrl = process.env.MAKE_PREVIEW_WEBHOOK_URL;
		if (!webhookUrl) {
			return NextResponse.json({ error: 'Preview generation webhook not configured' }, { status: 500 });
		}

		// Update status to generating
		await admin
			.from('preview_sessions')
			.update({ status: 'generating', error: null })
			.eq('preview_session_id', previewSessionId);

		// Fire-and-forget call to Make webhook
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

		// Fire-and-forget: don't await the response
		fetch(webhookUrl, {
			method: 'POST',
			headers,
			body: JSON.stringify(payload),
		}).catch((error) => {
			// Log errors but don't block response
			console.error('[Preview Generate] Fire-and-forget error:', {
				previewSessionId,
				error: error?.message || 'Unknown error',
			});
			// Update status to failed if webhook call fails
			getSupabaseService()
				.from('preview_sessions')
				.update({ status: 'failed', error: error?.message || 'Webhook call failed' })
				.eq('preview_session_id', previewSessionId)
				.catch(() => {
					// Ignore update errors
				});
		});

		// Return 202 immediately
		return NextResponse.json({ previewSessionId, status: 'generating' }, { status: 202 });
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
