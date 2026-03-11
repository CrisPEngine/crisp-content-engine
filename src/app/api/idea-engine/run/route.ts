/**
 * POST /api/idea-engine/run
 *
 * Creates an Idea Engine series run, performs quota preflight, fires the Make
 * scenario, and returns the runId for the client to start polling.
 *
 * Auth: Supabase cookie session.
 */

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { z } from 'zod';
import { getSupabaseService } from '@/lib/supabaseService';
import { resolvePlan } from '@/lib/planResolver';
import { getChannelUsage, getIdeaEngineRunsUsed, incrementIdeaEngineRunsUsed } from '@/lib/enforceCaps';
import { CAPS } from '@/config/pricing';
import { computeIdeaEngineRequestedCounts } from '@/lib/ideaEngineQuota';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CHANNEL_VALUES = ['LinkedIn', 'X', 'Blog', 'Instagram', 'Facebook'] as const;

const RunSchema = z.object({
	brand_profile_id: z.string().min(1),
	idea: z.string().min(10, 'Idea must be at least 10 characters').max(2000),
	goal: z.enum(['Awareness', 'Engagement', 'Traffic', 'Conversion']).optional(),
	notes: z.string().max(1000).optional(),
	selected_channels: z.array(z.enum(CHANNEL_VALUES)).min(1, 'Select at least one channel'),
	publish_mode: z.enum(['queue_only', 'approve_and_schedule', 'approve_first_immediately']).default('queue_only'),
});

