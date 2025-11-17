import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient, type CookieOptions } from '@supabase/ssr';

export const runtime = 'nodejs';

const mapStatuses = (stage: string | null, statusParam: string | null) => {
	if (statusParam) {
		return statusParam
			.split(',')
			.map((value) => value.trim())
			.filter(Boolean);
	}

	switch (stage) {
		case 'approval':
			return ['Needs Approval', 'Needs Copy', 'Needs Review'];
		case 'schedule':
			return ['Scheduled', 'Ready To Publish', 'Published', 'Failed'];
		default:
			return undefined;
	}
};

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

		const AIRTABLE_TOKEN = process.env.AIRTABLE_PAT;
		const BASE_ID = process.env.AIRTABLE_BASE_ID;
		const TABLE_ID = process.env.AIRTABLE_CONTENTQUEUE_TABLE;
		const BRANDPROFILES_TABLE = process.env.AIRTABLE_BRANDPROFILES_TABLE;

		if (!AIRTABLE_TOKEN || !BASE_ID || !TABLE_ID || !BRANDPROFILES_TABLE) {
			return NextResponse.json(
				{ error: 'Airtable configuration missing. Please contact support.' },
				{ status: 500 }
			);
		}

		// First, fetch all brand profiles for this user to get their record IDs
		// ContentQueue doesn't have user_id, so we filter through brand_profile_id
		const brandProfilesUrl = new URL(`https://api.airtable.com/v0/${BASE_ID}/${BRANDPROFILES_TABLE}`);
		brandProfilesUrl.searchParams.set('filterByFormula', `{user_id} = "${user.id}"`);
		brandProfilesUrl.searchParams.set('maxRecords', '100'); // Reasonable limit

		const brandProfilesRes = await fetch(brandProfilesUrl.toString(), {
			headers: {
				Authorization: `Bearer ${AIRTABLE_TOKEN}`,
				'Content-Type': 'application/json',
			},
		});

		let brandProfileIds: string[] = [];
		if (brandProfilesRes.ok) {
			const brandProfilesData = await brandProfilesRes.json();
			brandProfileIds = (brandProfilesData.records || []).map((r: any) => r.id);
		} else {
			const errorText = await brandProfilesRes.text();
			console.warn('Failed to fetch brand profiles for user filtering:', errorText);
		}

		const url = new URL(`https://api.airtable.com/v0/${BASE_ID}/${TABLE_ID}`);
		const { searchParams } = new URL(request.url);
		const stage = searchParams.get('stage');
		const statusParam = searchParams.get('status');
		const statuses = mapStatuses(stage, statusParam);

		// Note: brand_profile_id field may not exist in ContentQueue yet
		// We'll filter by status only in Airtable, then filter by brand_profile_id in code
		const filters: string[] = [];
		if (statuses && statuses.length > 0) {
			const statusFormula =
				statuses.length === 1
					? `{status} = "${statuses[0]}"`
					: `OR(${statuses.map((value) => `{status} = "${value}"`).join(',')})`;
			filters.push(statusFormula);
		}

		// Date filtering - only if scheduled_date field exists in Airtable
		// Note: If scheduled_date doesn't exist, these filters will be skipped
		const fromDate = searchParams.get('from');
		const toDate = searchParams.get('to');
		// Only add date filters if dates are provided (field may not exist yet)
		// Commenting out date filters until scheduled_date field is added to Airtable
		// if (fromDate) {
		// 	filters.push(`IS_AFTER({scheduled_date}, DATETIME_PARSE("${fromDate}", "YYYY-MM-DD"))`);
		// }
		// if (toDate) {
		// 	filters.push(`IS_BEFORE({scheduled_date}, DATEADD(DATETIME_PARSE("${toDate}", "YYYY-MM-DD"), 1, 'day'))`);
		// }

		if (filters.length > 0) {
			url.searchParams.set('filterByFormula', filters.length === 1 ? filters[0] : `AND(${filters.join(',')})`);
		}

		url.searchParams.append('pageSize', '100');
		// Sort by created_time instead of scheduled_date until scheduled_date field is added to Airtable
		url.searchParams.append('sort[0][field]', 'created_time');
		url.searchParams.append('sort[0][direction]', 'desc');

	const airtableRes = await fetch(url.toString(), {
		method: 'GET',
		headers: {
			Authorization: `Bearer ${AIRTABLE_TOKEN}`,
			'Content-Type': 'application/json',
		},
	});

	const airtableResult = await airtableRes.json();

	if (!airtableRes.ok) {
		console.error('Airtable content queue error:', airtableResult);
		return NextResponse.json(
			{ error: airtableResult?.error?.message || 'Failed to fetch content queue' },
			{ status: 502 }
		);
	}

	let items = (airtableResult.records || []).map((record: any) => {
		const fields = record.fields || {};
		// Extract brand_profile_id - could be a link field (array) or string
		let brandProfileId: string | null = null;
		if (fields.brand_profile_id) {
			if (Array.isArray(fields.brand_profile_id)) {
				// Link field returns array of record IDs
				brandProfileId = fields.brand_profile_id[0] || null;
			} else if (typeof fields.brand_profile_id === 'string') {
				brandProfileId = fields.brand_profile_id;
			}
		}

		return {
			id: record.id,
			title: fields.title || fields.post_title || 'Untitled',
			platform: fields.platform || 'Unknown',
			status: fields.status || 'Draft',
			scheduled_date: fields.scheduled_date || null,
			published_at: fields.published_at || null,
			brand_profile_id: brandProfileId,
			brand_name: fields.brand_name || fields.client_name || '',
			content: fields.content || fields.post_body || '',
			summary: fields.summary || fields.content_summary || '',
			call_to_action: fields.call_to_action || '',
			created_time: fields.created_time || record.createdTime,
			updated_time: fields.last_modified_time || fields.updated_time || null,
		};
	});

	// Filter by user's brand profiles in code (since brand_profile_id field may not exist in Airtable yet)
	// If user has brand profiles, only show content linked to those brands
	if (brandProfileIds.length > 0) {
		items = items.filter((item) => {
			// If item has no brand_profile_id, exclude it (safety measure)
			if (!item.brand_profile_id) return false;
			// Only include items linked to user's brand profiles
			return brandProfileIds.includes(item.brand_profile_id);
		});
	} else {
		// If user has no brand profiles, return empty array
		items = [];
	}

	return NextResponse.json({ items });
	} catch (error: any) {
		console.error('content queue GET error:', error);
		return NextResponse.json({ error: error?.message || 'Server error' }, { status: 500 });
	}
}
