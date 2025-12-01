/**
 * Debug Publishing Job
 * 
 * This endpoint helps debug why posts aren't being picked up for publishing.
 * Shows what posts are available and why they might be excluded.
 * 
 * Security: Requires admin authentication
 */

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { getSupabaseService } from '@/lib/supabaseService';

export const runtime = 'nodejs';

export async function GET(request: Request) {
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

		const {
			data: { user },
			error: userError,
		} = await supabase.auth.getUser();

		if (userError || !user) {
			return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
		}

		// Check if user is admin
		const admin = getSupabaseService();
		const { data: profile } = await admin
			.from('profiles')
			.select('is_admin')
			.eq('id', user.id)
			.maybeSingle();

		if (!profile?.is_admin) {
			return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
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

		// Query 1: Check view
		const viewUrl = new URL(`https://api.airtable.com/v0/${BASE_ID}/${TABLE_ID}`);
		viewUrl.searchParams.set('view', 'ReadyToPublish_LinkedIn');
		viewUrl.searchParams.set('maxRecords', '10');

		const viewRes = await fetch(viewUrl.toString(), {
			headers: {
				Authorization: `Bearer ${AIRTABLE_TOKEN}`,
				'Content-Type': 'application/json',
			},
		});

		const viewData = viewRes.ok ? await viewRes.json() : { records: [] };

		// Query 2: Direct query for LinkedIn + Ready To Publish
		const directUrl = new URL(`https://api.airtable.com/v0/${BASE_ID}/${TABLE_ID}`);
		directUrl.searchParams.set('filterByFormula', `AND({platform} = "LinkedIn", {status} = "Ready To Publish")`);
		directUrl.searchParams.set('maxRecords', '10');
		directUrl.searchParams.append('fields[]', 'platform');
		directUrl.searchParams.append('fields[]', 'status');
		directUrl.searchParams.append('fields[]', 'scheduled_time');
		directUrl.searchParams.append('fields[]', 'publish_attempts');
		directUrl.searchParams.append('fields[]', 'hook');

		const directRes = await fetch(directUrl.toString(), {
			headers: {
				Authorization: `Bearer ${AIRTABLE_TOKEN}`,
				'Content-Type': 'application/json',
			},
		});

		const directData = directRes.ok ? await directRes.json() : { records: [] };

		// Query 3: Check scheduled_time filter
		const scheduledUrl = new URL(`https://api.airtable.com/v0/${BASE_ID}/${TABLE_ID}`);
		scheduledUrl.searchParams.set('filterByFormula', `AND(
			{platform} = "LinkedIn",
			{status} = "Ready To Publish",
			OR({scheduled_time} <= NOW(), {scheduled_time} = BLANK())
		)`);
		scheduledUrl.searchParams.set('maxRecords', '10');
		scheduledUrl.searchParams.append('fields[]', 'platform');
		scheduledUrl.searchParams.append('fields[]', 'status');
		scheduledUrl.searchParams.append('fields[]', 'scheduled_time');
		scheduledUrl.searchParams.append('fields[]', 'publish_attempts');

		const scheduledRes = await fetch(scheduledUrl.toString(), {
			headers: {
				Authorization: `Bearer ${AIRTABLE_TOKEN}`,
				'Content-Type': 'application/json',
			},
		});

		const scheduledData = scheduledRes.ok ? await scheduledRes.json() : { records: [] };

		// Format results for debugging
		const debugInfo = {
			view: {
				count: viewData.records?.length || 0,
				records: (viewData.records || []).map((r: any) => ({
					id: r.id,
					platform: r.fields?.platform,
					status: r.fields?.status,
					scheduled_time: r.fields?.scheduled_time,
					publish_attempts: r.fields?.publish_attempts,
					hook: r.fields?.hook,
				})),
			},
			directQuery: {
				count: directData.records?.length || 0,
				records: (directData.records || []).map((r: any) => ({
					id: r.id,
					platform: r.fields?.platform,
					status: r.fields?.status,
					scheduled_time: r.fields?.scheduled_time,
					publish_attempts: r.fields?.publish_attempts,
					hook: r.fields?.hook,
				})),
			},
			withScheduledFilter: {
				count: scheduledData.records?.length || 0,
				records: (scheduledData.records || []).map((r: any) => ({
					id: r.id,
					platform: r.fields?.platform,
					status: r.fields?.status,
					scheduled_time: r.fields?.scheduled_time,
					publish_attempts: r.fields?.publish_attempts,
				})),
			},
			currentTime: new Date().toISOString(),
			currentTimeUTC: new Date().toISOString(),
		};

		return NextResponse.json(debugInfo);
	} catch (error: any) {
		console.error('Debug publishing job error:', error);
		return NextResponse.json(
			{ error: error?.message || 'Server error' },
			{ status: 500 }
		);
	}
}

