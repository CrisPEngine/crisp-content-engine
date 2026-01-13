/**
 * GET /api/content-briefs?brand_profile_id=...
 * 
 * Returns content briefs for a brand profile
 * Used by dashboard to show pending briefs and status
 */

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient, type CookieOptions } from '@supabase/ssr';

export const runtime = 'nodejs';

export async function GET(request: Request) {
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

		const { searchParams } = new URL(request.url);
		const brandProfileId = searchParams.get('brand_profile_id');

		if (!brandProfileId) {
			return NextResponse.json({ error: 'Missing brand_profile_id' }, { status: 400 });
		}

		const AIRTABLE_TOKEN = process.env.AIRTABLE_PAT;
		const BASE_ID = process.env.AIRTABLE_BASE_ID;
		const CONTENTBRIEFS_TABLE = process.env.AIRTABLE_STRATEGYUPDATES_TABLE; // Reusing StrategyUpdates table

		if (!AIRTABLE_TOKEN || !BASE_ID || !CONTENTBRIEFS_TABLE) {
			return NextResponse.json(
				{ error: 'Airtable configuration missing' },
				{ status: 500 }
			);
		}

		// Fetch all briefs for this user, then filter by brand_profile_id in code
		// This approach is more reliable than filtering link fields in Airtable formula
		const url = new URL(`https://api.airtable.com/v0/${BASE_ID}/${CONTENTBRIEFS_TABLE}`);
		url.searchParams.set('filterByFormula', `{user_id} = "${user.id}"`);
		url.searchParams.set('sort[0][field]', 'submitted_at');
		url.searchParams.set('sort[0][direction]', 'desc');
		url.searchParams.set('maxRecords', '50'); // Get more records to filter in code
		// Don't use returnFieldsByFieldId - we're using field names

		const airtableRes = await fetch(url.toString(), {
			headers: {
				Authorization: `Bearer ${AIRTABLE_TOKEN}`,
				'Content-Type': 'application/json',
			},
		});

		if (!airtableRes.ok) {
			const errorText = await airtableRes.text();
			console.error('Failed to fetch content briefs:', errorText);
			return NextResponse.json(
				{ error: 'Failed to fetch content briefs' },
				{ status: 502 }
			);
		}

		const airtableResult = await airtableRes.json();

		console.log(`[Content Briefs API] Found ${airtableResult.records?.length || 0} total briefs for user ${user.id}`);

		// Filter by brand_profile_id in code (more reliable than Airtable formula for link fields)
		const filteredRecords = (airtableResult.records || []).filter((record: any) => {
			const fields = record.fields || {};
			const recordBrandId = Array.isArray(fields.brand_profile_id) 
				? (typeof fields.brand_profile_id[0] === 'string' 
					? fields.brand_profile_id[0] 
					: fields.brand_profile_id[0]?.id)
				: (typeof fields.brand_profile_id === 'string' 
					? fields.brand_profile_id 
					: fields.brand_profile_id?.id);
			
			const matches = recordBrandId === brandProfileId;
			if (!matches && airtableResult.records?.length > 0) {
				console.log(`[Content Briefs API] Filtering out brief ${record.id}: brand_profile_id=${JSON.stringify(recordBrandId)} !== ${brandProfileId}`);
			}
			return matches;
		});

		console.log(`[Content Briefs API] After filtering by brand ${brandProfileId}: ${filteredRecords.length} briefs`);

		// Map to cleaner format
		// Fields are keyed by field names (not field IDs) since we didn't use returnFieldsByFieldId
		const briefs = filteredRecords.map((record: any) => {
			const fields = record.fields || {};
			
			// Extract brand_profile_id (could be array from link field)
			let brandProfileId: string | null = null;
			if (fields.brand_profile_id) {
				if (Array.isArray(fields.brand_profile_id)) {
					brandProfileId = typeof fields.brand_profile_id[0] === 'string'
						? fields.brand_profile_id[0]
						: fields.brand_profile_id[0]?.id || null;
				} else if (typeof fields.brand_profile_id === 'string') {
					brandProfileId = fields.brand_profile_id;
				} else if (fields.brand_profile_id?.id) {
					brandProfileId = fields.brand_profile_id.id;
				}
			}

			// Handle cycle_start_date - check both field ID (fldiOJywhukr8acuF) and field name
			const cycleStartDate = fields['fldiOJywhukr8acuF'] || fields.cycle_start_date || '';

			// Format result_payload JSON for display
			let resultPayloadFormatted = null;
			if (fields.result_payload) {
				try {
					const payload = typeof fields.result_payload === 'string' 
						? JSON.parse(fields.result_payload) 
						: fields.result_payload;
					
					// Extract key information for display
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
						// Fallback: just stringify the whole payload
						resultPayloadFormatted = JSON.stringify(payload, null, 2);
					}
				} catch (error) {
					// If parsing fails, use the raw string
					resultPayloadFormatted = typeof fields.result_payload === 'string' 
						? fields.result_payload 
						: JSON.stringify(fields.result_payload);
				}
			}

			return {
				id: record.id,
				brand_profile_id: brandProfileId,
				user_id: fields.user_id || null,
				brief_mode: fields.brief_mode || 'continue',
				cycle_start_date: cycleStartDate,
				cycle_label: fields.cycle_label || '',
				objective: fields.objective || '',
				themes_focus: fields.themes_focus || '',
				status: fields.status || 'Draft',
				submitted_at: fields.submitted_at || null,
				approved_at: fields.approved_at || null,
				sent_to_make_at: fields.sent_to_make_at || null,
				generation_completed_at: fields.generation_completed_at || null,
				last_error: fields.last_error || null,
				result_payload: fields.result_payload || null,
				result_payload_formatted: resultPayloadFormatted,
			};
		});

		return NextResponse.json({ briefs });
	} catch (error: any) {
		console.error('Error fetching content briefs:', error);
		return NextResponse.json(
			{ error: error?.message || 'Server error' },
			{ status: 500 }
		);
	}
}

