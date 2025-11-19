import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient, type CookieOptions } from '@supabase/ssr';

export const runtime = 'nodejs';

const fetchRecordForUser = async (
	contentId: string,
	userId: string,
	baseId: string,
	tableId: string,
	brandProfilesTable: string,
	token: string
) => {
	// First, get user's brand profiles
	const brandProfilesUrl = new URL(`https://api.airtable.com/v0/${baseId}/${brandProfilesTable}`);
	brandProfilesUrl.searchParams.set('filterByFormula', `{user_id} = "${userId}"`);
	brandProfilesUrl.searchParams.set('maxRecords', '100');

	const brandProfilesRes = await fetch(brandProfilesUrl.toString(), {
		headers: {
			Authorization: `Bearer ${token}`,
			'Content-Type': 'application/json',
		},
	});

	let brandProfileIds: string[] = [];
	if (brandProfilesRes.ok) {
		const brandProfilesData = await brandProfilesRes.json();
		brandProfileIds = (brandProfilesData.records || []).map((r: any) => r.id);
	}

	if (brandProfileIds.length === 0) {
		return null; // User has no brand profiles
	}

	// Fetch the content record directly
	const contentUrl = new URL(`https://api.airtable.com/v0/${baseId}/${tableId}/${contentId}`);
	const contentRes = await fetch(contentUrl.toString(), {
		headers: {
			Authorization: `Bearer ${token}`,
			'Content-Type': 'application/json',
		},
	});

	if (!contentRes.ok) {
		const data = await contentRes.json();
		throw new Error(data?.error?.message || 'Failed to load content item');
	}

	const record = await contentRes.json();
	if (!record) {
		return null;
	}

	// Verify ownership via brand_profile_id
	const recordBrandProfileId = Array.isArray(record.fields?.brand_profile_id)
		? record.fields.brand_profile_id[0]
		: record.fields?.brand_profile_id;

	if (!recordBrandProfileId || !brandProfileIds.includes(recordBrandProfileId)) {
		return null; // User doesn't own this content
	}

	return record;
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
		const BRANDPROFILES_TABLE = process.env.AIRTABLE_BRANDPROFILES_TABLE;

		if (!AIRTABLE_TOKEN || !BASE_ID || !TABLE_ID || !BRANDPROFILES_TABLE) {
			return NextResponse.json(
				{ error: 'Airtable configuration missing. Please contact support.' },
				{ status: 500 }
			);
		}

		const { contentId } = await context.params;
		const record = await fetchRecordForUser(contentId, user.id, BASE_ID, TABLE_ID, BRANDPROFILES_TABLE, AIRTABLE_TOKEN);
		if (!record) {
			return NextResponse.json({ error: 'Content item not found or unauthorized' }, { status: 404 });
		}

		const body = await request.json().catch(() => ({}));
		const action = body?.action;
		const feedback: string = body?.feedback || '';
		const contentUpdate = body?.content; // For editing content
		const titleUpdate = body?.title; // For editing title (hook field)
		const hashtagsUpdate = body?.hashtags; // For editing hashtags
		const scheduledTime = body?.scheduled_time; // For updating scheduled time

		// Handle content editing or scheduled time update
		if (contentUpdate !== undefined || titleUpdate !== undefined || hashtagsUpdate !== undefined || scheduledTime !== undefined) {
			const updateFields: Record<string, any> = {};
			if (contentUpdate !== undefined) {
				updateFields.post_content = String(contentUpdate);
			}
			if (titleUpdate !== undefined) {
				updateFields.hook = String(titleUpdate);
			}
			if (hashtagsUpdate !== undefined) {
				updateFields.hashtags = String(hashtagsUpdate);
			}
			if (scheduledTime !== undefined) {
				updateFields.scheduled_time = scheduledTime ? String(scheduledTime) : null;
			}

			const patchRes = await fetch(`https://api.airtable.com/v0/${BASE_ID}/${TABLE_ID}/${contentId}`, {
				method: 'PATCH',
				headers: {
					Authorization: `Bearer ${AIRTABLE_TOKEN}`,
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({ fields: updateFields }),
			});

			if (!patchRes.ok) {
				const patchResult = await patchRes.json();
				return NextResponse.json(
					{ error: patchResult?.error?.message || 'Failed to update content' },
					{ status: 502 }
				);
			}

			return NextResponse.json({ ok: true, message: 'Content updated successfully' });
		}

		// Handle approve/reject actions
		if (!action || !['approve', 'reject'].includes(action)) {
			return NextResponse.json({ error: 'Invalid action or missing action' }, { status: 400 });
		}

		const nowISO = new Date().toISOString();
		const fields: Record<string, any> = {};

		if (action === 'approve') {
			fields.status = 'Ready To Publish';
			fields.approved_at = nowISO;
			// Only include review_notes if the field exists and feedback is provided
			if (feedback && feedback.trim()) {
				// Note: review_notes field may not exist in Airtable, so we'll skip it if it causes errors
				// fields.review_notes = feedback;
			}
		} else {
			// Reject action - trigger Make to regenerate content
			fields.status = 'Needs Review';
			fields.needs_revision = true;
			// Only include rejection_feedback if the field exists and feedback is provided
			if (feedback && feedback.trim()) {
				fields.rejection_feedback = feedback;
			}

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

		// Content approval: Status is now "Ready To Publish"
		// Publishing will be handled by the scheduled job at /api/publish/linkedin-due
		// No Make.com webhook needed - all publishing is native

		return NextResponse.json({ ok: true, record: patchResult });
	} catch (error: any) {
		console.error('content queue PATCH error:', error);
		return NextResponse.json({ error: error?.message || 'Server error' }, { status: 500 });
	}
}

export async function DELETE(request: Request, context: { params: Promise<{ contentId: string }> }) {
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
		const BRANDPROFILES_TABLE = process.env.AIRTABLE_BRANDPROFILES_TABLE;

		if (!AIRTABLE_TOKEN || !BASE_ID || !TABLE_ID || !BRANDPROFILES_TABLE) {
			return NextResponse.json(
				{ error: 'Airtable configuration missing. Please contact support.' },
				{ status: 500 }
			);
		}

		const { contentId } = await context.params;
		
		// Verify user owns this content before deleting
		const record = await fetchRecordForUser(contentId, user.id, BASE_ID, TABLE_ID, BRANDPROFILES_TABLE, AIRTABLE_TOKEN);
		if (!record) {
			return NextResponse.json({ error: 'Content item not found or unauthorized' }, { status: 404 });
		}

		// Delete the record from Airtable
		const deleteRes = await fetch(`https://api.airtable.com/v0/${BASE_ID}/${TABLE_ID}/${contentId}`, {
			method: 'DELETE',
			headers: {
				Authorization: `Bearer ${AIRTABLE_TOKEN}`,
				'Content-Type': 'application/json',
			},
		});

		if (!deleteRes.ok) {
			const deleteResult = await deleteRes.json();
			console.error('Airtable delete error:', deleteResult);
			return NextResponse.json(
				{ error: deleteResult?.error?.message || 'Failed to delete content item' },
				{ status: 502 }
			);
		}

		return NextResponse.json({ ok: true, message: 'Content deleted successfully' });
	} catch (error: any) {
		console.error('content queue DELETE error:', error);
		return NextResponse.json({ error: error?.message || 'Server error' }, { status: 500 });
	}
}
