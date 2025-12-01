/**
 * Retry Failed Posts
 * 
 * This endpoint allows manually retrying posts that have failed.
 * It finds posts with status "Failed" and resets them to "Ready To Publish"
 * so they can be picked up by the publishing job.
 * 
 * Security: Requires admin authentication or can be called with a secret
 */

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { getSupabaseService } from '@/lib/supabaseService';

export const runtime = 'nodejs';

export async function POST(request: Request) {
	try {
		// Authenticate user (optional - can also use secret)
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

		// Check for secret as alternative auth
		const secret = request.headers.get('x-retry-secret');
		const expectedSecret = process.env.RETRY_FAILED_SECRET;

		if (!user && (!expectedSecret || secret !== expectedSecret)) {
			return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
		}

		// If user is authenticated, check if admin
		if (user) {
			const admin = getSupabaseService();
			const { data: profile } = await admin
				.from('profiles')
				.select('is_admin')
				.eq('id', user.id)
				.maybeSingle();

			if (!profile?.is_admin) {
				return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
			}
		}

		const AIRTABLE_TOKEN = process.env.AIRTABLE_PAT;
		const BASE_ID = process.env.AIRTABLE_BASE_ID;
		const TABLE_ID = process.env.AIRTABLE_CONTENTQUEUE_TABLE;

		if (!AIRTABLE_TOKEN || !BASE_ID || !TABLE_ID) {
			return NextResponse.json(
				{ error: 'Airtable configuration missing' },
				{ status: 500 }
			);
		}

		// Get request body to optionally filter by user_id or brand_profile_id
		const body = await request.json().catch(() => ({}));
		const userId = body.user_id;
		const brandProfileId = body.brand_profile_id;
		const recordIds = body.record_ids; // Optional: specific record IDs to retry

		// Build filter formula
		let filterFormula = '{status} = "Failed"';
		
		if (recordIds && Array.isArray(recordIds) && recordIds.length > 0) {
			// If specific record IDs provided, use those
			const recordIdFilter = recordIds
				.map((id: string) => `RECORD_ID() = "${id}"`)
				.join(',');
			filterFormula = `AND(${filterFormula}, OR(${recordIdFilter}))`;
		} else if (userId) {
			// Filter by user_id if provided
			// Note: user_id might be in brand_profile_id, so we'd need to join with BrandProfiles
			// For now, we'll just reset all failed posts
			console.log(`Retrying failed posts for user ${userId}`);
		}

		// Fetch failed posts
		const url = new URL(`https://api.airtable.com/v0/${BASE_ID}/${TABLE_ID}`);
		url.searchParams.set('filterByFormula', filterFormula);
		url.searchParams.set('maxRecords', '100'); // Limit to 100 at a time

		const fetchRes = await fetch(url.toString(), {
			headers: {
				Authorization: `Bearer ${AIRTABLE_TOKEN}`,
				'Content-Type': 'application/json',
			},
		});

		if (!fetchRes.ok) {
			const errorText = await fetchRes.text();
			return NextResponse.json(
				{ error: `Failed to fetch failed posts: ${errorText}` },
				{ status: 502 }
			);
		}

		const data = await fetchRes.json();
		const records = data.records || [];

		if (records.length === 0) {
			return NextResponse.json({
				ok: true,
				message: 'No failed posts found to retry',
				reset: 0,
			});
		}

		// If brandProfileId filter is provided, filter records
		let recordsToRetry = records;
		if (brandProfileId) {
			recordsToRetry = records.filter((record: any) => {
				const bpId = Array.isArray(record.fields.brand_profile_id)
					? record.fields.brand_profile_id[0]
					: record.fields.brand_profile_id;
				return bpId === brandProfileId;
			});
		}

		// Reset status to "Ready To Publish" for each record
		const updatePromises = recordsToRetry.map(async (record: any) => {
			try {
				const updateRes = await fetch(`https://api.airtable.com/v0/${BASE_ID}/${TABLE_ID}/${record.id}`, {
					method: 'PATCH',
					headers: {
						Authorization: `Bearer ${AIRTABLE_TOKEN}`,
						'Content-Type': 'application/json',
					},
					body: JSON.stringify({
						fields: {
							status: 'Ready To Publish',
							publish_error: '', // Clear error message
							// Optionally reset publish_attempts if you want to allow more retries
							// publish_attempts: 0,
						},
					}),
				});

				if (!updateRes.ok) {
					const errorText = await updateRes.text();
					console.error(`Failed to reset record ${record.id}:`, errorText);
					return { id: record.id, success: false, error: errorText };
				}

				return { id: record.id, success: true };
			} catch (error: any) {
				console.error(`Error resetting record ${record.id}:`, error);
				return { id: record.id, success: false, error: error?.message };
			}
		});

		const results = await Promise.all(updatePromises);
		const successful = results.filter((r) => r.success).length;
		const failed = results.filter((r) => !r.success).length;

		return NextResponse.json({
			ok: true,
			message: `Reset ${successful} failed posts to "Ready To Publish"`,
			reset: successful,
			failed,
			total: recordsToRetry.length,
			results: results.map((r) => ({ id: r.id, success: r.success })),
		});
	} catch (error: any) {
		console.error('Retry failed posts error:', error);
		return NextResponse.json(
			{ error: error?.message || 'Server error' },
			{ status: 500 }
		);
	}
}

