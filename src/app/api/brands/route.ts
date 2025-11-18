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

		// Check for pending content in ContentQueue
		const CONTENTQUEUE_TABLE = process.env.AIRTABLE_CONTENTQUEUE_TABLE;
		const brandProfileIds = (airtableResult.records || []).map((r: any) => r.id);
		const contentStatusMap = new Map<string, boolean>(); // brand_profile_id -> hasPendingContent

		if (CONTENTQUEUE_TABLE && brandProfileIds.length > 0) {
			// Fetch content for these brand profiles
			// Airtable allows up to 10 IDs in OR formula, so batch if needed
			for (let i = 0; i < brandProfileIds.length; i += 10) {
				const batch = brandProfileIds.slice(i, i + 10);
				const contentFilter = batch.length === 1
					? `AND({brand_profile_id} = "${batch[0]}", OR({status} = "Draft", {status} = "Pending Approval"))`
					: `AND(OR(${batch.map((id) => `{brand_profile_id} = "${id}"`).join(',')}), OR({status} = "Draft", {status} = "Pending Approval"))`;

				const contentUrl = new URL(`https://api.airtable.com/v0/${BASE_ID}/${CONTENTQUEUE_TABLE}`);
				contentUrl.searchParams.set('filterByFormula', contentFilter);
				contentUrl.searchParams.set('maxRecords', '1'); // Just need to know if any exist

				try {
					const contentRes = await fetch(contentUrl.toString(), {
						headers: {
							Authorization: `Bearer ${AIRTABLE_TOKEN}`,
							'Content-Type': 'application/json',
						},
					});

					if (contentRes.ok) {
						const contentData = await contentRes.json();
						const foundBrandIds = new Set<string>();
						(contentData.records || []).forEach((record: any) => {
							const brandId = Array.isArray(record.fields?.brand_profile_id)
								? record.fields.brand_profile_id[0]
								: record.fields?.brand_profile_id;
							if (brandId) foundBrandIds.add(brandId);
						});
						foundBrandIds.forEach((id) => contentStatusMap.set(id, true));
					}
				} catch (error) {
					console.warn('Failed to check content status:', error);
				}
			}
		}

		// Map Airtable records to our format
		const profiles = (airtableResult.records || []).map((record: any) => {
			const hasPendingContent = contentStatusMap.has(record.id);
			const normalisedStatus = normaliseStatus(record.fields.status);
			
			// If strategy is approved and content exists, show "Content Review" status
			const displayStatus = normalisedStatus === 'Strategy Approved' && hasPendingContent
				? 'Content Review'
				: normalisedStatus;

			return {
				id: record.id,
				client_name: record.fields.client_name || '',
				status: displayStatus,
				original_status: normalisedStatus, // Keep original for reference
				has_pending_content: hasPendingContent,
				created_time: record.fields.created_time || record.createdTime,
				platforms_requested: record.fields.platforms_requested || [],
				strategy_summary: record.fields.strategy_summary || '',
				strategy_payload: record.fields.strategy_payload || null,
				strategy_meta: record.fields.strategy_meta || null,
			};
		});

		return NextResponse.json({ profiles });
	} catch (e: any) {
		console.error('Brands API error:', e);
		return NextResponse.json({ error: e?.message || 'Server error' }, { status: 500 });
	}
}

