/**
 * POST /api/content-brief/:id/retry
 * 
 * Retries content generation for a failed or stuck brief
 * - Only allows retry when status is "Failed" or "Sent to Make" older than 30 minutes
 * - Resets last_error and resends webhook to Make.com
 */

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { triggerContentGenerationFromBrief } from '@/lib/contentBrief';

export const runtime = 'nodejs';

export async function POST(
	request: Request,
	context: { params: Promise<{ id: string }> }
) {
	try {
		const { id: briefId } = await context.params;

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

		const AIRTABLE_TOKEN = process.env.AIRTABLE_PAT;
		const BASE_ID = process.env.AIRTABLE_BASE_ID;
		const CONTENTBRIEFS_TABLE = process.env.AIRTABLE_STRATEGYUPDATES_TABLE;

		if (!AIRTABLE_TOKEN || !BASE_ID || !CONTENTBRIEFS_TABLE) {
			return NextResponse.json(
				{ error: 'Airtable configuration missing' },
				{ status: 500 }
			);
		}

		// Fetch the brief record
		const briefRes = await fetch(
			`https://api.airtable.com/v0/${BASE_ID}/${CONTENTBRIEFS_TABLE}/${briefId}`,
			{
				headers: {
					Authorization: `Bearer ${AIRTABLE_TOKEN}`,
					'Content-Type': 'application/json',
				},
			}
		);

		if (!briefRes.ok) {
			const errorText = await briefRes.text();
			return NextResponse.json(
				{ error: `Failed to fetch brief: ${errorText}` },
				{ status: briefRes.status }
			);
		}

		const briefData = await briefRes.json();
		const fields = briefData.fields || {};

		// Verify ownership
		if (fields.user_id !== user.id) {
			return NextResponse.json(
				{ error: 'Unauthorized - this brief does not belong to you' },
				{ status: 403 }
			);
		}

		const currentStatus = fields.status || '';
		const sentToMakeAt = fields.sent_to_make_at;

		// Only allow retry for Failed or Sent to Make status
		if (currentStatus !== 'Failed' && currentStatus !== 'Sent to Make') {
			return NextResponse.json(
				{
					error: `Cannot retry brief. Current status: ${currentStatus}. Only briefs with status "Failed" or "Sent to Make" can be retried.`,
					current_status: currentStatus,
				},
				{ status: 400 }
			);
		}

		// If status is "Sent to Make", check if it's older than 30 minutes
		if (currentStatus === 'Sent to Make' && sentToMakeAt) {
			try {
				const sentTime = new Date(sentToMakeAt);
				const now = new Date();
				const minutesSinceSent = (now.getTime() - sentTime.getTime()) / (1000 * 60);

				if (minutesSinceSent < 30) {
					return NextResponse.json(
						{
							error: `Cannot retry yet. Brief was sent to Make ${Math.round(minutesSinceSent)} minutes ago. Please wait at least 30 minutes before retrying.`,
							minutes_since_sent: Math.round(minutesSinceSent),
						},
						{ status: 400 }
					);
				}
			} catch (dateError) {
				console.warn('Failed to parse sent_to_make_at date:', dateError);
				// Continue with retry if date parsing fails
			}
		}

		// Reset status to "Approved" and clear error before retrying
		const resetRes = await fetch(
			`https://api.airtable.com/v0/${BASE_ID}/${CONTENTBRIEFS_TABLE}/${briefId}`,
			{
				method: 'PATCH',
				headers: {
					Authorization: `Bearer ${AIRTABLE_TOKEN}`,
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({
					fields: {
						status: 'Approved',
						last_error: null,
						// Clear sent_to_make_at to allow fresh retry
						sent_to_make_at: null,
					},
				}),
			}
		);

		if (!resetRes.ok) {
			const errorText = await resetRes.text();
			console.error('Failed to reset brief status:', errorText);
			return NextResponse.json(
				{ error: 'Failed to reset brief status for retry' },
				{ status: 502 }
			);
		}

		// Trigger content generation
		try {
			await triggerContentGenerationFromBrief(briefId);
		} catch (error: any) {
			console.error('Failed to retry content generation:', error);
			// Update brief with error
			await fetch(
				`https://api.airtable.com/v0/${BASE_ID}/${CONTENTBRIEFS_TABLE}/${briefId}`,
				{
					method: 'PATCH',
					headers: {
						Authorization: `Bearer ${AIRTABLE_TOKEN}`,
						'Content-Type': 'application/json',
					},
					body: JSON.stringify({
						fields: {
							status: 'Failed',
							last_error: `Retry failed: ${error?.message || 'Unknown error'}`,
						},
					}),
				}
			).catch(() => {}); // Ignore errors updating error field

			return NextResponse.json(
				{ error: 'Retry failed', details: error?.message },
				{ status: 500 }
			);
		}

		return NextResponse.json({
			ok: true,
			message: 'Content brief retry initiated. Content generation started.',
			brief_id: briefId,
		});
	} catch (error: any) {
		console.error('Error retrying content brief:', error);
		return NextResponse.json(
			{ error: error?.message || 'Server error' },
			{ status: 500 }
		);
	}
}
