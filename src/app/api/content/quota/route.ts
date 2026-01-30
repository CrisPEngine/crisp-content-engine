/**
 * Get quota remaining for current user
 * 
 * Returns: { max_brands, max_posts_per_month, posts_used_this_month, posts_remaining }
 */

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { getEntitlements, getMonthUsage } from '@/lib/enforceCaps';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
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
			}
		);

		const {
			data: { user },
			error: userError,
		} = await supabase.auth.getUser();

		if (userError || !user) {
			return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
		}

		// Get entitlements and usage
		const entitlements = await getEntitlements(user.id);
		const postsUsed = await getMonthUsage(user.id);

		const maxBrands = entitlements?.max_brands || 1;
		const maxPostsPerMonth = entitlements?.posts_per_month || 10;
		const postsRemaining = Math.max(0, maxPostsPerMonth - postsUsed);

		return NextResponse.json({
			max_brands: maxBrands,
			max_posts_per_month: maxPostsPerMonth,
			posts_used_this_month: postsUsed,
			posts_remaining: postsRemaining,
		});
	} catch (error: any) {
		console.error('[Quota API] Error:', error);
		return NextResponse.json(
			{ error: error?.message || 'Failed to get quota' },
			{ status: 500 }
		);
	}
}
