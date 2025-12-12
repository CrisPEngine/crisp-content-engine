import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { z } from 'zod';

export const runtime = 'nodejs';

const schema = z.object({
	brand_profile_id: z.string().min(1, 'Select a brand profile'),
	update_mode: z.enum(['continue', 'update']).default('continue'),
	monthly_cycle_start: z.string().optional(),
	objective: z.string().optional(),
	themes_focus: z.string().optional(),
	key_dates: z.string().optional().default(''),
	feedback_notes: z.string().optional().default(''),
	content_preferences: z.string().optional().default(''),
	attachments: z.array(z.string().url()).optional().default([]),
}).superRefine((data, ctx) => {
	// If updating strategy, require objective and themes_focus
	if (data.update_mode === 'update') {
		if (!data.objective || data.objective.trim().length < 5) {
			ctx.addIssue({
				path: ['objective'],
				code: z.ZodIssueCode.custom,
				message: 'Tell us the objective for this month',
			});
		}
		if (!data.themes_focus || data.themes_focus.trim().length < 5) {
			ctx.addIssue({
				path: ['themes_focus'],
				code: z.ZodIssueCode.custom,
				message: 'List the priority themes for this cycle',
			});
		}
	}
});

const formatCycleLabel = (date: Date) =>
	date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

