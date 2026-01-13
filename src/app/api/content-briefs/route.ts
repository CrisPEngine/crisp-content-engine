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

		// Fetch briefs for this brand profile
		// Use returnFieldsByFieldId=true to get responses keyed by field IDs (more stable)
		const url = new URL(`https://api.airtable.com/v0/${BASE_ID}/${CONTENTBRIEFS_TABLE}`);
		const filterFormula = `AND(FIND("${brandProfileId}", {brand_profile_id}), {user_id} = "${user.id}")`;
		url.searchParams.set('filterByFormula', filterFormula);
		url.searchParams.set('sort[0][field]', 'submitted_at');
		url.searchParams.set('sort[0][direction]', 'desc');
		url.searchParams.set('maxRecords', '20'); // Get last 20 briefs
		url.searchParams.set('returnFieldsByFieldId', 'true'); // Get responses keyed by field IDs

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

		console.log(`[Content Briefs API] Found ${airtableResult.records?.length || 0} records for brand ${brandProfileId}, user ${user.id}`);

		// Map to cleaner format
		// Note: With returnFieldsByFieldId=true, fields are keyed by field IDs
		// We need to handle both field IDs and field names for compatibility
		const briefs = (airtableResult.records || []).map((record: any) => {
			const fields = record.fields || {};
			
			// Extract brand_profile_id (could be array from link field)
			let brandProfileId: string | null = null;
			if (fields.brand_profile_id) {
				if (Array.isArray(fields.brand_profile_id)) {
					brandProfileId = fields.brand_profile_id[0] || null;
				} else if (typeof fields.brand_profile_id === 'string') {
					brandProfileId = fields.brand_profile_id;
				}
			}

			// Handle cycle_start_date - it's stored with field ID fldiOJywhukr8acuF
			// But also check by field name for backward compatibility
			const cycleStartDate = fields['fldiOJywhukr8acuF'] || fields.cycle_start_date || '';

			return {
				id: record.id,
				brand_profile_id: brandProfileId,
				user_id: fields.user_id,
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

