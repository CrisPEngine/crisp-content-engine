/**
 * POST /api/idea-engine/confirm
 *
 * Finalises an Idea Engine run:
 *   1. Writes approved items to Airtable ContentQueue with series metadata.
 *   2. Applies publish mode logic (queue only / approve and schedule /
 *      approve first item immediately) with intelligent staggering.
 *   3. Converts the quota reservation → actual usage (only for
 *      successfully written items). The reservation was created in
 *      webhook/callback and sized by the items Make returned.
 *   4. Marks the run as completed.
 *
 * Double-counting protection:
 *   All items written here carry generated_from='idea_engine'. The normal
 *   approval-time increment in /api/content/queue/[contentId] checks this
 *   flag and skips the LinkedIn/Meta increment, because quota is already
 *   consumed here at confirm time.
 *
 * Auth: Supabase cookie session.
 */

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { z } from 'zod';
import { DateTime } from 'luxon';
import { getSupabaseService } from '@/lib/supabaseService';
import { consumeConfirmedItems } from '@/lib/enforceCaps';
import { resolvePlan } from '@/lib/planResolver';
import { CAPS } from '@/config/pricing';
import type { PlanId } from '@/config/pricing';

export const runtime = 'nodejs';

const ConfirmSchema = z.object({
	run_id: z.string().uuid(),
	item_ids: z.array(z.string().uuid()).optional(),
});

// ─── Publish mode / staggering ────────────────────────────────────────────────

type ScheduleEntry = { scheduled_time: string | null; airtable_status: string };

/** Default hour (in brand TZ) for LinkedIn and Meta when posting_windows is not used. */
const DEFAULT_LINKEDIN_HOUR = 9;
const DEFAULT_META_HOUR = 10;

/**
 * Optionally parse a preferred hour from posting_windows (string or array).
 * Returns null if not parseable; caller uses DEFAULT_* then.
 */
function hourFromPostingWindows(postingWindows: unknown, defaultHour: number): number {
	if (typeof postingWindows === 'string' && /^\d{1,2}/.test(postingWindows.trim())) {
		const n = parseInt(postingWindows.trim(), 10);
		if (n >= 0 && n <= 23) return n;
	}
	if (Array.isArray(postingWindows) && postingWindows.length > 0) {
		const first = postingWindows[0];
		if (typeof first === 'string' && /^\d{1,2}/.test(first.trim())) {
			const n = parseInt(first.trim(), 10);
			if (n >= 0 && n <= 23) return n;
		}
		if (typeof first === 'object' && first !== null && 'hour' in first) {
			const h = (first as { hour?: number }).hour;
			if (typeof h === 'number' && h >= 0 && h <= 23) return h;
		}
	}
	return defaultHour;
}

/**
 * Compute a scheduled_time and Airtable status for every item based on
 * publish_mode and channel. Uses Brand Profile timezone when provided (otherwise UTC).
 * Posting windows are used to pick the hour when available.
 */
