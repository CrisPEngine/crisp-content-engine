import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { getIntelligenceStore } from '@/lib/intelligence/actions';
import { getNativeContentStore } from '@/lib/media/store';
import { brandChannelRows } from '@/lib/social/brandChannels';
import { scoreStrategyCompleteness, strategyGenerationPhase } from '@/lib/intelligence/strategy/strategyCompleteness';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
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

	const brandBrainId = new URL(request.url).searchParams.get('brandBrainId')?.trim();
	const airtableBrandId = new URL(request.url).searchParams.get('airtableBrandId')?.trim();
	const store = getIntelligenceStore();
	const brains = await store.listBrandBrains(user.id);
	const brain =
		(brandBrainId ? brains.find((row) => row.id === brandBrainId) : undefined) ??
		(airtableBrandId ? brains.find((row) => row.airtableBrandId === airtableBrandId) : undefined) ??
		brains[0];

	if (!brain) {
		return NextResponse.json({
			brandBrainId: null,
			steps: [
				{ id: 'strategy', label: 'Review brand strategy in Intelligence', href: '/intelligence', done: false },
				{ id: 'connections', label: 'Connect publishing channels', href: '/connections', done: false },
				{ id: 'assets', label: 'Upload brand assets', href: '/content/brand-assets', done: false },
				{ id: 'agents', label: 'Grant agent access', href: '/settings/ai-connections', done: false },
			],
		});
	}

	const strategy = await store.getStrategyForBrand(user.id, brain.id);
	const completeness = scoreStrategyCompleteness(strategy);
	const phase = strategyGenerationPhase(strategy);
	const assets = await getNativeContentStore().listAssets(user.id, brain.id);
	const channels = await brandChannelRows(user.id, brain.id);
	const connectedChannels = channels.filter((row) => row.phase === 'READY' || row.phase === 'ASSIGNED').length;

	const { data: credentials } = await supabase
		.from('agent_credentials')
		.select('scope, allowed_brand_ids, revoked_at')
		.eq('owner_user_id', user.id);

	const agentAccess =
		(credentials ?? []).some((row) => {
			if (row.revoked_at) return false;
			if (row.scope === 'OWNER_ACCOUNT') return true;
			const allowed = (row.allowed_brand_ids as string[] | null) ?? [];
			return allowed.includes(brain.id);
		}) ?? false;

	return NextResponse.json({
		brandBrainId: brain.id,
		brandName: brain.identity.name,
		steps: [
			{
				id: 'strategy',
				label: 'Review brand strategy in Intelligence',
				href: `/intelligence?brand_profile_id=${encodeURIComponent(brain.airtableBrandId)}`,
				done: strategy?.status === 'active' || (phase === 'draft_ready' && completeness.complete),
			},
			{
				id: 'connections',
				label: 'Connect publishing channels',
				href: `/connections?brand=${encodeURIComponent(brain.id)}`,
				done: connectedChannels > 0,
			},
			{
				id: 'assets',
				label: 'Upload brand assets',
				href: `/content/brand-assets?brandId=${encodeURIComponent(brain.id)}`,
				done: assets.length > 0,
			},
			{
				id: 'agents',
				label: 'Grant agent access (use Allow all my brands for MCP OAuth)',
				href: '/settings/ai-connections',
				done: agentAccess,
			},
		],
	});
}
