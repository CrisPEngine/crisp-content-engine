import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { getIntelligenceStore } from '@/lib/intelligence/actions';
import { activateNativeStrategyDraft } from '@/lib/intelligence/strategy/activateNativeStrategy';
import { assertStrategyReadyForContent, scoreStrategyCompleteness } from '@/lib/intelligence/strategy/strategyCompleteness';
import { generateStrategySummary } from '@/app/api/strategy/webhook/generateStrategySummary';
import { nativeStrategyDocument } from '@/lib/intelligence/strategyView';
import { isLegacyMakeEnabled } from '@/lib/featureFlags';

export const runtime = 'nodejs';

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
	try {
		const { id: brandProfileId } = await context.params;
		const body = await request.json().catch(() => ({}));
		const strategyContent = body?.strategy_content || body?.content || '';
		const triggerFirstContent = Boolean(body?.triggerFirstContent);

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
			},
		);

		const {
			data: { user },
			error: userError,
		} = await supabase.auth.getUser();

		if (userError || !user) {
			return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
		}

		const store = getIntelligenceStore();
		const brain = await store.getBrandBrain(user.id, brandProfileId);
		if (!brain) {
			return NextResponse.json(
				{ error: 'Native brand brain not found. Open Intelligence to finish setup.' },
				{ status: 400 },
			);
		}

		let strategy = await store.getStrategyForBrand(user.id, brain.id);
		if (strategy?.draftPayload) {
			await activateNativeStrategyDraft({ userId: user.id, airtableBrandId: brandProfileId });
			strategy = await store.getStrategyForBrand(user.id, brain.id);
		}

		const gate = assertStrategyReadyForContent(strategy);
		if (!gate.ok && gate.code !== 'strategy_not_active') {
			return NextResponse.json(
				{
					error: gate.message,
					code: gate.code,
					next_action_href: `/intelligence?brand_profile_id=${encodeURIComponent(brandProfileId)}`,
					completeness: gate.completeness,
				},
				{ status: 400 },
			);
		}

		if (strategy && strategy.status !== 'active') {
			await store.upsertStrategy(user.id, {
				...strategy,
				status: 'active',
			});
			strategy = await store.getStrategyForBrand(user.id, brain.id);
		}

		const themes = await store.listThemes(user.id, brain.id);
		const completeness = scoreStrategyCompleteness(strategy);
		const document = strategy ? nativeStrategyDocument(strategy, themes) : {};
		const summary =
			(strategyContent && String(strategyContent).trim()) ||
			generateStrategySummary(document) ||
			strategy?.positioning ||
			'';

		const AIRTABLE_TOKEN = process.env.AIRTABLE_PAT;
		const BASE_ID = process.env.AIRTABLE_BASE_ID;
		const TABLE_ID = process.env.AIRTABLE_BRANDPROFILES_TABLE;

		if (AIRTABLE_TOKEN && BASE_ID && TABLE_ID && !brandProfileId.startsWith('local_')) {
			const updateFields: Record<string, unknown> = {
				status: 'Strategy Approved',
				strategy_json: JSON.stringify({ ...document, source: 'native_mirror' }),
				strategy_summary: summary,
			};
			const updateRes = await fetch(`https://api.airtable.com/v0/${BASE_ID}/${TABLE_ID}/${brandProfileId}`, {
				method: 'PATCH',
				headers: {
					Authorization: `Bearer ${AIRTABLE_TOKEN}`,
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({ fields: updateFields }),
			});
			if (!updateRes.ok) {
				const errorText = await updateRes.text();
				return NextResponse.json(
					{ error: 'Failed to sync strategy approval mirror to Airtable', details: errorText.slice(0, 400) },
					{ status: 502 },
				);
			}
		}

		let generation_job_id: string | undefined;
		let generationError: string | undefined;

		if (triggerFirstContent && !isLegacyMakeEnabled()) {
			const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
			const cookieHeader = request.headers.get('cookie') || '';
			const defaultChannels = [
				{ platform: 'LinkedIn' as const, count: 2 },
				{ platform: 'Blog' as const, count: 1 },
			];
			const genRes = await fetch(`${siteUrl}/api/content/generate`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					...(cookieHeader ? { Cookie: cookieHeader } : {}),
				},
				body: JSON.stringify({ brandProfileId, channels: defaultChannels }),
			});
			const genData = await genRes.json().catch(() => ({}));
			if (!genRes.ok) {
				generationError = genData?.error ?? 'Content generation failed';
			} else {
				generation_job_id = genData?.generation_job_id;
			}
		}

		return NextResponse.json({
			ok: true,
			engine: 'native',
			message: generationError
				? 'Strategy approved. First content batch did not start.'
				: triggerFirstContent
					? 'Strategy approved. Native content generation started.'
					: 'Strategy approved.',
			completeness,
			generation_job_id,
			generation_error: generationError,
			redirect_to: `/content/approval?brand=${encodeURIComponent(brandProfileId)}`,
		});
	} catch (error: unknown) {
		console.error('Strategy approval error:', error);
		return NextResponse.json(
			{ error: error instanceof Error ? error.message : 'Server error' },
			{ status: 500 },
		);
	}
}
