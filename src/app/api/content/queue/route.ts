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

		if (!AIRTABLE_TOKEN || !BASE_ID || !TABLE_ID) {
			return NextResponse.json(
				{ error: 'Airtable configuration missing. Please contact support.' },
				{ status: 500 }
			);
		}

		const url = new URL(`https://api.airtable.com/v0/${BASE_ID}/${TABLE_ID}`);
		const { searchParams } = new URL(request.url);
		const stage = searchParams.get('stage');
		const statusParam = searchParams.get('status');
		const statuses = mapStatuses(stage, statusParam);

		const filters: string[] = [`{user_id} = "${user.id}"`];
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

	const items = (airtableResult.records || []).map((record: any) => {
		const fields = record.fields || {};
		return {
			id: record.id,
			title: fields.title || fields.post_title || 'Untitled',
			platform: fields.platform || 'Unknown',
			status: fields.status || 'Draft',
			scheduled_date: fields.scheduled_date || null,
			published_at: fields.published_at || null,
			brand_profile_id: Array.isArray(fields.brand_profile_id) ? fields.brand_profile_id[0] : fields.brand_profile_id || null,
			brand_name: fields.brand_name || fields.client_name || '',
			content: fields.content || fields.post_body || '',
			summary: fields.summary || fields.content_summary || '',
			call_to_action: fields.call_to_action || '',
			created_time: fields.created_time || record.createdTime,
			updated_time: fields.last_modified_time || fields.updated_time || null,
		};
	});

	return NextResponse.json({ items });
	} catch (error: any) {
		console.error('content queue GET error:', error);
		return NextResponse.json({ error: error?.message || 'Server error' }, { status: 500 });
	}
}
