import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient, type CookieOptions } from '@supabase/ssr';

export const runtime = 'nodejs';

// Debug endpoint to check what content exists in Airtable
export async function GET(req: NextRequest) {
	try {
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

		const AIRTABLE_TOKEN = process.env.AIRTABLE_PAT;
		const BASE_ID = process.env.AIRTABLE_BASE_ID;
		const TABLE_ID = process.env.AIRTABLE_CONTENTQUEUE_TABLE;
		const BRANDPROFILES_TABLE = process.env.AIRTABLE_BRANDPROFILES_TABLE;

		if (!AIRTABLE_TOKEN || !BASE_ID || !TABLE_ID || !BRANDPROFILES_TABLE) {
			return NextResponse.json({ error: 'Airtable configuration missing' }, { status: 500 });
		}

		// Get user's brand profiles
		const brandProfilesUrl = new URL(`https://api.airtable.com/v0/${BASE_ID}/${BRANDPROFILES_TABLE}`);
		brandProfilesUrl.searchParams.set('filterByFormula', `{user_id} = "${user.id}"`);
		brandProfilesUrl.searchParams.set('maxRecords', '10');

		const brandProfilesRes = await fetch(brandProfilesUrl.toString(), {
			headers: {
				Authorization: `Bearer ${AIRTABLE_TOKEN}`,
				'Content-Type': 'application/json',
			},
		});

		const brandProfilesData = brandProfilesRes.ok ? await brandProfilesRes.json() : { records: [] };
		const brandProfileIds = (brandProfilesData.records || []).map((r: any) => r.id);

		// Get ALL content (no status filter) to see what exists
		const contentUrl = new URL(`https://api.airtable.com/v0/${BASE_ID}/${TABLE_ID}`);
		contentUrl.searchParams.set('maxRecords', '50');
		contentUrl.searchParams.set('sort[0][field]', 'created_time');
		contentUrl.searchParams.set('sort[0][direction]', 'desc');

		const contentRes = await fetch(contentUrl.toString(), {
			headers: {
				Authorization: `Bearer ${AIRTABLE_TOKEN}`,
				'Content-Type': 'application/json',
			},
		});

		if (!contentRes.ok) {
			const errorText = await contentRes.text();
			return NextResponse.json({ error: 'Failed to fetch content', details: errorText }, { status: 502 });
		}

		const contentData = await contentRes.json();
		const allRecords = contentData.records || [];

		// Filter by user's brand profiles
		const userRecords = allRecords.filter((record: any) => {
			const brandProfileId = Array.isArray(record.fields?.brand_profile_id)
				? record.fields.brand_profile_id[0]
				: record.fields?.brand_profile_id;
			return brandProfileId && brandProfileIds.includes(brandProfileId);
		});

		// Group by status
		const byStatus: Record<string, any[]> = {};
		userRecords.forEach((record: any) => {
			const status = record.fields?.status || 'NO STATUS';
			if (!byStatus[status]) {
				byStatus[status] = [];
			}
			byStatus[status].push({
				id: record.id,
				title: record.fields?.title || record.fields?.post_title || 'NO TITLE',
				platform: record.fields?.platform || 'NO PLATFORM',
				status: status,
				brand_profile_id: Array.isArray(record.fields?.brand_profile_id)
					? record.fields.brand_profile_id[0]
					: record.fields?.brand_profile_id || 'NO BRAND_PROFILE_ID',
				created_time: record.fields?.created_time || record.createdTime,
			});
		});

		return NextResponse.json({
			user_id: user.id,
			brand_profile_ids: brandProfileIds,
			total_records: allRecords.length,
			user_records: userRecords.length,
			by_status: byStatus,
			approval_statuses: ['Needs Approval', 'Needs Copy', 'Needs Review'],
			records_for_approval: [
				...byStatus['Needs Approval'] || [],
				...byStatus['Needs Copy'] || [],
				...byStatus['Needs Review'] || [],
			],
		});
	} catch (error: any) {
		console.error('[CONTENT DEBUG] Error:', error);
		return NextResponse.json({ error: error?.message || 'Server error' }, { status: 500 });
	}
}