export async function POST(request: Request) {
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
		if (userError || !user) {
			return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
		}

		const body = await request.json().catch(() => null);
		if (!body) return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });

		const parsed = RunSchema.safeParse(body);
		if (!parsed.success) {
			return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Validation failed' }, { status: 400 });
		}

		const { brand_profile_id, idea, goal, notes, selected_channels, publish_mode } = parsed.data;

		// ── Plan check ────────────────────────────────────────────
		const resolved = await resolvePlan(user.id);
		const plan = resolved.plan === 'free' ? 'starter' : resolved.plan;
		const planCaps = CAPS[plan as keyof typeof CAPS] || CAPS.starter;

		if (!planCaps.ideaEngineEnabled) {
			return NextResponse.json({
				error: 'Idea Engine is not available on your current plan.',
				upgrade_required: true,
				upgrade_message: 'Upgrade to Creator to turn one idea into a full content series.',
			}, { status: 403 });
		}

		// ── Meta channels gate (Creator can't use Instagram/Facebook) ────
		const hasMetaChannels = selected_channels.some(c => c === 'Instagram' || c === 'Facebook');
		if (hasMetaChannels && !planCaps.autopublishMeta && planCaps.metaPoolMonthly === 0) {
			return NextResponse.json({
				error: 'Instagram and Facebook are not available on your current plan.',
				upgrade_required: true,
				upgrade_message: 'Upgrade to Growth to publish to Facebook and Instagram.',
			}, { status: 403 });
		}

		// ── Creator series run limit ──────────────────────────────
		if (planCaps.ideaEngineRunsMonthly > 0) {
			const runsUsed = await getIdeaEngineRunsUsed(user.id);
			if (runsUsed >= planCaps.ideaEngineRunsMonthly) {
				return NextResponse.json({
					error: `You've used all ${planCaps.ideaEngineRunsMonthly} Idea Engine runs for this month.`,
					upgrade_required: true,
					upgrade_message: 'Upgrade to Growth for unlimited series runs.',
					runs_used: runsUsed,
					runs_limit: planCaps.ideaEngineRunsMonthly,
				}, { status: 403 });
			}
		}

		// ── Rate limiting: 1 run per minute per user ──────────────
		const admin = getSupabaseService();
		const oneMinuteAgo = new Date(Date.now() - 60 * 1000).toISOString();
		const { data: recentRun } = await admin
			.from('idea_engine_runs')
			.select('id, created_at')
			.eq('user_id', user.id)
			.gte('created_at', oneMinuteAgo)
			.neq('status', 'cancelled')
			.order('created_at', { ascending: false })
			.limit(1)
			.maybeSingle();

		if (recentRun) {
			return NextResponse.json({
				error: 'Please wait a moment before starting another series run.',
				retry_after_seconds: 60,
			}, { status: 429 });
		}

		// ── Duplicate idea detection (same idea within last 10 min) ─
		const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
		const { data: recentDupe } = await admin
			.from('idea_engine_runs')
			.select('id, created_at')
			.eq('user_id', user.id)
			.eq('idea', idea)
			.gte('created_at', tenMinutesAgo)
			.neq('status', 'cancelled')
			.limit(1)
			.maybeSingle();

		// Duplicate check is advisory — client can pass force_duplicate=true to bypass
		const forceDuplicate = body?.force_duplicate === true;
		if (recentDupe && !forceDuplicate) {
			return NextResponse.json({
				error: 'You recently generated a series from this idea.',
				duplicate_detected: true,
				recent_run_id: recentDupe.id,
			}, { status: 409 });
		}

		// ── Quota-aware requested counts ─────────────────────────
		// Compute remaining quota per channel, then derive actual requested counts.
		// Channels are dropped gracefully if their quota is 0 or plan default is 0.
		// Only fail if ALL selected channels resolve to zero.
		const usage = await getChannelUsage(user.id);

		const quotaRemaining = {
			linkedin:   Math.max(0, planCaps.linkedinPostsMonthly - usage.linkedin),
			x:          Math.max(0, planCaps.xPostsMonthly - usage.x),
			blog:       Math.max(0, planCaps.blogArticlesMonthly - usage.blog),
			meta_pool:  Math.max(0, planCaps.metaPoolMonthly - usage.meta_pool),
		};

		const { requestedCounts, droppedChannels, activeChannels } = computeIdeaEngineRequestedCounts(
			selected_channels,
			plan,
			quotaRemaining
		);

		if (activeChannels.length === 0) {
			const hasMetaOnly = selected_channels.every(c => c === 'Instagram' || c === 'Facebook');
			const error = hasMetaOnly
				? 'Facebook and Instagram Idea Engine outputs are available on Growth and above.'
				: "You've used your available quota for the selected channels this month.";
			return NextResponse.json({
				error,
				quota_remaining: quotaRemaining,
				dropped_channels: droppedChannels,
			}, { status: 403 });
		}

		// ── Create the run record ─────────────────────────────────
		const { data: run, error: insertError } = await admin
			.from('idea_engine_runs')
			.insert({
				user_id: user.id,
				brand_profile_id,
				idea,
				goal: goal || null,
				notes: notes || null,
				selected_channels,
				publish_mode,
				status: 'generating',
			})
			.select('id, series_run_id')
			.single();

		if (insertError || !run) {
			console.error('[IdeaEngine/Run] Failed to create run:', insertError);
			return NextResponse.json({ error: 'Failed to create series run' }, { status: 500 });
		}

		// ── Increment Creator series run counter ──────────────────
		if (planCaps.ideaEngineRunsMonthly > 0) {
			await incrementIdeaEngineRunsUsed(user.id).catch(err =>
				console.error('[IdeaEngine/Run] Failed to increment run counter:', err)
			);
		}

		// ── Fetch brand context for Make payload ──────────────────
		let brandContext: Record<string, any> = {};
		try {
			const AIRTABLE_TOKEN = process.env.AIRTABLE_PAT;
			const BASE_ID = process.env.AIRTABLE_BASE_ID;
			const BRANDPROFILES_TABLE = process.env.AIRTABLE_BRANDPROFILES_TABLE;
			if (AIRTABLE_TOKEN && BASE_ID && BRANDPROFILES_TABLE) {
				const brandRes = await fetch(
					`https://api.airtable.com/v0/${BASE_ID}/${BRANDPROFILES_TABLE}/${brand_profile_id}`,
					{ headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` } }
				);
				if (brandRes.ok) {
					const brandData = await brandRes.json();
					brandContext = brandData.fields || {};
				}
			}
		} catch (err) {
			console.warn('[IdeaEngine/Run] Could not fetch brand context:', err);
		}

		// ── Build autopublish capability map ─────────────────────
		const autopublishCapabilities: Record<string, boolean> = {
			linkedin: planCaps.autopublishLinkedIn,
			instagram: planCaps.autopublishMeta,
			facebook: planCaps.autopublishMeta,
			x: false,
			blog: false,
		};

		// requestedCounts already computed above via computeIdeaEngineRequestedCounts.
		// activeChannels = channels with count > 0 (dropped channels are excluded).
		// Make only receives channels the app has approved — no zero-count channels.

		// ── Fire Make webhook ─────────────────────────────────────
		const MAKE_URL = process.env.MAKE_IDEA_ENGINE_SERIES_WEBHOOK_URL;
		if (!MAKE_URL) {
			// Mark as failed if no webhook is configured
			await admin.from('idea_engine_runs').update({ status: 'failed', error: 'MAKE_IDEA_ENGINE_SERIES_WEBHOOK_URL not configured' }).eq('id', run.id);
			return NextResponse.json({ error: 'Idea Engine is not configured. Please contact support.' }, { status: 503 });
		}

		const appUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || 'https://app.crispdigital.io';

		// Brand timezone and posting windows (for scheduling and Make context).
		// Used by confirm route for TZ-aware scheduled_time; passed to Make for context.
		const timezone = (brandContext?.timezone && String(brandContext.timezone).trim()) ? String(brandContext.timezone) : 'UTC';
		const posting_windows = brandContext?.posting_windows ?? null;

		const makePayload = {
			series_run_id: run.series_run_id,
			run_id: run.id,
			user_id: user.id,
			plan,
			brand_profile_id,
			idea,
			goal: goal || null,
			notes: notes || null,
			// Only send active (non-zero) channels to Make
			selected_channels: activeChannels,
			publish_mode,
			// Exact per-channel counts. Make MUST return exactly these items.
			// These are already capped by plan defaults and remaining quota.
			requested_counts: requestedCounts,
			quota_remaining_by_channel: quotaRemaining,
			dropped_channels: droppedChannels,
			autopublish_capabilities: autopublishCapabilities,
			timezone,
			posting_windows,
			brand_context: brandContext,
			callback_url: `${appUrl}/api/idea-engine/webhook/callback`,
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
			console.error('[IdeaEngine/Run] Make webhook call failed:', makeErr);
			await admin.from('idea_engine_runs').update({ status: 'failed', error: 'Failed to reach generation service' }).eq('id', run.id);
			return NextResponse.json({ error: 'Failed to start generation. Please try again.' }, { status: 502 });
		}

		return NextResponse.json({
			ok: true,
			run_id: run.id,
			series_run_id: run.series_run_id,
		});

	} catch (error: any) {
		console.error('[IdeaEngine/Run] Unexpected error:', error);
		return NextResponse.json({ error: error?.message || 'Server error' }, { status: 500 });
	}
}
