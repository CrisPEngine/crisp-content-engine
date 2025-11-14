import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient, type CookieOptions } from '@supabase/ssr';

export const runtime = 'nodejs';

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
	try {
		const { id: brandProfileId } = await context.params;

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

		// Fetch strategy from Airtable
		const airtableRes = await fetch(
			`https://api.airtable.com/v0/${BASE_ID}/${TABLE_ID}/${brandProfileId}`,
			{
				method: 'GET',
				headers: {
					Authorization: `Bearer ${AIRTABLE_TOKEN}`,
					'Content-Type': 'application/json',
				},
			}
		);

		const record = await airtableRes.json();

		if (!airtableRes.ok) {
			console.error('Airtable error:', record);
			return NextResponse.json(
				{ error: record?.error?.message || 'Strategy not found' },
				{ status: 404 }
			);
		}

		// Verify this strategy belongs to the user
		if (record.fields?.user_id !== user.id) {
			return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
		}

		// Parse strategy content
		let strategyContent = '';
		if (record.fields.strategy_payload) {
			try {
				const parsed = JSON.parse(record.fields.strategy_payload);
				strategyContent = typeof parsed === 'string' ? parsed : JSON.stringify(parsed, null, 2);
			} catch {
				strategyContent = String(record.fields.strategy_payload || '');
			}
		} else if (record.fields.strategy_summary) {
			strategyContent = String(record.fields.strategy_summary);
		}

		return NextResponse.json({
			id: record.id,
			brand_name: record.fields.client_name || 'Unknown Brand',
			status: record.fields.status || 'New Brief',
			content: strategyContent,
			strategy_summary: record.fields.strategy_summary || '',
			created_at: record.fields.created_time || record.createdTime,
		});
	} catch (error: any) {
		console.error('Strategy fetch error:', error);
		return NextResponse.json(
			{ error: error?.message || 'Server error' },
			{ status: 500 }
		);
	}
}

