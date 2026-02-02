import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { getSupabaseService } from '@/lib/supabaseService';

export const runtime = 'nodejs';

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
	try {
		const { id: brandProfileId } = await context.params;
		const body = await request.json().catch(() => ({}));
		const strategyContent = body?.strategy_content || body?.content || '';

		// Authenticate user
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

		const admin = getSupabaseService();

		// User plan: Creator tier uses Creator Make scenario; other tiers use multichannel Make scenario
		const { data: subscription } = await supabase
			.from('subscriptions')
			.select('plan')
			.eq('user_id', user.id)
			.maybeSingle();
		const plan = (subscription?.plan as 'creator' | 'growth' | 'pro' | 'scale') || 'creator';

		// Check if LinkedIn is connected (personal or business)
		const { data: linkedInConnections } = await admin
			.from('social_connections')
			.select('person_urn, organization_urn, connection_type, brand_profile_id')
			.eq('user_id', user.id)
			.eq('provider', 'linkedin');

		if (!linkedInConnections || linkedInConnections.length === 0) {
			return NextResponse.json(
				{ error: 'LinkedIn not connected. Please connect your LinkedIn account first.', requiresConnection: true },
				{ status: 400 }
			);
		}

		// Get the brand profile to determine if we need personal or business connection
		const AIRTABLE_TOKEN = process.env.AIRTABLE_PAT;
		const BASE_ID = process.env.AIRTABLE_BASE_ID;
		const TABLE_ID = process.env.AIRTABLE_BRANDPROFILES_TABLE;
		
		let brandType = 'company';
		let linkedInConnection: any = null;
		
		if (AIRTABLE_TOKEN && BASE_ID && TABLE_ID) {
			try {
				const brandRes = await fetch(`https://api.airtable.com/v0/${BASE_ID}/${TABLE_ID}/${brandProfileId}`, {
					method: 'GET',
					headers: {
						Authorization: `Bearer ${AIRTABLE_TOKEN}`,
						'Content-Type': 'application/json',
					},
				});
				
				if (brandRes.ok) {
					const brandRecord = await brandRes.json();
					brandType = brandRecord.fields?.brand_type || 'company';
					
					// Find the appropriate LinkedIn connection for this brand
					// For company brands, prefer business connections; for personal, prefer personal connections
					if (brandType === 'company') {
						// Prefer business connection (organization) assigned to this brand, or any business connection
						linkedInConnection = linkedInConnections.find(
							(conn: any) => conn.connection_type === 'organization' && 
								(conn.brand_profile_id === brandProfileId || !conn.brand_profile_id)
						) || linkedInConnections.find((conn: any) => conn.connection_type === 'organization');
						
						// Fallback to any LinkedIn connection if no business connection found
						if (!linkedInConnection) {
							linkedInConnection = linkedInConnections[0];
						}
					} else {
						// For personal brands, prefer personal connection assigned to this brand, or any personal connection
						linkedInConnection = linkedInConnections.find(
							(conn: any) => conn.connection_type === 'member' && 
								(conn.brand_profile_id === brandProfileId || !conn.brand_profile_id)
						) || linkedInConnections.find((conn: any) => conn.connection_type === 'member');
						
						// Fallback to any LinkedIn connection if no personal connection found
						if (!linkedInConnection) {
							linkedInConnection = linkedInConnections[0];
						}
					}
				}
			} catch (error) {
				console.warn('Failed to fetch brand profile for connection matching:', error);
				// Fallback to first available connection
				linkedInConnection = linkedInConnections[0];
			}
		} else {
			// If we can't fetch brand type, just use the first connection
			linkedInConnection = linkedInConnections[0];
		}

		if (!linkedInConnection) {
			return NextResponse.json(
				{ error: 'LinkedIn not connected. Please connect your LinkedIn account first.', requiresConnection: true },
				{ status: 400 }
			);
		}

		// Update strategy status in Airtable
		// AIRTABLE_TOKEN, BASE_ID, and TABLE_ID are already defined above

		if (!AIRTABLE_TOKEN || !BASE_ID || !TABLE_ID) {
			return NextResponse.json(
				{ error: 'Airtable configuration missing' },
				{ status: 500 }
			);
		}

		// Update strategy status to "Strategy Approved"
		// Note: strategy_approved_at is optional - only include if field exists in Airtable
		const updateFields: Record<string, any> = {
			status: 'Strategy Approved',
			// If strategy content was edited, update strategy_summary (not strategy_json - that's the source of truth)
			...(strategyContent && { strategy_summary: String(strategyContent) }),
		};
		
		// Only include strategy_approved_at if you've added this field to Airtable
		// Uncomment the line below after adding the field:
		// updateFields.strategy_approved_at = new Date().toISOString();
		
		const updateRes = await fetch(`https://api.airtable.com/v0/${BASE_ID}/${TABLE_ID}/${brandProfileId}`, {
			method: 'PATCH',
			headers: {
				Authorization: `Bearer ${AIRTABLE_TOKEN}`,
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				fields: updateFields,
			}),
		});

		if (!updateRes.ok) {
			const errorText = await updateRes.text();
			let errorData: any = {};
			try {
				errorData = JSON.parse(errorText);
			} catch {
				errorData = { message: errorText };
			}
			
			console.error('Airtable strategy approval update failed:', errorData);
			
			// Provide more specific error messages
			const errorMessage = errorData?.error?.message || errorData?.message || 'Failed to update strategy status';
			const isFieldError = errorData?.error?.type === 'INVALID_VALUE_FOR_COLUMN' || errorData?.error?.type === 'UNKNOWN_FIELD_NAME';
			
			return NextResponse.json(
				{ 
					error: errorMessage,
					details: errorData,
					isFieldError,
					hint: isFieldError 
						? 'Please check that the "status" field in Airtable has "Strategy Approved" as an option, and that "strategy_approved_at" field exists.'
						: undefined,
				},
				{ status: 502 }
			);
		}

		// Fetch brand profile details for content generation (if not already fetched)
		let strategyJson = null;
		let strategySummary = null;
		if (AIRTABLE_TOKEN && BASE_ID && TABLE_ID) {
			try {
				const brandRes = await fetch(`https://api.airtable.com/v0/${BASE_ID}/${TABLE_ID}/${brandProfileId}`, {
					method: 'GET',
					headers: {
						Authorization: `Bearer ${AIRTABLE_TOKEN}`,
						'Content-Type': 'application/json',
					},
				});
				
				if (brandRes.ok) {
					const brandRecord = await brandRes.json();
					// brandType already set above
					strategyJson = brandRecord.fields?.strategy_json || null;
					strategySummary = brandRecord.fields?.strategy_summary || null;
				}
			} catch (error) {
				console.warn('Failed to fetch brand profile details:', error);
			}
		}

		// Require strategy content before triggering content generation
		const hasStrategyContent =
			(strategySummary && String(strategySummary).trim().length > 50) ||
			(strategyJson && (typeof strategyJson === 'string' ? strategyJson.trim().length > 20 : Object.keys(strategyJson).length > 0));
		if (!hasStrategyContent) {
			return NextResponse.json(
				{
					error: 'Strategy content is not ready yet. Our AI is still generating your strategy. Please wait a minute or two and refresh the page, then try approving again.',
					hint: 'If the strategy page shows "Strategy Ready" but no content, the strategy callback from Make may not have included the strategy. Check that your Make strategy scenario sends strategy_update_id, strategy_payload or strategy_summary in the webhook callback.',
				},
				{ status: 400 }
			);
		}

		// Trigger content generation: Creator tier → Creator Make scenario; other tiers → multichannel Make scenario
		if (plan === 'creator') {
			// Creator tier: call Creator Make scenario (MAKE_CONTENT_GENERATION_WEBHOOK_URL)
			const MAKE_CONTENT_WEBHOOK_URL = process.env.MAKE_CONTENT_GENERATION_WEBHOOK_URL;
			if (MAKE_CONTENT_WEBHOOK_URL) {
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
						strategy_summary: strategySummary,
						triggered_at: new Date().toISOString(),
					};
					const webhookRes = await fetch(MAKE_CONTENT_WEBHOOK_URL, {
						method: 'POST',
						headers: {
							'Content-Type': 'application/json',
							...(process.env.MAKE_API_KEY && { 'x-api-key': process.env.MAKE_API_KEY }),
							...(process.env.MAKE_CONTENT_WEBHOOK_SECRET || process.env.MAKE_SHARED_SECRET ? {
								'x-make-secret': process.env.MAKE_CONTENT_WEBHOOK_SECRET || process.env.MAKE_SHARED_SECRET,
							} : {}),
						},
						body: JSON.stringify(contentPayload),
					});
					if (!webhookRes.ok) {
						const errorText = await webhookRes.text();
						console.error('Make content generation webhook failed:', {
							status: webhookRes.status,
							error: errorText,
							payload: contentPayload,
						});
					} else {
						console.log('Content generation webhook triggered successfully (Creator tier)');
					}
				} catch (webhookError: any) {
					console.error('Make content generation webhook error:', webhookError);
				}
			} else {
				console.warn('MAKE_CONTENT_GENERATION_WEBHOOK_URL is not configured. Strategy approved but Creator content webhook was not triggered.');
			}
		} else {
			// Growth / Pro / Scale: use multichannel Make scenario via POST /api/content/generate
			const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
			const cookieHeader = request.headers.get('cookie') || '';
			// Default channels for first content after strategy approval (LinkedIn + Blog)
			const defaultChannels = [
				{ platform: 'LinkedIn' as const, count: 2 },
				{ platform: 'Blog' as const, count: 1 },
			];
			try {
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
					console.error('Multichannel content generation (post-approve) failed:', {
						status: genRes.status,
						error: genData?.error,
						plan,
					});
				} else {
					console.log('Content generation webhook triggered successfully (multichannel tier)', {
						plan,
						generation_job_id: genData?.generation_job_id,
					});
				}
			} catch (err: any) {
				console.error('Multichannel content generation (post-approve) error:', err?.message || err);
			}
		}

		return NextResponse.json({
			ok: true,
			message: 'Strategy approved. Content generation started.',
		});
	} catch (error: any) {
		console.error('Strategy approval error:', error);
		return NextResponse.json(
			{ error: error?.message || 'Server error' },
			{ status: 500 }
		);
	}
}

