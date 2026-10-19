/**
 * Approve a monthly strategy update
 * 
 * This will:
 * 1. Update the StrategyUpdates record status to "Approved"
 * 2. Merge the updated strategy into the BrandProfiles record
 * 3. Update the brand profile's strategy_json with the new strategy
 * 4. Trigger content generation with the updated strategy
 */

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { getSupabaseService } from '@/lib/supabaseService';
import { isLegacyMakeEnabled } from '@/lib/featureFlags';
import { getIntelligenceStore } from '@/lib/intelligence/actions';
import { activateNativeStrategyDraft } from '@/lib/intelligence/strategy/activateNativeStrategy';
import {
	createNativeGenerationJob,
	dispatchNativeContentBatchWorker,
} from '@/lib/intelligence/content/nativeBatchGeneration';
import { assertStrategyReadyForContent } from '@/lib/intelligence/strategy/strategyCompleteness';

export const runtime = 'nodejs';

export async function POST(
	request: Request,
	context: { params: Promise<{ id: string }> }
) {
	try {
		const { id: strategyUpdateId } = await context.params;
		const body = await request.json().catch(() => ({}));
		const editedStrategyJson = body?.strategy_json || null; // Allow editing before approval

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

		const AIRTABLE_TOKEN = process.env.AIRTABLE_PAT;
		const BASE_ID = process.env.AIRTABLE_BASE_ID;
		const STRATEGYUPDATES_TABLE = process.env.AIRTABLE_STRATEGYUPDATES_TABLE;
		const BRANDPROFILES_TABLE = process.env.AIRTABLE_BRANDPROFILES_TABLE;

		if (!AIRTABLE_TOKEN || !BASE_ID || !STRATEGYUPDATES_TABLE || !BRANDPROFILES_TABLE) {
			return NextResponse.json(
				{ error: 'Airtable configuration missing' },
				{ status: 500 }
			);
		}

		// Fetch the strategy update record
		const updateRes = await fetch(
			`https://api.airtable.com/v0/${BASE_ID}/${STRATEGYUPDATES_TABLE}/${strategyUpdateId}`,
			{
				headers: {
					Authorization: `Bearer ${AIRTABLE_TOKEN}`,
					'Content-Type': 'application/json',
				},
			}
		);

		if (!updateRes.ok) {
			const errorText = await updateRes.text();
			return NextResponse.json(
				{ error: `Failed to fetch strategy update: ${errorText}` },
				{ status: updateRes.status }
			);
		}

		const updateData = await updateRes.json();
		const fields = updateData.fields || {};

		// Verify this update belongs to the user
		if (fields.user_id !== user.id) {
			return NextResponse.json(
				{ error: 'Unauthorized - this strategy update does not belong to you' },
				{ status: 403 }
			);
		}

		// Extract brand_profile_id
		let brandProfileId: string | null = null;
		if (fields.brand_profile_id) {
			if (Array.isArray(fields.brand_profile_id)) {
				brandProfileId = fields.brand_profile_id[0] || null;
			} else if (typeof fields.brand_profile_id === 'string') {
				brandProfileId = fields.brand_profile_id;
			}
		}

		if (!brandProfileId) {
			return NextResponse.json(
				{ error: 'Strategy update missing brand_profile_id' },
				{ status: 400 }
			);
		}

		// Get the updated strategy JSON (either from Make.com or edited by user)
		const updatedStrategyJson = editedStrategyJson || fields.updated_strategy_json || null;

		if (!updatedStrategyJson) {
			return NextResponse.json(
				{ error: 'No updated strategy found. The strategy may still be processing.' },
				{ status: 400 }
			);
		}

		// Parse the strategy JSON to ensure it's valid
		let strategyJson: any;
		try {
			strategyJson = typeof updatedStrategyJson === 'string' 
				? JSON.parse(updatedStrategyJson) 
				: updatedStrategyJson;
		} catch (error) {
			return NextResponse.json(
				{ error: 'Invalid strategy JSON format' },
				{ status: 400 }
			);
		}

		// Update the brand profile with the new strategy
		const brandUpdateRes = await fetch(
			`https://api.airtable.com/v0/${BASE_ID}/${BRANDPROFILES_TABLE}/${brandProfileId}`,
			{
				method: 'PATCH',
				headers: {
					Authorization: `Bearer ${AIRTABLE_TOKEN}`,
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({
					fields: {
						strategy_json: typeof strategyJson === 'string' ? strategyJson : JSON.stringify(strategyJson),
						// Keep status as "Strategy Approved" if it already is, otherwise update
						// Don't change status if it's already approved
					},
				}),
			}
		);

		if (!brandUpdateRes.ok) {
			const errorText = await brandUpdateRes.text();
			console.error('Failed to update brand profile with new strategy:', errorText);
			return NextResponse.json(
				{ error: `Failed to update brand profile: ${errorText}` },
				{ status: brandUpdateRes.status }
			);
		}

		// Update the strategy update record status to "Approved"
		const updateStatusRes = await fetch(
			`https://api.airtable.com/v0/${BASE_ID}/${STRATEGYUPDATES_TABLE}/${strategyUpdateId}`,
			{
				method: 'PATCH',
				headers: {
					Authorization: `Bearer ${AIRTABLE_TOKEN}`,
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({
					fields: {
						status: 'Approved',
					},
				}),
			}
		);

		if (!updateStatusRes.ok) {
			console.error('Failed to update strategy update status:', await updateStatusRes.text());
			// Don't fail the request if this fails - the brand profile is already updated
		}

		const triggerContent = Boolean(body?.triggerContent);
		let generation_job_id: string | undefined;
		let generation_error: string | undefined;

		if (!isLegacyMakeEnabled()) {
			const store = getIntelligenceStore();
			const brain = await store.getBrandBrain(user.id, brandProfileId);
			if (brain) {
				const existing = await store.getStrategyForBrand(user.id, brain.id);
				if (existing?.draftPayload) {
					await activateNativeStrategyDraft({ userId: user.id, airtableBrandId: brandProfileId });
				} else if (existing && existing.status !== 'active') {
					await store.upsertStrategy(user.id, { ...existing, status: 'active' });
				}
			}

			if (triggerContent) {
				const strategy = brain ? await store.getStrategyForBrand(user.id, brain.id) : null;
				const gate = assertStrategyReadyForContent(strategy);
				if (!gate.ok) {
					generation_error = gate.message;
				} else {
					try {
						const job = await createNativeGenerationJob({
							userId: user.id,
							brandProfileId,
							channels: [
								{ platform: 'LinkedIn', count: 2 },
								{ platform: 'Blog', count: 1 },
							],
						});
						generation_job_id = job.generation_job_id;
						await dispatchNativeContentBatchWorker(generation_job_id);
					} catch (err) {
						generation_error = err instanceof Error ? err.message : 'Native generation failed';
					}
				}
			}

			return NextResponse.json({
				ok: true,
				engine: 'native',
				message: generation_error
					? 'Monthly update approved. Content was not started.'
					: triggerContent
						? 'Monthly update approved. Native content generation started.'
						: 'Monthly update approved.',
				generation_job_id,
				generation_error,
			});
		}

		return NextResponse.json({
			ok: true,
			engine: 'legacy_mirror',
			message:
				'Monthly update mirror saved. With LEGACY_MAKE_ENABLED, trigger content manually or switch to native default.',
		});
	} catch (error: any) {
		console.error('Error approving monthly strategy update:', error);
		return NextResponse.json(
			{ error: error?.message || 'Server error' },
			{ status: 500 }
		);
	}
}
