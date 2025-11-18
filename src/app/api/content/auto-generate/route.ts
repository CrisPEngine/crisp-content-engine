import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient, type CookieOptions } from '@supabase/ssr';

export const runtime = 'nodejs';

/**
 * Auto-generate content for brands that have auto_generate_content enabled
 * This endpoint should be called when monthly usage renews (e.g., from Stripe webhook)
 * 
 * Can be called with:
 * - userId: to generate for all user's brands with auto_generate enabled
 * - brand_profile_id: to generate for a specific brand
 */
export async function POST(req: Request) {
	try {
		const body = await req.json().catch(() => ({}));
		const userId = body?.userId;
		const brandProfileId = body?.brand_profile_id;

		if (!userId && !brandProfileId) {
			return NextResponse.json(
				{ error: 'Either userId or brand_profile_id is required' },
				{ status: 400 }
			);
		}

		const AIRTABLE_TOKEN = process.env.AIRTABLE_PAT;
		const BASE_ID = process.env.AIRTABLE_BASE_ID;
		const BRANDPROFILES_TABLE = process.env.AIRTABLE_BRANDPROFILES_TABLE;
		const CONTENT_WEBHOOK_URL = process.env.MAKE_CONTENT_GENERATION_WEBHOOK_URL;

		if (!AIRTABLE_TOKEN || !BASE_ID || !BRANDPROFILES_TABLE) {
			return NextResponse.json(
				{ error: 'Airtable configuration missing' },
				{ status: 500 }
			);
		}

		if (!CONTENT_WEBHOOK_URL) {
			return NextResponse.json(
				{ error: 'Content generation webhook not configured' },
				{ status: 500 }
			);
		}

		// Fetch brand profiles with auto_generate_content enabled
		let brandProfiles: any[] = [];

		if (brandProfileId) {
			// Fetch specific brand
			const brandRes = await fetch(
				`https://api.airtable.com/v0/${BASE_ID}/${BRANDPROFILES_TABLE}/${brandProfileId}`,
				{
					headers: {
						Authorization: `Bearer ${AIRTABLE_TOKEN}`,
						'Content-Type': 'application/json',
					},
				}
			);

			if (brandRes.ok) {
				const brandRecord = await brandRes.json();
				if (brandRecord.fields?.auto_generate_content === true) {
					brandProfiles.push(brandRecord);
				}
			}
		} else if (userId) {
			// Fetch all user's brands with auto_generate_content enabled
			const filter = `AND({user_id} = "${userId}", {auto_generate_content} = TRUE())`;
			const url = new URL(`https://api.airtable.com/v0/${BASE_ID}/${BRANDPROFILES_TABLE}`);
			url.searchParams.set('filterByFormula', filter);

			const brandsRes = await fetch(url.toString(), {
				headers: {
					Authorization: `Bearer ${AIRTABLE_TOKEN}`,
					'Content-Type': 'application/json',
				},
			});

			if (brandsRes.ok) {
				const brandsData = await brandsRes.json();
				brandProfiles = brandsData.records || [];
			}
		}

		if (brandProfiles.length === 0) {
			return NextResponse.json({
				ok: true,
				message: 'No brands found with auto-generation enabled',
				generated: 0,
			});
		}

		// Trigger content generation for each brand
		const results = await Promise.allSettled(
			brandProfiles.map(async (brandRecord) => {
				const fields = brandRecord.fields || {};
				const brandProfileId = brandRecord.id;

				// Fetch strategy data
				const strategyJson = fields.strategy_json || fields.strategy_payload;
				const strategySummary = fields.strategy_summary || '';

				if (!strategyJson) {
					console.warn(`Brand ${brandProfileId} has no strategy_json, skipping`);
					return { brandProfileId, success: false, reason: 'No strategy found' };
				}

				// Get LinkedIn connection if available
				// This would need to be fetched from connections table
				// For now, we'll pass null and let Make handle it
				const personUrn = null; // TODO: Fetch from connections table

				const contentPayload = {
					brand_profile_id: brandProfileId,
					user_id: userId || fields.user_id,
					person_urn: personUrn,
					brand_type: fields.brand_type || 'company',
					strategy_json: typeof strategyJson === 'string' ? JSON.parse(strategyJson) : strategyJson,
					strategy_summary: strategySummary,
					triggered_at: new Date().toISOString(),
					auto_generated: true, // Flag to indicate this was auto-generated
				};

				const webhookRes = await fetch(CONTENT_WEBHOOK_URL, {
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
				});

				if (!webhookRes.ok) {
					const errorText = await webhookRes.text();
					console.error(`Content generation webhook failed for ${brandProfileId}:`, errorText);
					return { brandProfileId, success: false, reason: errorText };
				}

				return { brandProfileId, success: true };
			})
		);

		const successful = results.filter((r) => r.status === 'fulfilled' && r.value.success).length;
		const failed = results.length - successful;

		return NextResponse.json({
			ok: true,
			message: `Content generation triggered for ${successful} brand(s)`,
			generated: successful,
			failed,
			results: results.map((r) => (r.status === 'fulfilled' ? r.value : { success: false, reason: r.reason })),
		});
	} catch (error: any) {
		console.error('Auto-content generation error:', error);
		return NextResponse.json(
			{ error: error?.message || 'Server error' },
			{ status: 500 }
		);
	}
}

