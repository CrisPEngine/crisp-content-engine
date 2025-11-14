import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient, type CookieOptions } from '@supabase/ssr';

export const runtime = 'nodejs';

const fetchRecordForUser = async (contentId: string, userId: string, baseId: string, tableId: string, token: string) => {
	const url = new URL(`https://api.airtable.com/v0/${baseId}/${tableId}`);
	const filter = `AND(RECORD_ID() = "${contentId}", {user_id} = "${userId}")`;
	url.searchParams.set('filterByFormula', filter);
	url.searchParams.set('pageSize', '1');

	const res = await fetch(url.toString(), {
		method: 'GET',
		headers: {
			Authorization: `Bearer ${token}`,
			'Content-Type': 'application/json',
		},
	});

	const data = await res.json();
	if (!res.ok) {
		throw new Error(data?.error?.message || 'Failed to load content item');
	}

	return data.records?.[0] ?? null;
};

export async function PATCH(request: Request, context: { params: Promise<{ contentId: string }> }) {
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

		const AIRTABLE_TOKEN = process.env.AIRTABLE_PAT;
		const BASE_ID = process.env.AIRTABLE_BASE_ID;
		const TABLE_ID = process.env.AIRTABLE_CONTENTQUEUE_TABLE;

		if (!AIRTABLE_TOKEN || !BASE_ID || !TABLE_ID) {
			return NextResponse.json(
				{ error: 'Airtable configuration missing. Please contact support.' },
				{ status: 500 }
			);
		}

		const { contentId } = await context.params;
		const record = await fetchRecordForUser(contentId, user.id, BASE_ID, TABLE_ID, AIRTABLE_TOKEN);
		if (!record) {
			return NextResponse.json({ error: 'Content item not found' }, { status: 404 });
		}

		const body = await request.json().catch(() => ({}));
		const action = body?.action;
		const feedback: string = body?.feedback || '';

		if (!['approve', 'reject'].includes(action)) {
			return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
		}

		const nowISO = new Date().toISOString();
		const fields: Record<string, any> = {
			review_notes: feedback,
		};

		if (action === 'approve') {
			fields.status = 'Ready To Publish';
			fields.approved_at = nowISO;
			fields.last_reviewed_at = nowISO;
		} else {
			// Reject action - trigger Make to regenerate content
			fields.status = 'Needs Review';
			fields.needs_revision = true;
			fields.last_reviewed_at = nowISO;
			fields.rejection_feedback = feedback;

			// Trigger Make to regenerate content
			const MAKE_CONTENT_REGENERATE_WEBHOOK_URL = process.env.MAKE_CONTENT_REGENERATE_WEBHOOK_URL;
			if (MAKE_CONTENT_REGENERATE_WEBHOOK_URL) {
				try {
					// Get brand profile ID from the content record
					const brandProfileId = record.fields?.brand_profile_id;
					
					await fetch(MAKE_CONTENT_REGENERATE_WEBHOOK_URL, {
						method: 'POST',
						headers: {
							'Content-Type': 'application/json',
							...(process.env.MAKE_API_KEY && {
								'x-api-key': process.env.MAKE_API_KEY,
							}),
						},
						body: JSON.stringify({
							content_id: contentId,
							brand_profile_id: brandProfileId,
							user_id: user.id,
							rejection_feedback: feedback,
							rejected_at: nowISO,
						}),
					});
				} catch (webhookError) {
					// Log but don't fail the request if webhook fails
					console.error('Make content regeneration webhook error:', webhookError);
				}
			}
		}

		const patchRes = await fetch(`https://api.airtable.com/v0/${BASE_ID}/${TABLE_ID}/${contentId}`, {
			method: 'PATCH',
			headers: {
				Authorization: `Bearer ${AIRTABLE_TOKEN}`,
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({ fields }),
		});

		const patchResult = await patchRes.json();
		if (!patchRes.ok) {
			console.error('Airtable content update error:', patchResult);
			return NextResponse.json(
				{ error: patchResult?.error?.message || 'Failed to update content item' },
				{ status: 502 }
			);
		}

		return NextResponse.json({ ok: true, record: patchResult });
	} catch (error: any) {
		console.error('content queue PATCH error:', error);
		return NextResponse.json({ error: error?.message || 'Server error' }, { status: 500 });
	}
}
