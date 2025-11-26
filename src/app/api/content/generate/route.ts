import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { enforceCaps } from '@/lib/enforceCaps';
import dayjs from 'dayjs';

export const runtime = 'nodejs';

/**
 * Generate more content for a brand
 * POST /api/content/generate
 * Body: { brandProfileId: string, platform: string, strategyId?: string }
 */
export async function POST(req: Request) {
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

		const { data: { user }, error: userError } = await supabase.auth.getUser();
		if (userError || !user) {
			return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
		}

		const body = await req.json().catch(() => ({}));
		const { brandProfileId, platform, strategyId } = body;

		if (!brandProfileId || !platform) {
			return NextResponse.json(
				{ error: 'Missing required fields: brandProfileId and platform are required' },
				{ status: 400 }
			);
		}

		// Get user's plan and usage
		const { data: subscription } = await supabase
			.from('subscriptions')
			.select('plan')
			.eq('user_id', user.id)
			.maybeSingle();

		const plan = (subscription?.plan as 'creator' | 'growth' | 'pro' | 'scale') || 'creator';

		// Get current usage from usage_posts table
		const ym = dayjs().format('YYYY-MM');
		const { data: usage } = await supabase
			.from('usage_posts')
			.select('posts')
			.eq('user_id', user.id)
			.eq('year_month', ym)
			.maybeSingle();

		const mtdPostCount = usage?.posts || 0;

		// Check usage limits using enforceCaps
		const capsCheck = await enforceCaps(user.id);
		if (!capsCheck.ok) {
			return NextResponse.json(
				{ error: capsCheck.reason || 'Post limit reached. Upgrade to generate more content.' },
				{ status: 403 }
			);
		}

		// Verify user owns this brand profile
		const AIRTABLE_TOKEN = process.env.AIRTABLE_PAT;
		const BASE_ID = process.env.AIRTABLE_BASE_ID;
		const BRANDPROFILES_TABLE = process.env.AIRTABLE_BRANDPROFILES_TABLE;

		if (!AIRTABLE_TOKEN || !BASE_ID || !BRANDPROFILES_TABLE) {
			return NextResponse.json(
				{ error: 'Airtable configuration missing' },
				{ status: 500 }
			);
		}

		// Fetch brand profile to verify ownership and get strategy data
		const brandUrl = `https://api.airtable.com/v0/${BASE_ID}/${BRANDPROFILES_TABLE}/${brandProfileId}`;
		const brandRes = await fetch(brandUrl, {
			headers: {
				Authorization: `Bearer ${AIRTABLE_TOKEN}`,
				'Content-Type': 'application/json',
			},
		});

		if (!brandRes.ok) {
			return NextResponse.json(
				{ error: 'Brand profile not found' },
				{ status: 404 }
			);
		}

		const brandData = await brandRes.json();
		const brandFields = brandData.fields || {};

		// Verify ownership
		if (brandFields.user_id !== user.id) {
			return NextResponse.json(
				{ error: 'Unauthorized: You do not own this brand profile' },
				{ status: 403 }
			);
		}

		// Get strategy data (use strategyId if provided, otherwise use the brand's approved strategy)
		// Note: Airtable stores strategy as 'strategy_json', but some older records may have 'strategy_payload'
		let strategyJson = null;
		let strategySummary = brandFields.strategy_summary || '';
		let brandType = brandFields.brand_type || 'company';

		if (strategyId) {
			// Fetch specific strategy if provided
			const STRATEGY_TABLE = process.env.AIRTABLE_STRATEGY_TABLE;
			if (STRATEGY_TABLE) {
				try {
					const strategyUrl = `https://api.airtable.com/v0/${BASE_ID}/${STRATEGY_TABLE}/${strategyId}`;
					const strategyRes = await fetch(strategyUrl, {
						headers: {
							Authorization: `Bearer ${AIRTABLE_TOKEN}`,
							'Content-Type': 'application/json',
						},
					});
					if (strategyRes.ok) {
						const strategyData = await strategyRes.json();
						// Check both field names for compatibility
						strategyJson = strategyData.fields?.strategy_json || strategyData.fields?.strategy_payload;
						strategySummary = strategyData.fields?.strategy_summary || strategySummary;
					}
				} catch (error) {
					console.warn('Failed to fetch strategy, using brand profile strategy:', error);
				}
			}
		}

		// Use brand's strategy if no strategyId provided
		// Check both 'strategy_json' (current field name) and 'strategy_payload' (legacy field name)
		if (!strategyJson) {
			strategyJson = brandFields.strategy_json || brandFields.strategy_payload;
		}

		if (!strategyJson) {
			return NextResponse.json(
				{ error: 'No strategy found for this brand. Please approve a strategy first.' },
				{ status: 400 }
			);
		}

		// Get LinkedIn connection for person_urn
		const { data: linkedInConnection } = await supabase
			.from('social_connections')
			.select('person_urn')
			.eq('user_id', user.id)
			.eq('provider', 'linkedin')
			.maybeSingle();

		// Determine which webhook to use based on plan
		// For now, use creator webhook for all plans (as per user's request)
		// In the future, this can be expanded to use different webhooks per plan
		let webhookUrl = process.env.MAKE_CONTENT_GENERATION_WEBHOOK_URL;
		
		// Future: Add plan-specific webhooks
		// if (plan === 'creator') {
		//   webhookUrl = process.env.MAKE_CREATOR_CONTENT_WEBHOOK_URL;
		// } else if (plan === 'growth') {
		//   webhookUrl = process.env.MAKE_GROWTH_CONTENT_WEBHOOK_URL;
		// } else if (plan === 'pro') {
		//   webhookUrl = process.env.MAKE_PRO_CONTENT_WEBHOOK_URL;
		// } else if (plan === 'scale') {
		//   webhookUrl = process.env.MAKE_SCALE_CONTENT_WEBHOOK_URL;
		// }

		if (!webhookUrl) {
			return NextResponse.json(
				{ error: 'Content generation webhook not configured' },
				{ status: 500 }
			);
		}

		// Prepare payload for Make webhook
		const contentPayload = {
			brand_profile_id: brandProfileId,
			user_id: user.id,
			person_urn: linkedInConnection?.person_urn || null,
			brand_type: brandType,
			platform: platform, // LinkedIn, X, Instagram, etc.
			strategy_json: strategyJson,
			strategy_summary: strategySummary,
			triggered_at: new Date().toISOString(),
			trigger_type: 'manual', // Indicates this was manually triggered by user
		};

		// Call Make webhook
		const webhookRes = await fetch(webhookUrl, {
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
			console.error('Make content generation webhook failed:', {
				status: webhookRes.status,
				statusText: webhookRes.statusText,
				error: errorText,
				payload: contentPayload,
			});
			return NextResponse.json(
				{ error: `Content generation failed: ${errorText}` },
				{ status: 502 }
			);
		}

		return NextResponse.json({
			ok: true,
			message: 'Content generation started. New content will appear in your approval queue shortly.',
		});
	} catch (error: any) {
		console.error('Content generation error:', error);
		return NextResponse.json(
			{ error: error?.message || 'Failed to generate content' },
			{ status: 500 }
		);
	}
}