function computeSchedule(
	items: Array<{ id: string; channel: string; series_position: number }>,
	publishMode: string,
	canAutoLinkedIn: boolean,
	canAutoMeta: boolean,
	opts: { timezone?: string | null; posting_windows?: unknown } = {}
): Map<string, ScheduleEntry> {
	const result = new Map<string, ScheduleEntry>();

	// ── queue_only: everything goes in as Draft ──────────────────
	if (publishMode === 'queue_only') {
		for (const item of items) {
			result.set(item.id, { scheduled_time: null, airtable_status: 'Draft' });
		}
		return result;
	}

	const tz = (opts.timezone && String(opts.timezone).trim()) || 'UTC';
	const liHour = hourFromPostingWindows(opts.posting_windows, DEFAULT_LINKEDIN_HOUR);
	const metaHour = hourFromPostingWindows(opts.posting_windows, DEFAULT_META_HOUR);

	const nowInTz = DateTime.now().setZone(tz);
	const now = new Date();

	// Sort by series_position within each channel group
	const byChannel = (ch: string) =>
		items
			.filter(i => i.channel.toLowerCase() === ch)
			.sort((a, b) => a.series_position - b.series_position);

	const linkedInItems = byChannel('linkedin');
	const xItems        = byChannel('x');
	const blogItems     = byChannel('blog');
	const igItems       = byChannel('instagram');
	const fbItems       = byChannel('facebook');

	// X and Blog never autopublish regardless of mode
	for (const item of [...xItems, ...blogItems]) {
		result.set(item.id, { scheduled_time: null, airtable_status: 'Draft' });
	}

	if (publishMode === 'approve_first_immediately') {
		if (canAutoLinkedIn && linkedInItems.length > 0) {
			// First LinkedIn item → publish in the next cron window (now + 15 min, UTC)
			const firstTime = new Date(now.getTime() + 15 * 60 * 1000);
			result.set(linkedInItems[0].id, {
				scheduled_time: firstTime.toISOString()!,
				airtable_status: 'Ready To Publish',
			});

			// Remaining LinkedIn → stagger from 2 days out at liHour in brand TZ
			const start = nowInTz.plus({ days: 2 }).set({ hour: liHour, minute: 0, second: 0, millisecond: 0 });
			for (let i = 1; i < linkedInItems.length; i++) {
				const t = start.plus({ days: (i - 1) * 2 });
				result.set(linkedInItems[i].id, {
					scheduled_time: t.toISO()!,
					airtable_status: 'Ready To Publish',
				});
			}
		} else {
			for (const item of linkedInItems) {
				result.set(item.id, { scheduled_time: null, airtable_status: 'Draft' });
			}
		}

		for (const item of [...igItems, ...fbItems]) {
			result.set(item.id, { scheduled_time: null, airtable_status: 'Draft' });
		}

	} else if (publishMode === 'approve_and_schedule') {
		// LinkedIn: every 2 days starting tomorrow at liHour in brand TZ
		if (canAutoLinkedIn) {
			const liStart = nowInTz.plus({ days: 1 }).set({ hour: liHour, minute: 0, second: 0, millisecond: 0 });
			for (let i = 0; i < linkedInItems.length; i++) {
				const t = liStart.plus({ days: i * 2 });
				result.set(linkedInItems[i].id, {
					scheduled_time: t.toISO()!,
					airtable_status: 'Ready To Publish',
				});
			}
		} else {
			for (const item of linkedInItems) {
				result.set(item.id, { scheduled_time: null, airtable_status: 'Draft' });
			}
		}

		// Meta: interleave IG/FB, every 2 days, starting day-after-tomorrow at metaHour in brand TZ
		if (canAutoMeta) {
			const metaStart = nowInTz.plus({ days: 2 }).set({ hour: metaHour, minute: 0, second: 0, millisecond: 0 });
			const interleaved = interleave(igItems, fbItems);
			for (let i = 0; i < interleaved.length; i++) {
				const t = metaStart.plus({ days: i * 2 });
				result.set(interleaved[i].id, {
					scheduled_time: t.toISO()!,
					airtable_status: 'Ready To Publish',
				});
			}
		} else {
			for (const item of [...igItems, ...fbItems]) {
				result.set(item.id, { scheduled_time: null, airtable_status: 'Draft' });
			}
		}
	}

	// Safety net: any item not yet assigned gets Draft
	for (const item of items) {
		if (!result.has(item.id)) {
			result.set(item.id, { scheduled_time: null, airtable_status: 'Draft' });
		}
	}

	return result;
}

function interleave<T>(a: T[], b: T[]): T[] {
	const out: T[] = [];
	const max = Math.max(a.length, b.length);
	for (let i = 0; i < max; i++) {
		if (i < a.length) out.push(a[i]);
		if (i < b.length) out.push(b[i]);
	}
	return out;
}

