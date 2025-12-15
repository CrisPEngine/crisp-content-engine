/**
 * Reset a specific ContentQueue record that failed due to auth issues.
 *
 * POST /api/publish/reset-auth-failed
 * Body: { record_id: string }
 *
 * Security: requires admin user OR x-retry-secret header.
 * Effect: sets status to "Ready To Publish", clears publish_error, and resets publish_attempts to 0.
 */

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient, type CookieOptions } from '@supabase/ssr';

export const runtime = 'nodejs';

export async function POST(request: Request) {
	try {
		const { record_id } = await request.json().catch(() => ({}));

		if (!record_id) {
			return NextResponse.json({ error: 'Missing record_id' }, { status: 400 });
		}

		// Auth via user session or secret header
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

		const secret = request.headers.get('x-retry-secret');
		const expectedSecret = process.env.RETRY_FAILED_SECRET;

		if (!user && (!expectedSecret || secret !== expectedSecret)) {
			return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
		}

		if (user) {
			const admin = createServerClient(
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
			return NextResponse.json({ error: 'Airtable configuration missing' }, { status: 500 });
		}

		// Reset the record
		const updateRes = await fetch(
			`https://api.airtable.com/v0/${BASE_ID}/${TABLE_ID}/${record_id}`,
			{
				method: 'PATCH',
				headers: {
					Authorization: `Bearer ${AIRTABLE_TOKEN}`,
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({
					fields: {
						status: 'Ready To Publish',
						publish_error: '',
						publish_attempts: 0,
					},
				}),
			}
		);

		if (!updateRes.ok) {
			const errorText = await updateRes.text();
			return NextResponse.json(
				{ error: `Failed to reset record: ${errorText}` },
				{ status: 502 }
			);
		}

		return NextResponse.json({ ok: true, record_id });
	} catch (error: any) {
		console.error('[Reset Auth Failed] Error:', error);
		return NextResponse.json({ error: error?.message || 'Server error' }, { status: 500 });
	}
}
