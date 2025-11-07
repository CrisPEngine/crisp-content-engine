import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient, type CookieOptions } from '@supabase/ssr';

export const runtime = 'nodejs';

export async function GET(req: Request) {
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

		const { data: { user }, error: userErr } = await supabase.auth.getUser();

		if (userErr || !user) {
			return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
		}

		// Airtable configuration
		const AIRTABLE_TOKEN = process.env.AIRTABLE_PAT;
		const BASE_ID = process.env.AIRTABLE_BASE_ID;
		const TABLE_ID = process.env.AIRTABLE_BRANDPROFILES_TABLE;

		if (!AIRTABLE_TOKEN || !BASE_ID || !TABLE_ID) {
			return NextResponse.json(
				{ error: 'Airtable configuration missing' },
				{ status: 500 }
			);
		}

		// Fetch brand profiles for this user from Airtable
		const airtableRes = await fetch(
			`https://api.airtable.com/v0/${BASE_ID}/${TABLE_ID}?filterByFormula={user_id}="${user.id}"&sort[0][field]=created_time&sort[0][direction]=desc`,
			{
				method: 'GET',
				headers: {
					Authorization: `Bearer ${AIRTABLE_TOKEN}`,
					'Content-Type': 'application/json',
				},
			}
		);

		const airtableResult = await airtableRes.json();

		if (!airtableRes.ok) {
			console.error('Airtable error:', airtableResult);
			return NextResponse.json(
				{ error: airtableResult?.error?.message || 'Failed to fetch brand profiles' },
				{ status: 422 }
			);
		}

		const normaliseStatus = (status: string | undefined) => {
			if (status === 'Strategy Ready (Awaiting Approval)') return 'Strategy Ready';
			return status || 'New Brief';
		};

		// Map Airtable records to our format
		const profiles = (airtableResult.records || []).map((record: any) => ({
			id: record.id,
			client_name: record.fields.client_name || '',
			status: normaliseStatus(record.fields.status),
			created_time: record.fields.created_time || record.createdTime,
			platforms_requested: record.fields.platforms_requested || [],
			strategy_summary: record.fields.strategy_summary || '',
			strategy_payload: record.fields.strategy_payload || null,
			strategy_meta: record.fields.strategy_meta || null,
		}));

		return NextResponse.json({ profiles });
	} catch (e: any) {
		console.error('Brands API error:', e);
		return NextResponse.json({ error: e?.message || 'Server error' }, { status: 500 });
	}
}