// ─── Handler ──────────────────────────────────────────────────────────────────

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
		if (userError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

		const body = await request.json().catch(() => null);
		if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 });

		const parsed = ConfirmSchema.safeParse(body);
		if (!parsed.success) {
			return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Validation failed' }, { status: 400 });
		}

		const { run_id, item_ids } = parsed.data;
		const admin = getSupabaseService();

		// ── Verify run ownership ──────────────────────────────────
		const { data: run } = await admin
			.from('idea_engine_runs')
			.select('id, user_id, idea, series_run_id, brand_profile_id, selected_channels, publish_mode, status')
			.eq('id', run_id)
			.single();

		if (!run || run.user_id !== user.id) {
			return NextResponse.json({ error: 'Run not found' }, { status: 404 });
		}
		if (run.status === 'completed') {
			return NextResponse.json({ error: 'This series has already been confirmed' }, { status: 400 });
		}
		if (run.status === 'cancelled') {
			return NextResponse.json({ error: 'This series was cancelled' }, { status: 400 });
		}

		// ── Resolve plan → autopublish capabilities ───────────────
		const resolved = await resolvePlan(user.id);
		const planKey = (resolved.plan === 'free' ? 'starter' : resolved.plan) as PlanId;
		const planCaps = CAPS[planKey] || CAPS.starter;
		const canAutoLinkedIn = planCaps.autopublishLinkedIn ?? false;
		const canAutoMeta     = planCaps.autopublishMeta ?? false;

		// ── Fetch items to confirm ────────────────────────────────
		let itemQuery = admin
			.from('idea_engine_items')
			.select('*')
			.eq('run_id', run_id)
			.neq('status', 'queued');

		if (item_ids && item_ids.length > 0) {
			itemQuery = itemQuery.in('id', item_ids);
		}

		const { data: items } = await itemQuery.order('series_position', { ascending: true });

		if (!items || items.length === 0) {
			return NextResponse.json({ error: 'No items to confirm' }, { status: 400 });
		}

		// ── Brand timezone and posting windows (for TZ-aware scheduling) ─
		let timezone: string | null = null;
		let posting_windows: unknown = null;
		const brandProfileId = run.brand_profile_id;
		const AIRTABLE_TOKEN = process.env.AIRTABLE_PAT;
		const BASE_ID        = process.env.AIRTABLE_BASE_ID;
		const BRANDPROFILES_TABLE = process.env.AIRTABLE_BRANDPROFILES_TABLE;
		if (brandProfileId && AIRTABLE_TOKEN && BASE_ID && BRANDPROFILES_TABLE) {
			try {
				const brandRes = await fetch(
					`https://api.airtable.com/v0/${BASE_ID}/${BRANDPROFILES_TABLE}/${brandProfileId}`,
					{ headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` } }
				);
				if (brandRes.ok) {
					const brandData = await brandRes.json();
					const fields = brandData.fields || {};
					if (fields.timezone && String(fields.timezone).trim()) {
						timezone = String(fields.timezone).trim();
					}
					posting_windows = fields.posting_windows ?? null;
				}
			} catch (_) {
				// Fall back to UTC
			}
		}

		// ── Compute publish schedule (Brand TZ if present, else UTC) ────────
		const publishMode = run.publish_mode || 'queue_only';
		const schedule = computeSchedule(
			items.map(i => ({ id: i.id, channel: i.channel, series_position: i.series_position ?? 1 })),
			publishMode,
			canAutoLinkedIn,
			canAutoMeta,
			{ timezone, posting_windows }
		);

		// ── Airtable ContentQueue config ──────────────────────────
		const TABLE_ID = process.env.AIRTABLE_CONTENTQUEUE_TABLE;

		if (!AIRTABLE_TOKEN || !BASE_ID || !TABLE_ID) {
			return NextResponse.json({ error: 'Airtable not configured' }, { status: 500 });
		}

		const seriesTitle    = `Idea Engine: ${run.idea.slice(0, 60)}${run.idea.length > 60 ? '…' : ''}`;
		const seriesTotal    = items.length;

		// ── Write each item to Airtable ───────────────────────────
		const results: Array<{ item_id: string; airtable_record_id?: string; ok: boolean; channel?: string; error?: string }> = [];

		for (const item of items) {
			const sched = schedule.get(item.id) || { scheduled_time: null, airtable_status: 'Draft' };

			// Core fields — always present; status and scheduled_time from publish mode
			const coreFields: Record<string, any> = {
				hook:          item.post_title || '',
				post_content:  item.body_draft  || '',
				platform:      item.channel,
				status:        sched.airtable_status,
				generated_from: 'idea_engine',
			};

			if (item.image_prompt) coreFields.image_prompt  = item.image_prompt;
			if (item.hashtags)     coreFields.hashtags       = item.hashtags;
			if (brandProfileId)    coreFields.brand_profile_id = [brandProfileId];
			if (sched.scheduled_time) {
				coreFields.scheduled_time = sched.scheduled_time;
				coreFields.approved_at    = new Date().toISOString();
			}

			// Series metadata (written optimistically; retried without on 422)
			const seriesFields: Record<string, any> = {
				series_id:       run.series_run_id,
				series_run_id:   run.series_run_id,
				series_title:    seriesTitle,
				series_type:     'idea_engine',
				series_position: item.series_position ?? 1,
				series_total:    seriesTotal,
				source_idea:     run.idea,
				publish_mode:    publishMode,
			};

			const writeToAirtable = async (fields: Record<string, any>) => {
				return fetch(`https://api.airtable.com/v0/${BASE_ID}/${TABLE_ID}`, {
					method: 'POST',
					headers: {
						Authorization: `Bearer ${AIRTABLE_TOKEN}`,
						'Content-Type': 'application/json',
					},
					body: JSON.stringify({ fields }),
				});
			};

			let airtableRes = await writeToAirtable({ ...coreFields, ...seriesFields });

			// If Airtable rejects (unknown series fields), retry with core only.
			// generated_from is always in core to protect the double-count guard.
			if (!airtableRes.ok && airtableRes.status === 422) {
				console.warn(`[IdeaEngine/Confirm] Retrying item ${item.id} without series fields`);
				airtableRes = await writeToAirtable(coreFields);
			}

			if (airtableRes.ok) {
				const airtableData = await airtableRes.json();
				const airtableRecordId = airtableData?.id;

				await admin
					.from('idea_engine_items')
					.update({ status: 'queued', airtable_record_id: airtableRecordId, updated_at: new Date().toISOString() })
					.eq('id', item.id);

				results.push({ item_id: item.id, airtable_record_id: airtableRecordId, channel: item.channel, ok: true });
			} else {
				const errData = await airtableRes.json().catch(() => ({}));
				console.error(`[IdeaEngine/Confirm] Airtable write failed for item ${item.id}:`, errData);
				results.push({ item_id: item.id, channel: item.channel, ok: false, error: errData?.error?.message || 'Airtable write failed' });
			}
		}

		const successCount = results.filter(r => r.ok).length;

		if (successCount === 0) {
			return NextResponse.json({ error: 'Failed to add any items to the queue', results }, { status: 502 });
		}

		// ── Convert quota reservation → actual usage ──────────────
		// Count ONLY the items that were successfully written to Airtable.
		// The reservation was sized for ALL generated items; individual deletes
		// already reduced it. Here we convert the remainder to "used".
		const confirmedCounts: Record<string, number> = {};
		for (const r of results) {
			if (!r.ok) continue;
			const ch = (r.channel || '').toLowerCase();
			if (ch === 'linkedin') confirmedCounts.linkedin = (confirmedCounts.linkedin ?? 0) + 1;
			else if (ch === 'x')   confirmedCounts.x        = (confirmedCounts.x        ?? 0) + 1;
			else if (ch === 'blog') confirmedCounts.blog     = (confirmedCounts.blog     ?? 0) + 1;
			else if (ch === 'instagram' || ch === 'facebook') confirmedCounts.meta_pool = (confirmedCounts.meta_pool ?? 0) + 1;
		}

		await consumeConfirmedItems(user.id, run_id, confirmedCounts).catch(err =>
			console.error('[IdeaEngine/Confirm] Failed to consume reservation:', err)
		);

		// ── Mark run as completed ─────────────────────────────────
		await admin
			.from('idea_engine_runs')
			.update({ status: 'completed', completed_at: new Date().toISOString() })
			.eq('id', run_id);

		return NextResponse.json({
			ok: true,
			queued: successCount,
			total: items.length,
			publish_mode: publishMode,
			results,
		});

	} catch (error: any) {
		console.error('[IdeaEngine/Confirm] Error:', error);
		return NextResponse.json({ error: error?.message || 'Server error' }, { status: 500 });
	}
}
