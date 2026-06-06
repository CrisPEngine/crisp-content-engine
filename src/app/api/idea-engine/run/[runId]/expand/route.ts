/**
 * POST /api/idea-engine/run/[runId]/expand
 * Generate one additional channel from an existing idea run.
 */

import { NextResponse, after } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { z } from 'zod';
import { isIdeaEngineNativeEnabled } from '@/lib/featureFlags';
import { generateChannelsForRun } from '@/lib/idea-engine';
import { IdeaEngineError } from '@/lib/idea-engine/errors';
import {
	assertRunOwnedByUser,
	computeChannelActionCounts,
	prepareChannelPlaceholders,
} from '@/lib/idea-engine/persistence/channelActions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ExpandSchema = z.object({
	channel: z.enum(['LinkedIn', 'X', 'Blog', 'Instagram', 'Facebook']),
});

export async function POST(
	request: Request,
	context: { params: Promise<{ runId: string }> },
) {
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
			},
		);

		const {
			data: { user },
			error: userError,
		} = await supabase.auth.getUser();
		if (userError || !user) {
			return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
		}

		if (!isIdeaEngineNativeEnabled()) {
			return NextResponse.json({ error: 'Native Idea Engine is not enabled' }, { status: 503 });
		}

		const { runId } = await context.params;
		const body = await request.json();
		const parsed = ExpandSchema.safeParse(body);
		if (!parsed.success) {
			return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
		}

		const run = await assertRunOwnedByUser(runId, user.id);
		if (run.status === 'generating') {
			return NextResponse.json({ error: 'Generation already in progress' }, { status: 409 });
		}
		if (run.status === 'confirmed' || run.status === 'completed') {
			return NextResponse.json({ error: 'This run has already been confirmed' }, { status: 400 });
		}
		if (run.status === 'cancelled') {
			return NextResponse.json({ error: 'This run was cancelled' }, { status: 400 });
		}

		const { channel } = parsed.data;
		const { count, dropped } = await computeChannelActionCounts(user.id, channel);
		if (dropped || count <= 0) {
			return NextResponse.json(
				{ error: `No quota remaining for ${channel}` },
				{ status: 402 },
			);
		}

		await prepareChannelPlaceholders({
			runId,
			userId: user.id,
			channel,
			count,
		});

		after(async () => {
			try {
				await generateChannelsForRun(runId, [channel]);
			} catch (err) {
				console.error('[IdeaEngine/Expand] Generation failed:', err);
			}
		});

		return NextResponse.json({ ok: true, run_id: runId, channel, count });
	} catch (error) {
		if (error instanceof IdeaEngineError) {
			return NextResponse.json({ error: error.message }, { status: error.status });
		}
		console.error('[IdeaEngine/Expand] Error:', error);
		return NextResponse.json({ error: 'Server error' }, { status: 500 });
	}
}
