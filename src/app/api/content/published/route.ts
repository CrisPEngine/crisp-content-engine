/**
 * Get published posts for content brief feedback selection
 * 
 * Returns published posts that can be selected as best/worst performing
 * for content brief feedback mode
 */

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient, type CookieOptions } from '@supabase/ssr';

export const runtime = 'nodejs';

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

		const { searchParams } = new URL(request.url);
		const brandProfileId = searchParams.get('brand_profile_id');

		if (!brandProfileId) {
			return NextResponse.json({ error: 'Missing brand_profile_id' }, { status: 400 });
		}

		const AIRTABLE_TOKEN = process.env.AIRTABLE_PAT;
		const BASE_ID = process.env.AIRTABLE_BASE_ID;
		const TABLE_ID = process.env.AIRTABLE_CONTENTQUEUE_TABLE;
		const BRANDPROFILES_TABLE = process.env.AIRTABLE_BRANDPROFILES_TABLE;

		if (!AIRTABLE_TOKEN || !BASE_ID || !TABLE_ID || !BRANDPROFILES_TABLE) {
			return NextResponse.json(
				{ error: 'Airtable configuration missing' },
				{ status: 500 }
			);
		}

		// Fetch published posts for this brand profile
		// Use the same approach as content queue: filter by user_id_lookup, then filter by brand_profile_id in code
		// This is more reliable than trying to filter link fields in Airtable formulas
		const { listRecords } = await import('@/lib/airtable/client');
		const { CONTENTQUEUE_LOOKUP_FIELDS } = await import('@/lib/airtable/field-mapping');
		
		// Build filter: user owns the content AND status is Published
		// Use user_id_lookup field name (not ID) for the formula
		const user_id_lookup_name = CONTENTQUEUE_LOOKUP_FIELDS.user_id_lookup.name;
		const escapedUserId = user.id.replace(/"/g, '""'); // Escape double quotes for Airtable formula
		const filterFormula = `AND(
			FIND("${escapedUserId}", ARRAYJOIN({${user_id_lookup_name}}, ",")) > 0,
			{status} = "Published"
		)`;

		const records = await listRecords({
			table: TABLE_ID,
			filterByFormula: filterFormula,
			sort: [{ field: 'published_at', direction: 'desc' }],
			maxRecords: 100,
			fields: [
				'hook',
				'post_content',
				'published_at',
				'published_url',
				'brand_profile_id',
				'status',
			],
			returnFieldsByFieldId: false, // Use field names for simpler access
			endpoint: '/api/content/published',
		});

		console.log(`[Published Posts API] Found ${records.length} published records for user ${user.id}`);

		// Filter by brand_profile_id in code (handles link fields correctly)
		const posts = records
			.filter((record: any) => {
				const fields = record.fields || {};
				const recordBrandProfileId = Array.isArray(fields.brand_profile_id)
					? fields.brand_profile_id[0]
					: fields.brand_profile_id;
				// Handle both string IDs and object IDs from link fields
				const brandId = typeof recordBrandProfileId === 'string' 
					? recordBrandProfileId 
					: recordBrandProfileId?.id || String(recordBrandProfileId);
				const matches = brandId === brandProfileId;
				if (!matches) {
					console.log(`[Published Posts API] Record ${record.id} brand mismatch: ${brandId} !== ${brandProfileId}`);
				}
				return matches;
			})
			.map((record: any) => {
				const fields = record.fields || {};
				const title = fields.hook || fields.title || fields.post_title || 'Untitled';
				const content = fields.post_content || fields.content || fields.post_body || '';
				return {
					id: record.id,
					title: title,
					content: content ? (content.substring(0, 100) + (content.length > 100 ? '...' : '')) : '',
					published_at: fields.published_at || fields.published_time || null,
					published_url: fields.published_url || null,
				};
			})
			// Filter out records with no title or content (empty/deleted records)
			.filter((post: any) => {
				const hasTitle = post.title && post.title.trim() && post.title !== 'Untitled';
				const hasContent = post.content && post.content.trim();
				return hasTitle || hasContent;
			});

		console.log(`[Published Posts API] Returning ${posts.length} posts for brand ${brandProfileId} (filtered from ${records.length} total published)`);

		return NextResponse.json({ posts });
	} catch (error: any) {
		console.error('Error fetching published posts:', error);
		return NextResponse.json(
			{ error: error?.message || 'Server error' },
			{ status: 500 }
		);
	}
}
