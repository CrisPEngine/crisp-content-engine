import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { getSupabaseService } from '@/lib/supabaseService';

export const runtime = 'nodejs';

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
	try {
		const { id: brandProfileId } = await context.params;
		const body = await request.json().catch(() => ({}));
		const strategyContent = body?.strategy_content || body?.content || '';

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

		// Check if LinkedIn is connected
		const admin = getSupabaseService();
		const { data: linkedInConnection } = await admin
			.from('social_connections')
			.select('person_urn')
			.eq('user_id', user.id)
			.eq('provider', 'linkedin')
			.maybeSingle();

		if (!linkedInConnection) {
			return NextResponse.json(
				{ error: 'LinkedIn not connected', requiresConnection: true },
				{ status: 400 }
			);
		}

		// Update strategy status in Airtable
		const AIRTABLE_TOKEN = process.env.AIRTABLE_PAT;
		const BASE_ID = process.env.AIRTABLE_BASE_ID;
		const TABLE_ID = process.env.AIRTABLE_BRANDPROFILES_TABLE;

		if (!AIRTABLE_TOKEN || !BASE_ID || !TABLE_ID) {
			return NextResponse.json(
				{ error: 'Airtable configuration missing' },
				{ status: 500 }
			);
		}

		// Update strategy status to "Strategy Approved"
		const updateRes = await fetch(`https://api.airtable.com/v0/${BASE_ID}/${TABLE_ID}/${brandProfileId}`, {
			method: 'PATCH',
			headers: {
				Authorization: `Bearer ${AIRTABLE_TOKEN}`,
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				fields: {
					status: 'Strategy Approved',
					strategy_approved_at: new Date().toISOString(),
					...(strategyContent && { strategy_payload: String(strategyContent) }),
				},
			}),
		});

		if (!updateRes.ok) {
			const errorText = await updateRes.text();
			console.error('Airtable strategy approval update failed:', errorText);
			return NextResponse.json(
				{ error: 'Failed to update strategy status' },
				{ status: 502 }
			);
		}

		// Trigger content generation in Make
		const MAKE_CONTENT_WEBHOOK_URL = process.env.MAKE_CONTENT_GENERATION_WEBHOOK_URL;
		if (MAKE_CONTENT_WEBHOOK_URL) {
			try {
				await fetch(MAKE_CONTENT_WEBHOOK_URL, {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						...(process.env.MAKE_API_KEY && {
							'x-api-key': process.env.MAKE_API_KEY,
						}),
					},
					body: JSON.stringify({
						brand_profile_id: brandProfileId,
						user_id: user.id,
						person_urn: linkedInConnection.person_urn,
						triggered_at: new Date().toISOString(),
					}),
				});
			} catch (webhookError) {
				// Log but don't fail the request if webhook fails
				console.error('Make content generation webhook error:', webhookError);
			}
		}

		return NextResponse.json({
			ok: true,
			message: 'Strategy approved. Content generation started.',
		});
	} catch (error: any) {
		console.error('Strategy approval error:', error);
		return NextResponse.json(
			{ error: error?.message || 'Server error' },
			{ status: 500 }
		);
	}
}

