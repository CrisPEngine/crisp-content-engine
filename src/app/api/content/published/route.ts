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
		const url = new URL(`https://api.airtable.com/v0/${BASE_ID}/${TABLE_ID}`);
		
		// Filter by brand_profile_id and status = "Published"
		const filterFormula = `AND(FIND("${brandProfileId}", {brand_profile_id}), {status} = "Published")`;
		url.searchParams.set('filterByFormula', filterFormula);
		url.searchParams.set('sort[0][field]', 'published_at');
		url.searchParams.set('sort[0][direction]', 'desc');
		url.searchParams.set('maxRecords', '100'); // Get last 100 published posts

		const airtableRes = await fetch(url.toString(), {
			headers: {
				Authorization: `Bearer ${AIRTABLE_TOKEN}`,
				'Content-Type': 'application/json',
			},
		});

		if (!airtableRes.ok) {
			const errorText = await airtableRes.text();
			console.error('Failed to fetch published posts:', errorText);
			return NextResponse.json(
				{ error: 'Failed to fetch published posts' },
				{ status: 502 }
			);
		}

		const airtableResult = await airtableRes.json();
		
		// Map to simpler format for dropdown
		const posts = (airtableResult.records || []).map((record: any) => {
			const fields = record.fields || {};
			return {
				id: record.id,
				title: fields.hook || fields.title || fields.post_title || 'Untitled',
				content: (fields.post_content || fields.content || fields.post_body || '').substring(0, 100) + '...',
				published_at: fields.published_at || fields.published_time || null,
				published_url: fields.published_url || null,
			};
		});

		return NextResponse.json({ posts });
	} catch (error: any) {
		console.error('Error fetching published posts:', error);
		return NextResponse.json(
			{ error: error?.message || 'Server error' },
			{ status: 500 }
		);
	}
}
