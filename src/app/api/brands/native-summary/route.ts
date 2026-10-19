import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { getIntelligenceStore } from '@/lib/intelligence/actions';
import { scoreStrategyCompleteness, strategyGenerationPhase } from '@/lib/intelligence/strategy/strategyCompleteness';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
	const cookieStore = await cookies();
	const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
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
	});
	const {
		data: { user },
	} = await supabase.auth.getUser();
	if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

	const store = getIntelligenceStore();
	const brains = await store.listBrandBrains(user.id);
	const brands: Record<
		string,
		{
			brandBrainId: string;
			displayStatus: string;
			nativePhase: string;
			completenessScore: number;
			complete: boolean;
			strategyHref: string;
		}
	> = {};

	for (const brain of brains) {
		const strategy = await store.getStrategyForBrand(user.id, brain.id);
		const completeness = scoreStrategyCompleteness(strategy);
		const phase = strategyGenerationPhase(strategy);
		let displayStatus = 'Needs strategy';
		if (phase === 'generating') displayStatus = 'Strategy generating';
		else if (phase === 'failed') displayStatus = 'Strategy failed';
		else if (phase === 'draft_ready') displayStatus = 'Strategy ready for review';
		else if (strategy?.status === 'active') displayStatus = 'Strategy active';
		brands[brain.airtableBrandId] = {
			brandBrainId: brain.id,
			displayStatus,
			nativePhase: phase,
			completenessScore: completeness.score,
			complete: completeness.complete,
			strategyHref: `/intelligence?brand_profile_id=${encodeURIComponent(brain.airtableBrandId)}&tab=strategy`,
		};
	}

	return NextResponse.json({ brands });
}
