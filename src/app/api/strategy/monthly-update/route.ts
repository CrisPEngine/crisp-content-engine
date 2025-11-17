import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { z } from 'zod';

export const runtime = 'nodejs';

const schema = z.object({
	brand_profile_id: z.string().min(1, 'Select a brand profile'),
	monthly_cycle_start: z.string().optional(),
	objective: z.string().min(5, 'Tell us the objective for this month'),
	themes_focus: z.string().min(5, 'List the priority themes for this cycle'),
	key_dates: z.string().optional().default(''),
	feedback_notes: z.string().optional().default(''),
	content_preferences: z.string().optional().default(''),
	attachments: z.array(z.string().url()).optional().default([]),
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

		if (!AIRTABLE_TOKEN || !BASE_ID || !TABLE_ID) {
			return NextResponse.json(
				{ error: 'Airtable configuration missing. Please contact support.' },
				{ status: 500 }
			);
		}

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
			if (AIRTABLE_TOKEN && BASE_ID && TABLE_ID) {
				const brandRes = await fetch(
					`https://api.airtable.com/v0/${BASE_ID}/${TABLE_ID}/${data.brand_profile_id}`,
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

		const makeRes = await fetch(webhookUrl, {
			method: 'POST',
			headers,
			body: JSON.stringify(makePayload),
		});

		if (!makeRes.ok) {
			const errorText = await makeRes.text();
			console.error('Make monthly update error:', errorText);
			return NextResponse.json(
				{ error: 'Failed to trigger monthly strategy generation', details: errorText },
				{ status: 502 }
			);
		}

		return NextResponse.json({ ok: true, strategyUpdateId: airtableResult.id });
	} catch (error: any) {
		console.error('monthly-update error:', error);
		if (error instanceof z.ZodError) {
			return NextResponse.json({ error: 'Validation error', details: error.issues }, { status: 400 });
		}
		return NextResponse.json({ error: error?.message || 'Server error' }, { status: 500 });
	}
}
