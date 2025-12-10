/**
 * Sync Post Status
 * 
 * This endpoint helps fix posts that are out of sync - posts that were
 * successfully published to LinkedIn but the Airtable status wasn't updated.
 * 
 * It finds posts with status "Ready To Publish" that have a linkedin_post_id
 * or published_url, indicating they were already published.
 * 
 * Security: Requires admin authentication or can be called with a secret
 */

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { getSupabaseService } from '@/lib/supabaseService';

export const runtime = 'nodejs';
export const maxDuration = 300; // 5 minutes max

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

		// Get request body for optional filters
		const body = await request.json().catch(() => ({}));
		const recordId = body.record_id; // Optional: specific record ID to sync

		// Find posts that are "Ready To Publish" but have linkedin_post_id or published_url
		// This indicates they were published but status wasn't updated
		let filterFormula = `AND(
			{platform} = "LinkedIn",
			{status} = "Ready To Publish",
			OR(
				NOT({linkedin_post_id} = BLANK()),
				NOT({published_url} = BLANK())
			)
		)`;

		if (recordId) {
			filterFormula = `AND(${filterFormula}, RECORD_ID() = "${recordId}")`;
		}

		const url = new URL(`https://api.airtable.com/v0/${BASE_ID}/${TABLE_ID}`);
		url.searchParams.set('filterByFormula', filterFormula);
		url.searchParams.set('maxRecords', '100');

		const fields = ['status', 'linkedin_post_id', 'published_url', 'published_at', 'platform'];
		fields.forEach((field) => {
			url.searchParams.append('fields[]', field);
		});

		const response = await fetch(url.toString(), {
			headers: {
				Authorization: `Bearer ${AIRTABLE_TOKEN}`,
				'Content-Type': 'application/json',
			},
		});

		if (!response.ok) {
			const errorText = await response.text();
			return NextResponse.json(
				{ error: `Failed to fetch posts: ${errorText}` },
				{ status: 502 }
			);
		}

		const data = await response.json();
		const records = data.records || [];

		if (records.length === 0) {
			return NextResponse.json({
				ok: true,
				message: 'No out-of-sync posts found',
				synced: 0,
			});
		}

		console.log(`[Sync Status] Found ${records.length} out-of-sync posts`);

		// Update each record to "Published" status
		const updatePromises = records.map(async (record: any) => {
			try {
				const updateFields: Record<string, any> = {
					status: 'Published',
				};

				// If published_at is missing but we have linkedin_post_id, set it to now
				// (we don't know the exact publish time, but at least mark it as published)
				if (!record.fields.published_at) {
					updateFields.published_at = new Date().toISOString();
				}

				const updateResponse = await fetch(
					`https://api.airtable.com/v0/${BASE_ID}/${TABLE_ID}/${record.id}`,
					{
						method: 'PATCH',
						headers: {
							Authorization: `Bearer ${AIRTABLE_TOKEN}`,
							'Content-Type': 'application/json',
						},
						body: JSON.stringify({ fields: updateFields }),
					}
				);

				if (!updateResponse.ok) {
					const errorText = await updateResponse.text();
					console.error(`Failed to sync record ${record.id}:`, errorText);
					return {
						id: record.id,
						success: false,
						error: errorText,
						linkedin_post_id: record.fields.linkedin_post_id || 'none',
						published_url: record.fields.published_url || 'none',
					};
				}

				return {
					id: record.id,
					success: true,
					linkedin_post_id: record.fields.linkedin_post_id || 'none',
					published_url: record.fields.published_url || 'none',
				};
			} catch (error: any) {
				console.error(`Error syncing record ${record.id}:`, error);
				return {
					id: record.id,
					success: false,
					error: error?.message || 'Unknown error',
					linkedin_post_id: record.fields.linkedin_post_id || 'none',
					published_url: record.fields.published_url || 'none',
				};
			}
		});

		const results = await Promise.all(updatePromises);
		const successful = results.filter((r) => r.success).length;
		const failed = results.filter((r) => !r.success).length;

		return NextResponse.json({
			ok: true,
			message: `Synced ${successful} out-of-sync posts`,
			synced: successful,
			failed,
			total: records.length,
			results: results.map((r) => ({
				id: r.id,
				success: r.success,
				linkedin_post_id: r.linkedin_post_id,
				published_url: r.published_url,
				error: r.error || undefined,
			})),
		});
	} catch (error: any) {
		console.error('Sync status error:', error);
		return NextResponse.json(
			{ error: error?.message || 'Server error' },
			{ status: 500 }
		);
	}
}
