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
		.select('posts, linkedin_posts, x_posts, blog_posts, instagram_posts, facebook_posts')
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
	};
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


