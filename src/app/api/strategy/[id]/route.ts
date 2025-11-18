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

		// Parse strategy content - prefer human-readable summary over raw JSON
		let strategyContent = '';
		
		// First, try to use the human-readable summary
		if (record.fields.strategy_summary) {
			strategyContent = String(record.fields.strategy_summary);
		} else {
			// Fallback to formatted JSON if no summary available
			const strategyData = record.fields.strategy_json || record.fields.strategy_payload;
			if (strategyData) {
				try {
					const parsed = typeof strategyData === 'string' ? JSON.parse(strategyData) : strategyData;
					strategyContent = typeof parsed === 'string' ? parsed : JSON.stringify(parsed, null, 2);
				} catch {
					strategyContent = String(strategyData || '');
				}
			}
		}

		return NextResponse.json({
			id: record.id,
			brand_name: record.fields.client_name || 'Unknown Brand',
			status: record.fields.status || 'New Brief',
			content: strategyContent,
			strategy_summary: record.fields.strategy_summary || '',
			strategy_json: record.fields.strategy_json || null,
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

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
	try {
		const { id: brandProfileId } = await context.params;
		const body = await request.json();
		const { strategy_summary, strategy_json } = body;

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

		// Verify the strategy belongs to the user
		const verifyRes = await fetch(
			`https://api.airtable.com/v0/${BASE_ID}/${TABLE_ID}/${brandProfileId}`,
			{
				method: 'GET',
				headers: {
					Authorization: `Bearer ${AIRTABLE_TOKEN}`,
					'Content-Type': 'application/json',
				},
			}
		);

		const verifyRecord = await verifyRes.json();
		if (!verifyRes.ok || verifyRecord.fields?.user_id !== user.id) {
			return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
		}

		// Check if strategy is already approved - prevent editing
		const strategyStatus = verifyRecord.fields?.status;
		if (strategyStatus === 'Strategy Approved') {
			return NextResponse.json(
				{ 
					error: 'This strategy has been approved and cannot be edited. Please use the Monthly Strategy Update process to make changes.',
				},
				{ status: 403 }
			);
		}

		// Build update fields
		const updateFields: Record<string, any> = {};
		
		if (strategy_summary !== undefined) {
			updateFields.strategy_summary = String(strategy_summary);
		}
		
		if (strategy_json !== undefined) {
			// If it's a string, use it; if it's an object, stringify it
			updateFields.strategy_json = typeof strategy_json === 'string' 
				? strategy_json 
				: JSON.stringify(strategy_json);
		}

		if (Object.keys(updateFields).length === 0) {
			return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
		}

		// Update strategy in Airtable
		const updateRes = await fetch(
			`https://api.airtable.com/v0/${BASE_ID}/${TABLE_ID}/${brandProfileId}`,
			{
				method: 'PATCH',
				headers: {
					Authorization: `Bearer ${AIRTABLE_TOKEN}`,
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({ fields: updateFields }),
			}
		);

		if (!updateRes.ok) {
			const errorText = await updateRes.text();
			let errorData: any = {};
			try {
				errorData = JSON.parse(errorText);
			} catch {
				errorData = { message: errorText };
			}
			
			console.error('Airtable strategy update failed:', errorData);
			return NextResponse.json(
				{ 
					error: errorData?.error?.message || errorData?.message || 'Failed to update strategy',
					details: errorData,
				},
				{ status: 502 }
			);
		}

		return NextResponse.json({ ok: true, message: 'Strategy updated successfully' });
	} catch (error: any) {
		console.error('Strategy update error:', error);
		return NextResponse.json(
			{ error: error?.message || 'Server error' },
			{ status: 500 }
		);
	}
}
