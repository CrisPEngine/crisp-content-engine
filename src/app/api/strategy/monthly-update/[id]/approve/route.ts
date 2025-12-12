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

		// Trigger content generation with the updated strategy
		const admin = getSupabaseService();
		const { data: linkedInConnections } = await admin
			.from('social_connections')
			.select('person_urn, organization_urn, connection_type, brand_profile_id')
			.eq('user_id', user.id)
			.eq('provider', 'linkedin');

		// Get brand type
		const brandRes = await fetch(
			`https://api.airtable.com/v0/${BASE_ID}/${BRANDPROFILES_TABLE}/${brandProfileId}`,
			{
				headers: {
					Authorization: `Bearer ${AIRTABLE_TOKEN}`,
					'Content-Type': 'application/json',
				},
			}
		);

		let brandType = 'company';
		let linkedInConnection: any = null;

		if (brandRes.ok && linkedInConnections && linkedInConnections.length > 0) {
			const brandRecord = await brandRes.json();
			brandType = brandRecord.fields?.brand_type || 'company';

			// Find appropriate LinkedIn connection
			if (brandType === 'company') {
				linkedInConnection = linkedInConnections.find(
					(conn: any) => conn.connection_type === 'organization' && 
						(conn.brand_profile_id === brandProfileId || !conn.brand_profile_id)
				) || linkedInConnections.find((conn: any) => conn.connection_type === 'organization');
			} else {
				linkedInConnection = linkedInConnections.find(
					(conn: any) => conn.connection_type === 'member' && 
						(conn.brand_profile_id === brandProfileId || !conn.brand_profile_id)
				) || linkedInConnections.find((conn: any) => conn.connection_type === 'member');
			}

			if (!linkedInConnection) {
				linkedInConnection = linkedInConnections[0];
			}
		}

		// Trigger content generation webhook if configured
		const MAKE_CONTENT_WEBHOOK_URL = process.env.MAKE_CONTENT_GENERATION_WEBHOOK_URL;
		if (MAKE_CONTENT_WEBHOOK_URL && linkedInConnection) {
			try {
				const personUrn = linkedInConnection.person_urn || null;
				const organizationUrn = linkedInConnection.organization_urn || null;

				const contentPayload = {
					brand_profile_id: brandProfileId,
					user_id: user.id,
					person_urn: personUrn,
					organization_urn: organizationUrn,
					brand_type: brandType,
					strategy_json: strategyJson,
					triggered_at: new Date().toISOString(),
				};

				await fetch(MAKE_CONTENT_WEBHOOK_URL, {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						...(process.env.MAKE_API_KEY && {
							'x-api-key': process.env.MAKE_API_KEY,
						}),
						...(process.env.MAKE_CONTENT_WEBHOOK_SECRET || process.env.MAKE_SHARED_SECRET ? {
							'x-make-secret': process.env.MAKE_CONTENT_WEBHOOK_SECRET || process.env.MAKE_SHARED_SECRET,
						} : {}),
					},
					body: JSON.stringify(contentPayload),
				}).catch((err) => {
					console.error('Failed to trigger content generation:', err);
					// Don't fail the request
				});
			} catch (error) {
				console.error('Error triggering content generation:', error);
				// Don't fail the request
			}
		}

		return NextResponse.json({
			ok: true,
			message: 'Monthly strategy update approved. Content generation started.',
		});
	} catch (error: any) {
		console.error('Error approving monthly strategy update:', error);
		return NextResponse.json(
			{ error: error?.message || 'Server error' },
			{ status: 500 }
		);
	}
}
