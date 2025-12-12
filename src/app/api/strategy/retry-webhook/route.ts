/**
 * Manual endpoint to retry Make.com webhook for a strategy update
 * 
 * Usage: POST /api/strategy/retry-webhook
 * Body: { strategy_update_id: "rec..." }
 * 
 * This will:
 * 1. Fetch the strategy update record from Airtable
 * 2. Reconstruct the Make.com webhook payload
 * 3. Trigger the webhook again
 */

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient, type CookieOptions } from '@supabase/ssr';

export const runtime = 'nodejs';

export async function POST(request: Request) {
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

		const body = await request.json().catch(() => ({}));
		const strategyUpdateId = body.strategy_update_id;

		if (!strategyUpdateId) {
			return NextResponse.json({ error: 'Missing strategy_update_id' }, { status: 400 });
		}

		const AIRTABLE_TOKEN = process.env.AIRTABLE_PAT;
		const BASE_ID = process.env.AIRTABLE_BASE_ID;
		// Find the StrategyUpdates table ID - check common environment variable names
		const TABLE_ID = process.env.AIRTABLE_STRATEGYUPDATES_TABLE || 
		                 process.env.AIRTABLE_STRATEGY_UPDATES_TABLE || 
		                 'tblStrategyUpdates';
		const BRANDPROFILES_TABLE = process.env.AIRTABLE_BRANDPROFILES_TABLE;

		if (!AIRTABLE_TOKEN || !BASE_ID || !TABLE_ID || !BRANDPROFILES_TABLE) {
			return NextResponse.json(
				{ error: 'Airtable configuration missing' },
				{ status: 500 }
			);
		}

		// Fetch the strategy update record from Airtable
		const strategyRes = await fetch(
			`https://api.airtable.com/v0/${BASE_ID}/${TABLE_ID}/${strategyUpdateId}`,
			{
				headers: {
					Authorization: `Bearer ${AIRTABLE_TOKEN}`,
					'Content-Type': 'application/json',
				},
			}
		);

		if (!strategyRes.ok) {
			const errorText = await strategyRes.text();
			return NextResponse.json(
				{ error: `Failed to fetch strategy update: ${errorText}` },
				{ status: strategyRes.status }
			);
		}

		const strategyData = await strategyRes.json();
		const fields = strategyData.fields || {};

		// Extract brand_profile_id (could be array from link field)
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
				{ error: 'Strategy update record missing brand_profile_id' },
				{ status: 400 }
			);
		}

		// Fetch brand_type from BrandProfiles
		let brandType = 'company';
		try {
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
				brandType = brandRecord.fields?.brand_type || 'company';
			}
		} catch (error) {
			console.warn('Failed to fetch brand_type, defaulting to company:', error);
		}

		// Get user_id from the strategy update record
		const userId = fields.user_id || user.id;

		// Reconstruct the Make.com webhook payload
		const makePayload = {
			mode: 'monthly_update',
			strategy_update_id: strategyUpdateId,
			brand_profile_id: brandProfileId,
			user_id: userId,
			brand_type: brandType,
			monthly: {
				objective: fields.objective || '',
				themes_focus: fields.themes_focus || '',
				key_dates: fields.key_dates || '',
				feedback_notes: fields.feedback_notes || '',
				content_preferences: fields.content_preferences || '',
				monthly_cycle_start: fields.monthly_cycle_start || new Date().toISOString(),
				cycle_label: fields.cycle_label || '',
				attachments: fields.attachments || [],
			},
			// Include initial strategy fields as null/empty for consistency
			brand: null,
			audience: null,
			value_props: null,
			offers: null,
			brand_goals: null,
			platforms_requested: null,
			urls_to_scrape: null,
			assets: null,
			strategy_context: null,
		};

		const webhookUrl = process.env.MAKE_STRATEGY_WEBHOOK_URL;
		if (!webhookUrl) {
			return NextResponse.json(
				{ error: 'MAKE_STRATEGY_WEBHOOK_URL is not configured' },
				{ status: 500 }
			);
		}

		const headers: Record<string, string> = {
			'Content-Type': 'application/json',
		};
		const outboundSecret = process.env.MAKE_STRATEGY_WEBHOOK_SECRET || process.env.MAKE_SHARED_SECRET;
		if (outboundSecret) {
			headers['x-make-secret'] = outboundSecret;
		}

		console.log('[Retry Webhook] Triggering Make.com webhook for strategy update:', {
			strategyUpdateId,
			brandProfileId,
			userId,
			webhookUrl: webhookUrl.substring(0, 50) + '...',
		});

		// Trigger the webhook
		const webhookRes = await fetch(webhookUrl, {
			method: 'POST',
			headers,
			body: JSON.stringify(makePayload),
		});

		const responseText = await webhookRes.text().catch(() => '');

		if (!webhookRes.ok) {
			console.error('[Retry Webhook] Make.com webhook failed:', {
				strategyUpdateId,
				status: webhookRes.status,
				error: responseText.substring(0, 500),
			});

			// Update Airtable record with error status
			try {
				await fetch(`https://api.airtable.com/v0/${BASE_ID}/${TABLE_ID}/${strategyUpdateId}`, {
					method: 'PATCH',
					headers: {
						Authorization: `Bearer ${AIRTABLE_TOKEN}`,
						'Content-Type': 'application/json',
					},
					body: JSON.stringify({
						fields: {
							status: 'Failed',
							error_message: `Make.com webhook failed (${webhookRes.status}): ${responseText.substring(0, 200)}`,
						},
					}),
				});
			} catch (updateError) {
				console.error('Failed to update Airtable with error status:', updateError);
			}

			return NextResponse.json(
				{
					error: 'Webhook failed',
					status: webhookRes.status,
					response: responseText.substring(0, 500),
				},
				{ status: webhookRes.status }
			);
		}

		console.log('[Retry Webhook] Make.com webhook triggered successfully:', {
			strategyUpdateId,
			status: webhookRes.status,
			response: responseText.substring(0, 200),
		});

		// Update Airtable record status to 'Processing'
		try {
			await fetch(`https://api.airtable.com/v0/${BASE_ID}/${TABLE_ID}/${strategyUpdateId}`, {
				method: 'PATCH',
				headers: {
					Authorization: `Bearer ${AIRTABLE_TOKEN}`,
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({
					fields: {
						status: 'Processing',
					},
				}),
			});
		} catch (updateError) {
			console.error('Failed to update Airtable status to Processing:', updateError);
		}

		return NextResponse.json({
			ok: true,
			message: 'Webhook triggered successfully',
			strategyUpdateId,
			status: webhookRes.status,
			response: responseText.substring(0, 200),
		});
	} catch (error: any) {
		console.error('[Retry Webhook] Error:', error);
		return NextResponse.json(
			{ error: error?.message || 'Server error' },
			{ status: 500 }
		);
	}
}
