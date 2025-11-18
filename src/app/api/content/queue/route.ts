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
		case 'all':
			// Return all statuses for dashboard overview
			return ['Ready To Publish', 'Published', 'Scheduled', 'Needs Approval', 'Needs Copy', 'Needs Review', 'Draft'];
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

	type ContentItem = {
		id: string;
		title: string;
		platform: string;
		status: string;
		content_type?: string;
		scheduled_date: string | null;
		published_at: string | null;
		brand_profile_id: string | null;
		brand_name: string;
		content: string;
		summary: string;
		call_to_action: string;
		hashtags?: string;
		image_prompt?: string;
		image_generation_source?: string;
		created_time: string;
		updated_time: string | null;
	};

	// Fetch brand names for all linked brand profiles
	const brandProfileIdSet = new Set<string>();
	(airtableResult.records || []).forEach((record: any) => {
		const fields = record.fields || {};
		if (fields.brand_profile_id) {
			if (Array.isArray(fields.brand_profile_id)) {
				fields.brand_profile_id.forEach((id: string) => brandProfileIdSet.add(id));
			} else if (typeof fields.brand_profile_id === 'string') {
				brandProfileIdSet.add(fields.brand_profile_id);
			}
		}
	});

	// Fetch brand names from BrandProfiles
	const brandNamesMap = new Map<string, string>();
	if (brandProfileIdSet.size > 0 && BRANDPROFILES_TABLE) {
		const brandIds = Array.from(brandProfileIdSet);
		// Airtable allows up to 10 IDs in OR formula, so batch if needed
		for (let i = 0; i < brandIds.length; i += 10) {
			const batch = brandIds.slice(i, i + 10);
			const brandFilter = batch.length === 1
				? `RECORD_ID() = "${batch[0]}"`
				: `OR(${batch.map((id) => `RECORD_ID() = "${id}"`).join(',')})`;
			
			const brandUrl = new URL(`https://api.airtable.com/v0/${BASE_ID}/${BRANDPROFILES_TABLE}`);
			brandUrl.searchParams.set('filterByFormula', brandFilter);
			brandUrl.searchParams.set('fields[]', 'client_name');
			brandUrl.searchParams.set('fields[]', 'personal_full_name');
			
			try {
				const brandRes = await fetch(brandUrl.toString(), {
					headers: {
						Authorization: `Bearer ${AIRTABLE_TOKEN}`,
						'Content-Type': 'application/json',
					},
				});
				
				if (brandRes.ok) {
					const brandData = await brandRes.json();
					(brandData.records || []).forEach((brandRecord: any) => {
						const brandName = brandRecord.fields?.client_name || 
						                  brandRecord.fields?.personal_full_name || 
						                  'Unknown Brand';
						brandNamesMap.set(brandRecord.id, brandName);
					});
				}
			} catch (error) {
				console.warn('Failed to fetch brand names:', error);
			}
		}
	}

	let items: ContentItem[] = (airtableResult.records || []).map((record: any) => {
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

		// Get brand name from map or fallback
		const brandName = brandProfileId 
			? (brandNamesMap.get(brandProfileId) || fields.brand_name || fields.client_name || brandProfileId)
			: (fields.brand_name || fields.client_name || 'Unknown Brand');

		return {
			id: record.id,
			title: fields.hook || fields.title || fields.post_title || 'Untitled',
			platform: fields.platform || 'Blog',
			status: fields.status || 'Draft',
			content_type: fields.content_type || 'Post',
			scheduled_date: fields.scheduled_time || fields.scheduled_date || null,
			published_at: fields.published_at || null,
			brand_profile_id: brandProfileId,
			brand_name: brandName,
			content: fields.post_content || fields.content || fields.post_body || '',
			summary: fields.summary || fields.content_summary || '',
			call_to_action: fields.call_to_action || '',
			hashtags: fields.hashtags || '',
			image_prompt: fields.image_prompt || '',
			image_generation_source: fields.image_generation_source || '',
			created_time: fields.created_time || record.createdTime,
			updated_time: fields.last_modified_time || fields.updated_time || null,
		};
	});

	// Sort by scheduled_date (earliest first), then by created_time
	items.sort((a, b) => {
		if (a.scheduled_date && b.scheduled_date) {
			return new Date(a.scheduled_date).getTime() - new Date(b.scheduled_date).getTime();
		}
		if (a.scheduled_date) return -1;
		if (b.scheduled_date) return 1;
		return new Date(b.created_time).getTime() - new Date(a.created_time).getTime();
	});

	// Filter by user's brand profiles in code (since brand_profile_id field may not exist in Airtable yet)
	// If user has brand profiles, only show content linked to those brands
	if (brandProfileIds.length > 0) {
		items = items.filter((item: ContentItem) => {
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
