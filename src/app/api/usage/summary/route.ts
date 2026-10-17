import { NextResponse } from 'next/server';
import { getMaxBrandsForUser } from '@/lib/brandLimits';
import { bypassesUsageLimits } from '@/lib/auth/platformAdmin';
import { enforceCaps } from '@/lib/enforceCaps';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { resolvePlan } from '@/lib/planResolver';
import { capsFor } from '@/lib/billing';
import type { PlanId } from '@/config/pricing';

export const runtime = 'nodejs';

async function getUserId(req: Request): Promise<string | null> {
	const res = NextResponse.next();
	const supabase = createServerClient(
		process.env.NEXT_PUBLIC_SUPABASE_URL!,
		process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
		{
			cookies: {
				get(name: string) { return (req as any).cookies?.get?.(name)?.value; },
				set(name: string, value: string, options: CookieOptions) { res.cookies.set({ name, value, ...options }); },
				remove(name: string, options: CookieOptions) { res.cookies.set({ name, value: '', ...options, expires: new Date(0) }); },
			},
		}
	);
	const { data: { user } } = await supabase.auth.getUser();
	return user?.id ?? null;
}

export async function GET(req: Request) {
	const userId = await getUserId(req);
	if (!userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
	
	// Use canonical plan resolver with auto-provisioning
	const resolved = await resolvePlan(userId);
	
	const check = await enforceCaps(userId);

	// Use canonical plan caps (Starter = 9 posts, etc.)
	const planId = resolved.plan === 'free' ? null : (resolved.plan as PlanId);
	const planCaps = planId ? capsFor(planId) : null;
	const caps = {
		...check.caps,
		...(planCaps && {
			posts_per_month: planCaps.posts_per_month,
			linkedin_monthly: planCaps.linkedin_monthly,
			x_monthly: planCaps.x_monthly,
			blog_monthly: planCaps.blog_monthly,
			meta_pool_monthly: planCaps.meta_pool_monthly,
		}),
	};

	const platformAdmin = await bypassesUsageLimits(userId);
	const maxBrands = await getMaxBrandsForUser(userId);

	return NextResponse.json({
		...check,
		caps: {
			...caps,
			max_brands: maxBrands,
		},
		plan: resolved.plan,
		isEmailVerified: resolved.isEmailVerified,
		platform_admin: platformAdmin,
	});
}


