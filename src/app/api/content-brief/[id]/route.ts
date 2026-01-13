/**
 * GET /api/content-brief/:id
 * PATCH /api/content-brief/:id
 * 
 * Fetches or updates a single content brief
 */

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient, type CookieOptions } from '@supabase/ssr';

export const runtime = 'nodejs';

const AIRTABLE_TOKEN = process.env.AIRTABLE_PAT;
const BASE_ID = process.env.AIRTABLE_BASE_ID;
const CONTENTBRIEFS_TABLE = process.env.AIRTABLE_STRATEGYUPDATES_TABLE;

export async function GET(
	request: Request,
	context: { params: Promise<{ id: string }> }
) {
	try {
		const { id: briefId } = await context.params;

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

		if (!AIRTABLE_TOKEN || !BASE_ID || !CONTENTBRIEFS_TABLE) {
			return NextResponse.json(
				{ error: 'Airtable configuration missing' },
				{ status: 500 }
			);
		}

		// Fetch the brief record
		const briefRes = await fetch(
			`https://api.airtable.com/v0/${BASE_ID}/${CONTENTBRIEFS_TABLE}/${briefId}`,
			{
				headers: {
					Authorization: `Bearer ${AIRTABLE_TOKEN}`,
					'Content-Type': 'application/json',
				},
			}
		);

		if (!briefRes.ok) {
			if (briefRes.status === 404) {
				return NextResponse.json(
					{ error: 'Content brief not found' },
					{ status: 404 }
				);
			}
			const errorText = await briefRes.text();
			console.error('Failed to fetch brief:', errorText);
			return NextResponse.json(
				{ error: 'Failed to fetch content brief' },
				{ status: 502 }
			);
		}

		const briefData = await briefRes.json();
		const fields = briefData.fields || {};

		// Validate ownership
		if (fields.user_id !== user.id) {
			return NextResponse.json(
				{ error: 'Unauthorized - you do not own this brief' },
				{ status: 403 }
			);
		}

		// Extract brand_profile_id (link field can be array or object)
		let brandProfileId: string | null = null;
		if (fields.brand_profile_id) {
			if (Array.isArray(fields.brand_profile_id)) {
				brandProfileId = typeof fields.brand_profile_id[0] === 'string'
					? fields.brand_profile_id[0]
					: fields.brand_profile_id[0]?.id;
			} else if (typeof fields.brand_profile_id === 'string') {
				brandProfileId = fields.brand_profile_id;
			} else {
				brandProfileId = fields.brand_profile_id?.id;
			}
		}

		// Handle cycle_start_date field ID (fldiOJywhukr8acuF)
		const cycleStartDate = fields['fldiOJywhukr8acuF'] || fields.cycle_start_date || '';

		// Format result_payload JSON for display
		let resultPayloadFormatted = null;
		if (fields.result_payload) {
			try {
				const payload = typeof fields.result_payload === 'string' 
					? JSON.parse(fields.result_payload) 
					: fields.result_payload;
				
				const monthlyStrategy = payload?.monthly_strategy;
				if (monthlyStrategy) {
					const lines: string[] = [];
					if (monthlyStrategy.objective) {
						lines.push(`Objective: ${monthlyStrategy.objective}`);
					}
					if (monthlyStrategy.themes && Array.isArray(monthlyStrategy.themes)) {
						lines.push(`Themes: ${monthlyStrategy.themes.join(', ')}`);
					}
					if (monthlyStrategy.core_messaging) {
						lines.push(`Core Messaging: ${monthlyStrategy.core_messaging}`);
					}
					if (monthlyStrategy.pillars && Array.isArray(monthlyStrategy.pillars)) {
						lines.push(`\nContent Pillars:`);
						monthlyStrategy.pillars.forEach((pillar: any, index: number) => {
							if (pillar.name) {
								lines.push(`${index + 1}. ${pillar.name}`);
								if (pillar.why) {
									lines.push(`   ${pillar.why}`);
								}
							}
						});
					}
					resultPayloadFormatted = lines.join('\n');
				} else {
					resultPayloadFormatted = JSON.stringify(payload, null, 2);
				}
			} catch (error) {
				resultPayloadFormatted = typeof fields.result_payload === 'string' 
					? fields.result_payload 
					: JSON.stringify(fields.result_payload);
			}
		}

		return NextResponse.json({
			id: briefData.id,
			brand_profile_id: brandProfileId,
			user_id: fields.user_id || null,
			brief_mode: fields.brief_mode || 'continue',
			cycle_start_date: cycleStartDate,
			cycle_label: fields.cycle_label || '',
			objective: fields.objective || '',
			themes_focus: fields.themes_focus || '',
			key_dates: fields.key_dates || '',
			feedback_notes: fields.feedback_notes || '',
			content_preferences: fields.content_preferences || '',
			primary_goal: fields.primary_goal || '',
			success_metric: fields.success_metric || '',
			cta: fields.cta || '',
			cta_link: fields.cta_link || '',
			offers_to_push: fields.offers_to_push || '',
			topics_to_avoid_this_month: fields.topics_to_avoid_this_month || '',
			competitor_or_inspo_links: fields.competitor_or_inspo_links || '',
			status: fields.status || 'Draft',
			submitted_at: fields.submitted_at || null,
			approved_at: fields.approved_at || null,
			sent_to_make_at: fields.sent_to_make_at || null,
			generation_completed_at: fields.generation_completed_at || null,
			last_error: fields.last_error || null,
			result_payload: fields.result_payload || null,
			result_payload_formatted: resultPayloadFormatted,
			result_payload_display: fields.result_payload_display || null,
			// Include snapshots for reference
			strategy_snapshot_json: fields.strategy_snapshot_json || null,
			brief_snapshot_json: fields.brief_snapshot_json || null,
		});
	} catch (error: any) {
		console.error('Error fetching content brief:', error);
		return NextResponse.json(
			{ error: error?.message || 'Server error' },
			{ status: 500 }
		);
	}
}

