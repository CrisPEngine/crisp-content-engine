import dayjs from 'dayjs';
import { getSupabaseService } from './supabaseService';

export type CapsCheck = {
	ok: boolean;
	reason?: string;
	usage?: { posts: number };
	caps?: { posts_per_month: number };
};

export type ChannelUsage = {
	total: number;
	linkedin: number;
	x: number;
	blog: number;
	instagram: number;
	facebook: number;
	meta_pool: number; // shared FB+IG pool (tracked at approval time)
	blog_outlines: number; // Starter-only outline counter
};

export async function getMonthUsage(userId: string) {
	const supabase = getSupabaseService();
	const ym = dayjs().format('YYYY-MM');
	const { data } = await supabase
		.from('usage_posts')
		.select('*')
		.eq('user_id', userId)
		.eq('year_month', ym)
		.maybeSingle();
	return data?.posts ?? 0;
}

export async function getChannelUsage(userId: string): Promise<ChannelUsage> {
	const supabase = getSupabaseService();
	const ym = dayjs().format('YYYY-MM');
	const { data } = await supabase
		.from('usage_posts')
		.select('posts, linkedin_posts, x_posts, blog_posts, instagram_posts, facebook_posts, meta_pool_used, blog_outlines_used')
		.eq('user_id', userId)
		.eq('year_month', ym)
		.maybeSingle();

	return {
		total: data?.posts ?? 0,
		linkedin: data?.linkedin_posts ?? 0,
		x: data?.x_posts ?? 0,
		blog: data?.blog_posts ?? 0,
		instagram: data?.instagram_posts ?? 0,
		facebook: data?.facebook_posts ?? 0,
		meta_pool: data?.meta_pool_used ?? 0,
		blog_outlines: data?.blog_outlines_used ?? 0,
	};
}

/**
 * Increment usage counters for a specific channel at the right time.
 * LinkedIn and Meta are counted at approval time; X and Blog at generation time.
 */
export async function incrementChannelUsage(
	userId: string,
	channel: 'linkedin' | 'x' | 'blog' | 'meta_pool' | 'blog_outlines',
	count: number = 1
): Promise<void> {
	if (count <= 0) return;
	const supabase = getSupabaseService();
	const ym = dayjs().format('YYYY-MM');

	const { data: existing } = await supabase
		.from('usage_posts')
		.select('id, posts, linkedin_posts, x_posts, blog_posts, instagram_posts, facebook_posts, meta_pool_used, blog_outlines_used')
		.eq('user_id', userId)
		.eq('year_month', ym)
		.maybeSingle();

	const updates: Record<string, number> = {};
	if (channel === 'linkedin') {
		updates.linkedin_posts = ((existing as any)?.linkedin_posts ?? 0) + count;
	} else if (channel === 'x') {
		updates.x_posts = ((existing as any)?.x_posts ?? 0) + count;
		updates.posts = ((existing as any)?.posts ?? 0) + count;
	} else if (channel === 'blog') {
		updates.blog_posts = ((existing as any)?.blog_posts ?? 0) + count;
		updates.posts = ((existing as any)?.posts ?? 0) + count;
	} else if (channel === 'meta_pool') {
		updates.meta_pool_used = ((existing as any)?.meta_pool_used ?? 0) + count;
	} else if (channel === 'blog_outlines') {
		updates.blog_outlines_used = ((existing as any)?.blog_outlines_used ?? 0) + count;
		updates.posts = ((existing as any)?.posts ?? 0) + count;
	}

	if (existing) {
		await supabase.from('usage_posts').update(updates).eq('id', (existing as any).id);
	} else {
		await supabase.from('usage_posts').insert({
			user_id: userId,
			year_month: ym,
			posts: updates.posts ?? 0,
			linkedin_posts: updates.linkedin_posts ?? 0,
			x_posts: updates.x_posts ?? 0,
			blog_posts: updates.blog_posts ?? 0,
			instagram_posts: 0,
			facebook_posts: 0,
			meta_pool_used: updates.meta_pool_used ?? 0,
			blog_outlines_used: updates.blog_outlines_used ?? 0,
		});
	}
}

/**
 * Decrement usage for a channel (floors at 0).
 * NOTE: Idea Engine uses the reservation model instead of calling this function.
 * This is kept for potential future non-IE decrement needs only.
 */
