import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { listRecords } from '@/lib/airtable/client';

export const runtime = 'nodejs';

/**
 * BrandProfiles Rollup Field IDs (from Airtable)
 * These are authoritative counts - do not recompute in code
 */
const ROLLUP_FIELDS = {
	needs_approval_count: 'fldoVhwdnORrAzGte',
	ready_to_publish_count: 'fldlwGSMBUH7OPbjM',
	scheduled_count: 'fldbmS3KCkSmUw5vn',
	published_count: 'fldWwrVyniwGMCS7z',
};

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

		const TABLE_ID = process.env.AIRTABLE_BRANDPROFILES_TABLE;

		if (!TABLE_ID) {
			return NextResponse.json(
				{ error: 'Airtable configuration missing' },
				{ status: 500 }
			);
		}

		// SINGLE Airtable call: Fetch brand profiles with rollup fields
		// No additional ContentQueue queries needed - counts come from rollups
		try {
			const records = await listRecords({
				table: TABLE_ID,
				filterByFormula: `{user_id} = "${user.id}"`,
				sort: [{ field: 'created_time', direction: 'desc' }],
				fields: [
					'client_name', // Primary name field
					'status',
					'created_time',
					'platforms_requested',
					'strategy_summary',
					'strategy_payload',
					'strategy_meta',
					// Rollup fields (use field IDs)
					ROLLUP_FIELDS.needs_approval_count,
					ROLLUP_FIELDS.ready_to_publish_count,
					ROLLUP_FIELDS.scheduled_count,
					ROLLUP_FIELDS.published_count,
				],
				cache: true, // Enable caching for BrandProfiles
			});

			const normaliseStatus = (status: string | undefined) => {
				if (status === 'Strategy Ready (Awaiting Approval)') return 'Strategy Ready';
				return status || 'New Brief';
			};

			// Map Airtable records to our format using rollup fields
			const profiles = records.map((record: any) => {
				const fields = record.fields || {};
				const normalisedStatus = normaliseStatus(fields.status);
				
				// Use rollup counts to determine if there's pending content
				// has_pending_content = true if any count > 0 (except published)
				const needsApproval = Number(fields[ROLLUP_FIELDS.needs_approval_count] || 0) > 0;
				const readyToPublish = Number(fields[ROLLUP_FIELDS.ready_to_publish_count] || 0) > 0;
				const scheduled = Number(fields[ROLLUP_FIELDS.scheduled_count] || 0) > 0;
				const hasPendingContent = needsApproval || readyToPublish || scheduled;

				return {
					id: record.id,
					client_name: fields.client_name || '',
					status: normalisedStatus,
					original_status: normalisedStatus,
					has_pending_content: hasPendingContent,
					created_time: fields.created_time || record.createdTime,
					platforms_requested: fields.platforms_requested || [],
					strategy_summary: fields.strategy_summary || '',
					strategy_payload: fields.strategy_payload || null,
					strategy_meta: fields.strategy_meta || null,
					// Include rollup counts for UI display
					needs_approval_count: Number(fields[ROLLUP_FIELDS.needs_approval_count] || 0),
					ready_to_publish_count: Number(fields[ROLLUP_FIELDS.ready_to_publish_count] || 0),
					scheduled_count: Number(fields[ROLLUP_FIELDS.scheduled_count] || 0),
					published_count: Number(fields[ROLLUP_FIELDS.published_count] || 0),
				};
			});

			console.log(`[Brands API] Fetched ${profiles.length} brand profiles in 1 Airtable call`);
			return NextResponse.json({ profiles });
		} catch (error: any) {
			console.error('[Brands API] Airtable error:', error);
			
			// Check for billing limit error in error message
			const errorMessage = error?.message || '';
			const isBillingLimitError = 
				errorMessage.includes('PUBLIC_API_BILLING_LIMIT_EXCEEDED') ||
				errorMessage.includes('billing plan limit exceeded');
			
			if (isBillingLimitError) {
				console.error('[Brands API] Airtable billing limit exceeded - brand profiles exist but are temporarily inaccessible');
				return NextResponse.json(
					{ 
						error: 'Airtable API limit exceeded',
						message: 'Brand profiles are temporarily unavailable due to API usage limits. Please try again later or contact support.',
						billingLimitExceeded: true,
						profiles: []
					},
					{ status: 503 }
				);
			}
			
			return NextResponse.json(
				{ 
					error: errorMessage || 'Failed to fetch brand profiles',
					profiles: []
				},
				{ status: 422 }
			);
		}
	} catch (e: any) {
		console.error('Brands API error:', e);
		return NextResponse.json({ error: e?.message || 'Server error' }, { status: 500 });
	}
}