export async function PATCH(
	request: Request,
	context: { params: Promise<{ id: string }> }
) {
	try {
		const { id: briefId } = await context.params;

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

		if (!AIRTABLE_TOKEN || !BASE_ID || !CONTENTBRIEFS_TABLE) {
			return NextResponse.json(
				{ error: 'Airtable configuration missing' },
				{ status: 500 }
			);
		}

		const body = await request.json();
		const { objective, themes_focus, key_dates, feedback_notes, content_preferences, primary_goal, success_metric, cta, cta_link, offers_to_push, topics_to_avoid_this_month, competitor_or_inspo_links } = body;

		// First, verify ownership
		const briefRes = await fetch(
			`https://api.airtable.com/v0/${BASE_ID}/${CONTENTBRIEFS_TABLE}/${briefId}`,
			{
				headers: {
					Authorization: `Bearer ${AIRTABLE_TOKEN}`,
					'Content-Type': 'application/json',
				},
			}
		);

		if (!briefRes.ok) {
			if (briefRes.status === 404) {
				return NextResponse.json(
					{ error: 'Content brief not found' },
					{ status: 404 }
				);
			}
			return NextResponse.json(
				{ error: 'Failed to fetch brief' },
				{ status: 502 }
			);
		}

		const briefData = await briefRes.json();
		const fields = briefData.fields || {};

		if (fields.user_id !== user.id) {
			return NextResponse.json(
				{ error: 'Unauthorized - you do not own this brief' },
				{ status: 403 }
			);
		}

		// Only allow editing if status is "Pending Approval" or "Draft"
		if (fields.status !== 'Pending Approval' && fields.status !== 'Draft') {
			return NextResponse.json(
				{ error: `Cannot edit brief with status: ${fields.status}. Only briefs with status "Pending Approval" or "Draft" can be edited.` },
				{ status: 400 }
			);
		}

		// Build update payload (only include fields that are provided)
		const updateFields: any = {};
		if (objective !== undefined) updateFields.objective = objective;
		if (themes_focus !== undefined) updateFields.themes_focus = themes_focus;
		if (key_dates !== undefined) updateFields.key_dates = key_dates;
		if (feedback_notes !== undefined) updateFields.feedback_notes = feedback_notes;
		if (content_preferences !== undefined) updateFields.content_preferences = content_preferences;
		if (primary_goal !== undefined) updateFields.primary_goal = primary_goal;
		if (success_metric !== undefined) updateFields.success_metric = success_metric;
		if (cta !== undefined) updateFields.cta = cta;
		if (cta_link !== undefined) updateFields.cta_link = cta_link;
		if (offers_to_push !== undefined) updateFields.offers_to_push = offers_to_push;
		if (topics_to_avoid_this_month !== undefined) updateFields.topics_to_avoid_this_month = topics_to_avoid_this_month;
		if (competitor_or_inspo_links !== undefined) updateFields.competitor_or_inspo_links = competitor_or_inspo_links;

		// Update the brief
		const updateRes = await fetch(
			`https://api.airtable.com/v0/${BASE_ID}/${CONTENTBRIEFS_TABLE}/${briefId}`,
			{
				method: 'PATCH',
				headers: {
					Authorization: `Bearer ${AIRTABLE_TOKEN}`,
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({
					fields: updateFields,
				}),
			}
		);

		if (!updateRes.ok) {
			const errorText = await updateRes.text();
			console.error('Failed to update brief:', errorText);
			return NextResponse.json(
				{ error: 'Failed to update content brief' },
				{ status: 502 }
			);
		}

		const updatedData = await updateRes.json();
		const updatedFields = updatedData.fields || {};

		// Extract brand_profile_id
		let brandProfileId: string | null = null;
		if (updatedFields.brand_profile_id) {
			if (Array.isArray(updatedFields.brand_profile_id)) {
				brandProfileId = typeof updatedFields.brand_profile_id[0] === 'string'
					? updatedFields.brand_profile_id[0]
					: updatedFields.brand_profile_id[0]?.id;
			} else if (typeof updatedFields.brand_profile_id === 'string') {
				brandProfileId = updatedFields.brand_profile_id;
			} else {
				brandProfileId = updatedFields.brand_profile_id?.id;
			}
		}

		const cycleStartDate = updatedFields['fldiOJywhukr8acuF'] || updatedFields.cycle_start_date || '';

		return NextResponse.json({
			id: updatedData.id,
			brand_profile_id: brandProfileId,
			user_id: updatedFields.user_id || null,
			brief_mode: updatedFields.brief_mode || 'continue',
			cycle_start_date: cycleStartDate,
			cycle_label: updatedFields.cycle_label || '',
			objective: updatedFields.objective || '',
			themes_focus: updatedFields.themes_focus || '',
			key_dates: updatedFields.key_dates || '',
			feedback_notes: updatedFields.feedback_notes || '',
			content_preferences: updatedFields.content_preferences || '',
			primary_goal: updatedFields.primary_goal || '',
			success_metric: updatedFields.success_metric || '',
			cta: updatedFields.cta || '',
			cta_link: updatedFields.cta_link || '',
			offers_to_push: updatedFields.offers_to_push || '',
			topics_to_avoid_this_month: updatedFields.topics_to_avoid_this_month || '',
			competitor_or_inspo_links: updatedFields.competitor_or_inspo_links || '',
			status: updatedFields.status || 'Draft',
			submitted_at: updatedFields.submitted_at || null,
			approved_at: updatedFields.approved_at || null,
			sent_to_make_at: updatedFields.sent_to_make_at || null,
			generation_completed_at: updatedFields.generation_completed_at || null,
			last_error: updatedFields.last_error || null,
		});
	} catch (error: any) {
		console.error('Error updating content brief:', error);
		return NextResponse.json(
			{ error: error?.message || 'Server error' },
			{ status: 500 }
		);
	}
}

