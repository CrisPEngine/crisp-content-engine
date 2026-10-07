/**
 * GET /api/content/quota
 * Returns per-channel quota usage and limits for the current user.
 */

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { UNLIMITED_USAGE_CAP, bypassesUsageLimits } from '@/lib/auth/platformAdmin';
import { getChannelUsage } from '@/lib/enforceCaps';
import { resolvePlan } from '@/lib/planResolver';
import { CAPS } from '@/config/pricing';

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

		const { data: { user }, error: userError } = await supabase.auth.getUser();
		if (userError || !user) {
			return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
		}

		const resolved = await resolvePlan(user.id);
		const plan = resolved.plan === 'free' ? 'starter' : resolved.plan;
		const planCaps = CAPS[plan as keyof typeof CAPS] || CAPS.starter;
		const usage = await getChannelUsage(user.id);
		const unlimited = await bypassesUsageLimits(user.id);

		const isStarter = plan === 'starter';
		const channelLimit = (cap: number) => (unlimited ? UNLIMITED_USAGE_CAP : cap);
		const channelRemaining = (cap: number, used: number) => (unlimited ? UNLIMITED_USAGE_CAP : Math.max(0, cap - used));

		return NextResponse.json({
			plan,
			platform_admin: unlimited,
			channels: {
				linkedin: {
					limit: channelLimit(planCaps.linkedinPostsMonthly),
					used: usage.linkedin,
					remaining: channelRemaining(planCaps.linkedinPostsMonthly, usage.linkedin),
					autopublish: planCaps.autopublishLinkedIn,
					// Quota consumed at: generation (Starter export) or approval (paid autopublish)
					counted_at: planCaps.autopublishLinkedIn ? 'approval' : 'generation',
				},
				x: {
					limit: channelLimit(planCaps.xPostsMonthly),
					used: usage.x,
					remaining: channelRemaining(planCaps.xPostsMonthly, usage.x),
					autopublish: false,
					counted_at: 'generation',
				},
				blog: {
					limit: channelLimit(isStarter ? planCaps.blogOutlinesMonthly : planCaps.blogArticlesMonthly),
					used: isStarter ? usage.blog_outlines : usage.blog,
					remaining: channelRemaining(
						isStarter ? planCaps.blogOutlinesMonthly : planCaps.blogArticlesMonthly,
						isStarter ? usage.blog_outlines : usage.blog,
					),
					type: isStarter ? 'outline' : 'article',
					counted_at: 'generation',
				},
				meta_pool: {
					limit: channelLimit(planCaps.metaPoolMonthly),
					used: usage.meta_pool,
					remaining: channelRemaining(planCaps.metaPoolMonthly, usage.meta_pool),
					note: 'Shared across Facebook and Instagram',
					autopublish: planCaps.autopublishMeta,
					counted_at: planCaps.autopublishMeta ? 'approval' : 'generation',
				},
			},
			plan_meta: {
				max_brands: planCaps.maxBrands,
				max_seats: planCaps.maxSeats,
				included_platforms: planCaps.includedPlatforms,
				make_scenario: planCaps.makeScenario,
			},
		});
	} catch (error: any) {
		console.error('[Quota API] Error:', error);
		return NextResponse.json({ error: error?.message || 'Failed to get quota' }, { status: 500 });
	}
}
