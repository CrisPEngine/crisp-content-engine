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
