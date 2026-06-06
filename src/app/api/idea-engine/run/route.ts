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
import { isIdeaEngineNativeEnabled } from '@/lib/featureFlags';
import { dispatchGenerationJob } from '@/lib/idea-engine/dispatchGeneration';
import { logIdeaEngineLifecycle } from '@/lib/idea-engine/observability/lifecycle';
import {
	extractTimezoneAndWindows,
	loadBrandProfile,
} from '@/lib/idea-engine/data/loadBrandProfile';
import { loadContentHistory } from '@/lib/idea-engine/data/loadContentHistory';
import {
	extractIdempotencyKey,
	findExistingRunByIdempotencyKey,
} from '@/lib/idea-engine/idempotency';

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

		const idempotencyKey = extractIdempotencyKey(request, body);

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

		// ── Idempotency: return existing run for duplicate requests ─
		if (idempotencyKey) {
			const existing = await findExistingRunByIdempotencyKey(user.id, idempotencyKey);
			if (existing) {
				return NextResponse.json({
					ok: true,
					run_id: existing.id,
					series_run_id: existing.series_run_id,
					idempotent_replay: true,
					generation: isIdeaEngineNativeEnabled() ? 'native' : 'make',
				});
			}
		}
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
		// Calculate total expected items upfront for progress tracking
		const totalExpected = Object.values(requestedCounts).reduce((sum, count) => sum + count, 0);

		const insertPayload: Record<string, unknown> = {
			user_id: user.id,
			brand_profile_id,
			idea,
			goal: goal || null,
			notes: notes || null,
			selected_channels,
			publish_mode,
			status: 'generating',
			total_expected: totalExpected,
			total_generated: 0,
		};
		if (idempotencyKey) {
			insertPayload.idempotency_key = idempotencyKey;
		}

		const { data: run, error: insertError } = await admin
			.from('idea_engine_runs')
			.insert(insertPayload)
			.select('id, series_run_id')
			.single();

		if (insertError) {
			if (insertError.code === '23505' && idempotencyKey) {
				const replay = await findExistingRunByIdempotencyKey(user.id, idempotencyKey);
				if (replay) {
					return NextResponse.json({
						ok: true,
						run_id: replay.id,
						series_run_id: replay.series_run_id,
						idempotent_replay: true,
						generation: isIdeaEngineNativeEnabled() ? 'native' : 'make',
					});
				}
			}
			console.error('[IdeaEngine/Run] Failed to create run:', insertError);
			return NextResponse.json({ error: 'Failed to create series run' }, { status: 500 });
		}

		if (!run) {
			return NextResponse.json({ error: 'Failed to create series run' }, { status: 500 });
		}

		// ── Create placeholder items for live progress ────────────
		// These placeholders enable the UI to show skeleton cards immediately
		// and replace them as Make fills in content. Make callback will update
		// these rows instead of inserting new ones.
		const placeholders: any[] = [];
		for (const channel of activeChannels) {
			const count = requestedCounts[channel];
			for (let position = 1; position <= count; position++) {
				placeholders.push({
					run_id: run.id,
					user_id: user.id,
					channel,
					series_position: position,
					series_total: count,
					status: 'generating',
					post_title: null,
					body_draft: null,
					image_prompt: null,
					hashtags: null,
				});
			}
		}

		if (placeholders.length > 0) {
			const { error: placeholderError } = await admin
				.from('idea_engine_items')
				.insert(placeholders);

			if (placeholderError) {
				console.error('[IdeaEngine/Run] Failed to create placeholders:', placeholderError);
				// Non-fatal: generation can proceed; UI just won't show progressive reveal
			}
		}

		// ── Increment Creator series run counter ──────────────────
		if (planCaps.ideaEngineRunsMonthly > 0) {
			await incrementIdeaEngineRunsUsed(user.id).catch(err =>
				console.error('[IdeaEngine/Run] Failed to increment run counter:', err)
			);
		}

		const useNative = isIdeaEngineNativeEnabled();

		// ── Brand + history (Make payload only; native reloads in generateSeries) ──
		let brandContext: Record<string, any> = {};
		let previousContentJson: Record<string, any>[] = [];
		if (!useNative) {
			brandContext = await loadBrandProfile(brand_profile_id);
			const history = await loadContentHistory(brand_profile_id);
			previousContentJson = history.entries;
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

		if (useNative) {
			if (!process.env.OPENAI_API_KEY?.trim()) {
				await admin
					.from('idea_engine_runs')
					.update({ status: 'failed', error: 'OPENAI_API_KEY not configured' })
					.eq('id', run.id);
				return NextResponse.json(
					{ error: 'Idea Engine is not configured. Please contact support.' },
					{ status: 503 },
				);
			}

			logIdeaEngineLifecycle('run_created', run.id, {
				channels: activeChannels.join(','),
				total_expected: totalExpected,
			});

			void dispatchGenerationJob({ runId: run.id }).catch((err) => {
				console.error('[IdeaEngine/Run] Failed to dispatch generation:', err);
			});

			return NextResponse.json({
				ok: true,
				run_id: run.id,
				series_run_id: run.series_run_id,
				generation: 'native',
			});
		}

		// ── Fire Make webhook (legacy fallback) ───────────────────
		const MAKE_URL = process.env.MAKE_IDEA_ENGINE_SERIES_WEBHOOK_URL;
		if (!MAKE_URL) {
			await admin
				.from('idea_engine_runs')
				.update({ status: 'failed', error: 'MAKE_IDEA_ENGINE_SERIES_WEBHOOK_URL not configured' })
				.eq('id', run.id);
			return NextResponse.json({ error: 'Idea Engine is not configured. Please contact support.' }, { status: 503 });
		}

		const appUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || 'https://app.crispdigital.io';

		// Brand timezone and posting windows (for scheduling and Make context).
		// Used by confirm route for TZ-aware scheduled_time; passed to Make for context.
		const { timezone, postingWindows: posting_windows } = useNative
			? { timezone: 'UTC', postingWindows: null }
			: extractTimezoneAndWindows(brandContext);

		// ── Build the clean Idea Engine Make payload ─────────────
		// This is the authoritative contract. Do NOT add legacy content-generation
		// fields (monthly_brief, channels[], generation_job_id, scheduling_context).
		// Those belong to the standard generation flow, not Idea Engine.
		// Fields that appear inside brand_context (e.g. strategy_json) are only
		// accessible there; they are not promoted to top-level.
		const makePayload = {
			// ── Run identity ──────────────────────────────────────
			series_run_id: run.series_run_id,
			run_id: run.id,
			user_id: user.id,
			plan,

			// ── Brand ─────────────────────────────────────────────
			brand_profile_id,

			// ── User inputs (verbatim from Idea Engine UI) ────────
			idea,
			goal: goal || null,
			notes: notes || null,

			// ── Generation instructions ───────────────────────────
			// selected_channels: only channels with count > 0 (quota-resolved)
			selected_channels: activeChannels,
			publish_mode,
			// Make MUST generate exactly these counts per channel.
			// Values are min(plan_default, quota_remaining); channels at 0 are excluded.
			requested_counts: requestedCounts,

			// ── Quota context (informational, not instructions) ───
			quota_remaining_by_channel: quotaRemaining,

			// ── Capabilities ─────────────────────────────────────
			autopublish_capabilities: autopublishCapabilities,

			// ── Scheduling context ────────────────────────────────
			timezone,
			posting_windows,

			// ── Brand context (Airtable BrandProfiles fields) ─────
			// Contains: client_name, voice_rules, audience, value_props, offers,
			// brand_palette, strategy_json, brand_goals, content_rules, etc.
			// strategy_json is nested here — it is NOT a top-level field.
			brand_context: brandContext,

			// ── Deduplication context ─────────────────────────────
			// Recent published/approved/scheduled content for this brand.
			// OpenAI should avoid repeating hooks, angles and structures found here.
			// Empty array if unavailable — generation proceeds safely without it.
			previous_content_json: previousContentJson,

			// ── Callback ─────────────────────────────────────────
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
