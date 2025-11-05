import dayjs from 'dayjs';
import { getSupabaseService } from './supabaseService';

export type CapsCheck = {
	ok: boolean;
	reason?: string;
	usage?: { posts: number };
	caps?: { posts_per_month: number };
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


