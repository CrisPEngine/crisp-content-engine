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
		const publishedUrl = body.published_url; // Optional: published URL to set
		const linkedinPostId = body.linkedin_post_id; // Optional: LinkedIn post ID to set
		const publishedAt = body.published_at; // Optional: published timestamp

		// If record_id is provided with published_url or linkedin_post_id, update that specific record
		if (recordId && (publishedUrl || linkedinPostId)) {
			console.log(`[Sync Status] Updating record ${recordId} with published info`);
			
			// First, check for duplicates - find other posts with the same published_url or linkedin_post_id
			const duplicateChecks: string[] = [];
			if (publishedUrl) {
				duplicateChecks.push(`{published_url} = "${publishedUrl}"`);
			}
			if (linkedinPostId) {
				duplicateChecks.push(`{linkedin_post_id} = "${linkedinPostId}"`);
			}

			if (duplicateChecks.length > 0) {
				const duplicateFilter = `AND(
					{platform} = "LinkedIn",
					OR(${duplicateChecks.join(',')}),
					NOT(RECORD_ID() = "${recordId}")
				)`;

				const duplicateUrl = new URL(`https://api.airtable.com/v0/${BASE_ID}/${TABLE_ID}`);
				duplicateUrl.searchParams.set('filterByFormula', duplicateFilter);
				duplicateUrl.searchParams.set('maxRecords', '10');
				duplicateUrl.searchParams.append('fields[]', 'status');
				duplicateUrl.searchParams.append('fields[]', 'published_url');
				duplicateUrl.searchParams.append('fields[]', 'linkedin_post_id');

				const duplicateResponse = await fetch(duplicateUrl.toString(), {
					headers: {
						Authorization: `Bearer ${AIRTABLE_TOKEN}`,
						'Content-Type': 'application/json',
					},
				});

				if (duplicateResponse.ok) {
					const duplicateData = await duplicateResponse.json();
					const duplicates = duplicateData.records || [];
					
					if (duplicates.length > 0) {
						// Found duplicates - mark them as duplicates or update their status
						const duplicateIds = duplicates.map((d: any) => d.id);
						console.warn(`[Sync Status] Found ${duplicates.length} duplicate posts: ${duplicateIds.join(', ')}`);
						
						// Update duplicates to "Published" if they're not already, to prevent re-publishing
						for (const duplicate of duplicates) {
							if (duplicate.fields.status !== 'Published') {
								await fetch(`https://api.airtable.com/v0/${BASE_ID}/${TABLE_ID}/${duplicate.id}`, {
									method: 'PATCH',
									headers: {
										Authorization: `Bearer ${AIRTABLE_TOKEN}`,
										'Content-Type': 'application/json',
									},
									body: JSON.stringify({
										fields: {
											status: 'Published',
											publish_error: 'Duplicate post - already published',
										},
									}),
								});
							}
						}
					}
				}
			}

			// Now update the target record
			const updateFields: Record<string, any> = {
				status: 'Published',
			};

			if (publishedUrl) {
				updateFields.published_url = publishedUrl;
			}
			if (linkedinPostId) {
				updateFields.linkedin_post_id = linkedinPostId;
			}
			if (publishedAt) {
				updateFields.published_at = publishedAt;
			} else if (!publishedAt) {
				// If no published_at provided, use current time
				updateFields.published_at = new Date().toISOString();
			}

			const updateResponse = await fetch(
				`https://api.airtable.com/v0/${BASE_ID}/${TABLE_ID}/${recordId}`,
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
				return NextResponse.json(
					{ error: `Failed to update record: ${errorText}` },
					{ status: 502 }
				);
			}

			return NextResponse.json({
				ok: true,
				message: `Successfully synced record ${recordId}`,
				synced: 1,
				record: {
					id: recordId,
					status: 'Published',
					published_url: publishedUrl,
					linkedin_post_id: linkedinPostId,
					published_at: publishedAt || updateFields.published_at,
				},
			});
		}

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

		// Check for duplicates before updating
		// Group records by published_url or linkedin_post_id to detect duplicates
		const urlToRecords = new Map<string, any[]>();
		const postIdToRecords = new Map<string, any[]>();

		for (const record of records) {
			const publishedUrl = record.fields.published_url;
			const linkedinPostId = record.fields.linkedin_post_id;

			if (publishedUrl) {
				if (!urlToRecords.has(publishedUrl)) {
					urlToRecords.set(publishedUrl, []);
				}
				urlToRecords.get(publishedUrl)!.push(record);
			}

			if (linkedinPostId) {
				if (!postIdToRecords.has(linkedinPostId)) {
					postIdToRecords.set(linkedinPostId, []);
				}
				postIdToRecords.get(linkedinPostId)!.push(record);
			}
		}

		// Log duplicates found
		for (const [url, recs] of urlToRecords.entries()) {
			if (recs.length > 1) {
				console.warn(`[Sync Status] Found ${recs.length} records with same published_url: ${url}`);
			}
		}

		for (const [postId, recs] of postIdToRecords.entries()) {
			if (recs.length > 1) {
				console.warn(`[Sync Status] Found ${recs.length} records with same linkedin_post_id: ${postId}`);
			}
		}

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