export async function POST(req: Request) {
	try {
		const body = await req.json();
		const data = schema.parse(body);

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
		const TABLE_ID = process.env.AIRTABLE_STRATEGYUPDATES_TABLE;
		const BRANDPROFILES_TABLE = process.env.AIRTABLE_BRANDPROFILES_TABLE;

		if (!AIRTABLE_TOKEN || !BASE_ID || !TABLE_ID || !BRANDPROFILES_TABLE) {
			return NextResponse.json(
				{ error: 'Airtable configuration missing. Please contact support.' },
				{ status: 500 }
			);
		}

		// If mode is 'continue', save preference and optionally trigger content generation
		if (data.update_mode === 'continue') {
			try {
				// Check if renewal date is today or in the past - if so, trigger immediately
				const renewalDate = data.monthly_cycle_start ? new Date(data.monthly_cycle_start) : null;
				const today = new Date();
				today.setHours(0, 0, 0, 0); // Reset to start of day for comparison
				
				let shouldTriggerNow = false;
				if (renewalDate) {
					const renewalDateStart = new Date(renewalDate);
					renewalDateStart.setHours(0, 0, 0, 0);
					shouldTriggerNow = renewalDateStart.getTime() <= today.getTime();
				}

				// Update BrandProfiles to mark that this brand should auto-generate content on renewal
				const updateRes = await fetch(
					`https://api.airtable.com/v0/${BASE_ID}/${BRANDPROFILES_TABLE}/${data.brand_profile_id}`,
					{
						method: 'PATCH',
						headers: {
							Authorization: `Bearer ${AIRTABLE_TOKEN}`,
							'Content-Type': 'application/json',
						},
						body: JSON.stringify({
							fields: {
								auto_generate_content: true, // Flag to indicate auto-generation on renewal
								last_monthly_update_mode: 'continue',
								last_monthly_update_at: new Date().toISOString(),
							},
						}),
					}
				);

				if (!updateRes.ok) {
					const errorData = await updateRes.json();
					console.error('Failed to save continue preference:', errorData);
					// Don't fail the request, just log
				}

				// If renewal is today or in the past, trigger content generation immediately
				if (shouldTriggerNow) {
					console.log('Renewal date is today or past, triggering content generation immediately');
					const autoGenerateUrl = `${process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/api/content/auto-generate`;
					
					// Trigger in background (don't wait)
					fetch(autoGenerateUrl, {
						method: 'POST',
						headers: {
							'Content-Type': 'application/json',
							...(process.env.MAKE_API_KEY && {
								'x-api-key': process.env.MAKE_API_KEY,
							}),
						},
						body: JSON.stringify({
							userId: user.id,
							brand_profile_id: data.brand_profile_id,
						}),
					}).catch((err) => {
						console.error('Failed to trigger auto-content generation:', err);
						// Don't fail the request if this fails
					});

					return NextResponse.json({
						ok: true,
						message: 'Preference saved. Content generation has been triggered for your renewal.',
					});
				}

				return NextResponse.json({
					ok: true,
					message: 'Preference saved. Content will auto-generate when your monthly usage renews.',
				});
			} catch (error: any) {
				console.error('Error saving continue preference:', error);
				return NextResponse.json(
					{ error: 'Failed to save preference', details: error?.message },
					{ status: 500 }
				);
			}
		}

		// If mode is 'update', proceed with strategy update flow
		const cycleStart = data.monthly_cycle_start
			? new Date(data.monthly_cycle_start)
			: new Date();
		if (Number.isNaN(cycleStart.getTime())) {
			return NextResponse.json(
				{ error: 'Invalid monthly cycle start date' },
				{ status: 400 }
			);
		}

		const cycleLabel = formatCycleLabel(cycleStart);
		const attachments = (data.attachments || []).map((url) => ({ url }));

		const airtablePayload = {
			fields: {
				brand_profile_id: [data.brand_profile_id],
				user_id: user.id,
				cycle_label: cycleLabel,
				monthly_cycle_start: cycleStart.toISOString(),
				objective: data.objective,
				themes_focus: data.themes_focus,
				key_dates: data.key_dates || '',
				feedback_notes: data.feedback_notes || '',
				content_preferences: data.content_preferences || '',
				status: 'Pending',
				attachments: attachments.length ? attachments : undefined,
			},
		};

		const airtableRes = await fetch(`https://api.airtable.com/v0/${BASE_ID}/${TABLE_ID}`, {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${AIRTABLE_TOKEN}`,
				'Content-Type': 'application/json',
			},
			body: JSON.stringify(airtablePayload),
		});

		const airtableResult = await airtableRes.json();

		if (!airtableRes.ok) {
			console.error('Airtable strategy update error:', airtableResult);
			return NextResponse.json(
				{
					error: airtableResult?.error?.message || 'Failed to create strategy update',
					details: airtableResult?.error || airtableResult,
				},
				{ status: 422 }
			);
		}

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

		// Fetch brand_type from Airtable to include in payload
		let brandType = 'company'; // default
		try {
			const brandRes = await fetch(
				`https://api.airtable.com/v0/${BASE_ID}/${BRANDPROFILES_TABLE}/${data.brand_profile_id}`,
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

		const makePayload = {
			mode: 'monthly_update',
			strategy_update_id: airtableResult.id,
			brand_profile_id: data.brand_profile_id,
			user_id: user.id,
			brand_type: brandType, // Include brand type for AI strategy crafting
			monthly: {
				objective: data.objective,
				themes_focus: data.themes_focus,
				key_dates: data.key_dates || '',
				feedback_notes: data.feedback_notes || '',
				content_preferences: data.content_preferences || '',
				monthly_cycle_start: cycleStart.toISOString(),
				cycle_label: cycleLabel,
				attachments: data.attachments || [],
			},
			// Include initial strategy fields as null/empty for consistency (Router will ignore them)
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

		// Trigger Make.com webhook in background (don't wait for completion)
		// Make scenarios can take a long time, so we fire-and-forget
		// The Airtable record is already created, so the strategy update is tracked
		// Use Promise.race with timeout to prevent hanging
		const timeoutPromise = new Promise((_, reject) => {
			setTimeout(() => reject(new Error('Request timeout')), 30000); // 30 second timeout
		});

		console.log('[Monthly Strategy Update] Triggering Make.com webhook:', {
			strategyUpdateId: airtableResult.id,
			brandProfileId: data.brand_profile_id,
			userId: user.id,
			webhookUrl: webhookUrl.substring(0, 50) + '...', // Log partial URL for security
			hasSecret: !!outboundSecret,
			payloadKeys: Object.keys(makePayload),
		});

		// Log the payload structure (without sensitive data)
		console.log('[Monthly Strategy Update] Webhook payload structure:', {
			mode: makePayload.mode,
			strategy_update_id: makePayload.strategy_update_id,
			brand_profile_id: makePayload.brand_profile_id,
			user_id: makePayload.user_id,
			brand_type: makePayload.brand_type,
			monthlyFields: Object.keys(makePayload.monthly || {}),
		});

		console.log('[Monthly Strategy Update] Starting webhook fetch...', {
			strategyUpdateId: airtableResult.id,
			url: webhookUrl.substring(0, 60) + '...',
			headers: Object.keys(headers),
			payloadSize: JSON.stringify(makePayload).length,
		});

		Promise.race([
			fetch(webhookUrl, {
				method: 'POST',
				headers,
				body: JSON.stringify(makePayload),
			}).catch((fetchError) => {
				console.error('[Monthly Strategy Update] Fetch error (before race):', {
					strategyUpdateId: airtableResult.id,
					error: fetchError?.message,
					errorType: fetchError?.name,
					stack: fetchError?.stack?.substring(0, 300),
				});
				throw fetchError;
			}),
			timeoutPromise,
		])
			.then(async (makeRes: any) => {
				console.log('[Monthly Strategy Update] Webhook response received:', {
					strategyUpdateId: airtableResult.id,
					isResponse: makeRes && typeof makeRes.ok === 'boolean',
					status: makeRes?.status,
					ok: makeRes?.ok,
					statusText: makeRes?.statusText,
					type: typeof makeRes,
					constructor: makeRes?.constructor?.name,
				});

				// Check if it's a Response object
				if (makeRes && typeof makeRes.ok === 'boolean') {
					if (!makeRes.ok) {
						const errorText = await makeRes.text().catch(() => 'Unable to read error response');
						console.error('[Monthly Strategy Update] Make.com webhook failed:', {
							strategyUpdateId: airtableResult.id,
							status: makeRes.status,
							statusText: makeRes.statusText,
							error: errorText.substring(0, 500),
							headers: Object.fromEntries(makeRes.headers.entries()),
						});
						// Update Airtable record with error status
						try {
							const updateRes = await fetch(`https://api.airtable.com/v0/${BASE_ID}/${TABLE_ID}/${airtableResult.id}`, {
								method: 'PATCH',
								headers: {
									Authorization: `Bearer ${AIRTABLE_TOKEN}`,
									'Content-Type': 'application/json',
								},
								body: JSON.stringify({
									fields: {
										status: 'Failed',
										error_message: `Make.com webhook failed (${makeRes.status}): ${errorText.substring(0, 200)}`,
									},
								}),
							});
							if (updateRes.ok) {
								console.log('[Monthly Strategy Update] Updated Airtable status to Failed');
							} else {
								console.error('[Monthly Strategy Update] Failed to update Airtable status:', await updateRes.text());
							}
						} catch (updateError) {
							console.error('[Monthly Strategy Update] Exception updating Airtable with error status:', updateError);
						}
					} else {
						const responseText = await makeRes.text().catch(() => '');
						console.log('[Monthly Strategy Update] Make.com webhook triggered successfully:', {
							strategyUpdateId: airtableResult.id,
							status: makeRes.status,
							response: responseText.substring(0, 200),
						});
						// Update Airtable record status to 'Processing' to indicate Make.com received it
						try {
							const updateRes = await fetch(`https://api.airtable.com/v0/${BASE_ID}/${TABLE_ID}/${airtableResult.id}`, {
								method: 'PATCH',
								headers: {
									Authorization: `Bearer ${AIRTABLE_TOKEN}`,
									'Content-Type': 'application/json',
								},
								body: JSON.stringify({
									fields: {
										status: 'Processing', // Indicate that Make.com is processing it
									},
								}),
							});
							if (updateRes.ok) {
								console.log('[Monthly Strategy Update] Updated Airtable status to Processing');
							} else {
								console.error('[Monthly Strategy Update] Failed to update Airtable status to Processing:', await updateRes.text());
							}
						} catch (updateError) {
							console.error('[Monthly Strategy Update] Exception updating Airtable status to Processing:', updateError);
						}
					}
				} else {
					console.error('[Monthly Strategy Update] Unexpected response type:', {
						strategyUpdateId: airtableResult.id,
						responseType: typeof makeRes,
						response: makeRes,
					});
				}
			})
			.catch((error: any) => {
				console.error('[Monthly Strategy Update] Make.com webhook error (network/timeout):', {
					strategyUpdateId: airtableResult.id,
					error: error?.message || 'Unknown error',
					errorType: error?.name,
					errorCode: error?.code,
					stack: error?.stack?.substring(0, 500),
					fullError: JSON.stringify(error, Object.getOwnPropertyNames(error)).substring(0, 500),
				});
				// Update Airtable record with error status
				fetch(`https://api.airtable.com/v0/${BASE_ID}/${TABLE_ID}/${airtableResult.id}`, {
					method: 'PATCH',
					headers: {
						Authorization: `Bearer ${AIRTABLE_TOKEN}`,
						'Content-Type': 'application/json',
					},
					body: JSON.stringify({
						fields: {
							status: 'Failed',
							error_message: `Make.com webhook error: ${error?.message || 'Network/timeout error'}`,
						},
					}),
				})
					.then((updateRes) => {
						if (updateRes.ok) {
							console.log('[Monthly Strategy Update] Updated Airtable status to Failed (from catch)');
						} else {
							console.error('[Monthly Strategy Update] Failed to update Airtable status (from catch):', updateRes.status);
						}
					})
					.catch((updateError) => {
						console.error('[Monthly Strategy Update] Exception updating Airtable with error status (from catch):', updateError);
					});
			});

		// Return success immediately - Make.com will process in background
		// The Airtable record is created, so the strategy update is tracked
		console.log('[Monthly Strategy Update] Successfully created strategy update record:', {
			strategyUpdateId: airtableResult.id,
			brandProfileId: data.brand_profile_id,
			userId: user.id,
			cycleLabel,
		});
		
		return NextResponse.json({ 
			ok: true, 
			strategyUpdateId: airtableResult.id,
			message: 'Strategy update submitted. Your monthly strategy is being generated and will be ready shortly.',
			airtableRecordId: airtableResult.id, // Include for debugging
		});
	} catch (error: any) {
		console.error('monthly-update error:', error);
		if (error instanceof z.ZodError) {
			return NextResponse.json({ error: 'Validation error', details: error.issues }, { status: 400 });
		}
		return NextResponse.json({ error: error?.message || 'Server error' }, { status: 500 });
	}
}