export async function decrementChannelUsage(
	userId: string,
	channel: 'linkedin' | 'x' | 'blog' | 'meta_pool' | 'blog_outlines',
	count: number = 1
): Promise<void> {
	if (count <= 0) return;
	const supabase = getSupabaseService();
	const ym = dayjs().format('YYYY-MM');

	const { data: existing } = await supabase
		.from('usage_posts')
		.select('id, posts, linkedin_posts, x_posts, blog_posts, instagram_posts, facebook_posts, meta_pool_used, blog_outlines_used')
		.eq('user_id', userId)
		.eq('year_month', ym)
		.maybeSingle();

	if (!existing) return;

	const row = existing as any;
	const updates: Record<string, number> = {};

	if (channel === 'linkedin') {
		updates.linkedin_posts = Math.max(0, (row.linkedin_posts ?? 0) - count);
	} else if (channel === 'x') {
		updates.x_posts = Math.max(0, (row.x_posts ?? 0) - count);
		updates.posts = Math.max(0, (row.posts ?? 0) - count);
	} else if (channel === 'blog') {
		updates.blog_posts = Math.max(0, (row.blog_posts ?? 0) - count);
		updates.posts = Math.max(0, (row.posts ?? 0) - count);
	} else if (channel === 'meta_pool') {
		updates.meta_pool_used = Math.max(0, (row.meta_pool_used ?? 0) - count);
	} else if (channel === 'blog_outlines') {
		updates.blog_outlines_used = Math.max(0, (row.blog_outlines_used ?? 0) - count);
		updates.posts = Math.max(0, (row.posts ?? 0) - count);
	}

	if (Object.keys(updates).length > 0) {
		await supabase.from('usage_posts').update(updates).eq('id', row.id);
	}
}

/**
 * How many Idea Engine series runs has the user triggered this calendar month?
 */
export async function getIdeaEngineRunsUsed(userId: string): Promise<number> {
	const supabase = getSupabaseService();
	const ym = dayjs().format('YYYY-MM');
	const { data } = await supabase
		.from('usage_posts')
		.select('idea_engine_runs_used')
		.eq('user_id', userId)
		.eq('year_month', ym)
		.maybeSingle();
	return (data as any)?.idea_engine_runs_used ?? 0;
}

/**
 * Increment the Idea Engine runs counter for the current month.
 */
export async function incrementIdeaEngineRunsUsed(userId: string): Promise<void> {
	const supabase = getSupabaseService();
	const ym = dayjs().format('YYYY-MM');

	const { data: existing } = await supabase
		.from('usage_posts')
		.select('id, idea_engine_runs_used')
		.eq('user_id', userId)
		.eq('year_month', ym)
		.maybeSingle();

	if (existing) {
		await supabase
			.from('usage_posts')
			.update({ idea_engine_runs_used: ((existing as any).idea_engine_runs_used ?? 0) + 1 })
			.eq('id', (existing as any).id);
	} else {
		await supabase.from('usage_posts').insert({
			user_id: userId,
			year_month: ym,
			posts: 0,
			linkedin_posts: 0,
			x_posts: 0,
			blog_posts: 0,
			instagram_posts: 0,
			facebook_posts: 0,
			meta_pool_used: 0,
			blog_outlines_used: 0,
			idea_engine_runs_used: 1,
		});
	}
}

// ─── Reservation-based quota model for Idea Engine ──────────────────────────
//
// Flow:
//   1. Make returns items → upsertReservation (does NOT touch usage_posts)
//   2. User confirms items → consumeConfirmedItems (increments usage_posts, deletes reservation)
//   3. User deletes a draft item → releaseItemFromReservation (decrements reservation by 1)
//   4. User cancels run → releaseRunReservation (deletes reservation entirely)
//   5. Regenerate → no quota change (item replaced in-place, reservation unchanged)
//
// This guarantees quota is only consumed for items that land in the queue,
// and prevents double-counting when Idea Engine items later flow through the
// normal approval path.
// ─────────────────────────────────────────────────────────────────────────────

export type ReservationChannelCounts = {
	linkedin?: number;
	x?: number;
	blog?: number;
	meta_pool?: number;
};

