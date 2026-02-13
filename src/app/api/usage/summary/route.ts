import { NextResponse } from 'next/server';
import { enforceCaps } from '@/lib/enforceCaps';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { resolvePlan, getTrialUsage } from '@/lib/planResolver';

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
	
	// Also get max_brands from entitlements
	let maxBrands = 999;
	try {
		const { getEntitlements } = await import('@/lib/enforceCaps');
		const entitlements = await getEntitlements(userId);
		if (entitlements?.max_brands) {
			maxBrands = entitlements.max_brands;
		}
	} catch (error) {
		console.error('Failed to get max_brands:', error);
	}
	
	// Get trial usage if on trial
	let trialUsage: { linkedin: number; x: number } | null = null;
	if (resolved.isTrial) {
		trialUsage = await getTrialUsage(userId);
	}
	
	return NextResponse.json({
		...check,
		caps: {
			...check.caps,
			max_brands: maxBrands,
		},
		plan: resolved.plan,
		isTrial: resolved.isTrial,
		trialDaysRemaining: resolved.trialDaysRemaining,
		trialEndAt: resolved.trialEndAt,
		isEmailVerified: resolved.isEmailVerified,
		trialUsage: trialUsage ? {
			linkedin: trialUsage.linkedin,
			x: trialUsage.x,
			linkedinRemaining: Math.max(0, 3 - trialUsage.linkedin),
			xRemaining: Math.max(0, 3 - trialUsage.x),
		} : undefined,
	});
}