/**
 * Create or replace the quota reservation for an Idea Engine run.
 * Called by the Make callback webhook when items are returned.
 * Uses upsert so retries are safe.
 */
export async function upsertReservation(
	userId: string,
	runId: string,
	channelCounts: ReservationChannelCounts
): Promise<void> {
	const supabase = getSupabaseService();
	const ym = dayjs().format('YYYY-MM');
	const row = {
		user_id: userId,
		run_id: runId,
		year_month: ym,
		linkedin_reserved: channelCounts.linkedin ?? 0,
		x_reserved: channelCounts.x ?? 0,
		blog_reserved: channelCounts.blog ?? 0,
		meta_pool_reserved: channelCounts.meta_pool ?? 0,
		updated_at: new Date().toISOString(),
	};
	await supabase
		.from('usage_reservations')
		.upsert(row, { onConflict: 'run_id' });
}

/**
 * Reduce a reservation by 1 for a specific channel.
 * Called when a draft Idea Engine item is deleted before confirm.
 */
export async function releaseItemFromReservation(
	runId: string,
	channel: 'linkedin' | 'x' | 'blog' | 'meta_pool'
): Promise<void> {
	const supabase = getSupabaseService();
	const { data: row } = await supabase
		.from('usage_reservations')
		.select('id, linkedin_reserved, x_reserved, blog_reserved, meta_pool_reserved')
		.eq('run_id', runId)
		.maybeSingle();

	if (!row) return;

	const fieldMap: Record<string, string> = {
		linkedin: 'linkedin_reserved',
		x: 'x_reserved',
		blog: 'blog_reserved',
		meta_pool: 'meta_pool_reserved',
	};
	const field = fieldMap[channel];
	const current = (row as any)[field] ?? 0;
	const next = Math.max(0, current - 1);
	await supabase
		.from('usage_reservations')
		.update({ [field]: next, updated_at: new Date().toISOString() })
		.eq('id', (row as any).id);
}

/**
 * Delete the reservation for a run entirely.
 * Called when a run is cancelled (quota was never consumed).
 * Also triggered automatically by ON DELETE CASCADE when a run is deleted.
 */
export async function releaseRunReservation(runId: string): Promise<void> {
	const supabase = getSupabaseService();
	await supabase.from('usage_reservations').delete().eq('run_id', runId);
}

/**
 * Convert a run's reservation into actual usage counters for a specific set
 * of confirmed channel counts. Called at confirm time.
 *
 * Only increments for channels with count > 0. After conversion the
 * reservation row is deleted (idempotent — safe to call once).
 *
 * @param userId   - user who owns the items
 * @param runId    - the idea engine run
 * @param confirmed - per-channel counts of successfully written Airtable items
 */
export async function consumeConfirmedItems(
	userId: string,
	runId: string,
	confirmed: ReservationChannelCounts
): Promise<void> {
	// Increment usage_posts for each channel that had confirmed items
	const channels = (
		[
			['linkedin', confirmed.linkedin],
			['x', confirmed.x],
			['blog', confirmed.blog],
			['meta_pool', confirmed.meta_pool],
		] as Array<[Parameters<typeof incrementChannelUsage>[1], number | undefined]>
	).filter(([, count]) => count && count > 0);

	for (const [channel, count] of channels) {
		await incrementChannelUsage(userId, channel, count as number);
	}

	// Clean up the reservation regardless of partial failures above
	await releaseRunReservation(runId);
}

export async function getEntitlements(userId: string) {
	const supabase = getSupabaseService();
	const { data, error } = await supabase
		.from('entitlements')
		.select('*')
		.eq('user_id', userId)
		.single();
	if (error) throw error;
	return data;
}

export async function enforceCaps(userId: string): Promise<CapsCheck> {
	const ents = await getEntitlements(userId);
	if (!ents) return { ok: false, reason: 'No entitlements for user.' };
	const used = await getMonthUsage(userId);
	const cap = ents.posts_per_month ?? 0;
	if (cap && cap < 999999 && used >= cap) {
		return {
			ok: false,
			reason: `Monthly post limit reached (${used}/${cap}).`,
			caps: { posts_per_month: cap },
			usage: { posts: used },
		};
	}
	return {
		ok: true,
		caps: { posts_per_month: cap || 999999 },
		usage: { posts: used },
	};
}
