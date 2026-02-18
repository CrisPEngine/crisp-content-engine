import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { getSupabaseService } from '@/lib/supabaseService';
import { isMetaPublishingEnabled } from '@/lib/featureFlags';

export const runtime = 'nodejs';

/**
 * Create Meta publish job with queue guard
 * Enforces 60s minimum spacing between posts per destination
 */
const createMetaPublishJob = async (
	userId: string,
	contentId: string,
	record: any,
	platform: 'facebook' | 'instagram'
) => {
	const admin = getSupabaseService();

	// Get brand profile ID
	const brandProfileId = Array.isArray(record.fields?.brand_profile_id)
		? record.fields.brand_profile_id[0]
		: record.fields?.brand_profile_id;

	if (!brandProfileId) {
		throw new Error('Missing brand_profile_id');
	}

	// Get content_item_key (idempotency key from generation)
	const contentItemKey = record.fields?.content_item_key || contentId;

	// Idempotency is enforced by the DB unique index on (platform, target_id, content_item_key).
	// No pre-check needed; we handle the constraint violation below on insert.

	// Get selected destination and verify token exists
	let targetId: string | null = null;

	if (platform === 'facebook') {
		const { data: selectedPage } = await admin
			.from('meta_pages')
			.select('page_id, page_access_token_encrypted')
			.eq('user_id', userId)
			.eq('is_selected', true)
			.maybeSingle();

		if (!selectedPage) {
			throw new Error('No Facebook Page selected. Connect and select a page first.');
		}

		// Verify page token exists (nullable for resilience, but required for publishing)
		if (!selectedPage.page_access_token_encrypted) {
			throw new Error('Facebook Page token is missing. Please reconnect your Meta account.');
		}

		targetId = selectedPage.page_id;
	} else if (platform === 'instagram') {
		const { data: selectedIg } = await admin
			.from('meta_instagram_accounts')
			.select('ig_user_id')
			.eq('user_id', userId)
			.eq('is_selected', true)
			.maybeSingle();

		if (!selectedIg) {
			throw new Error('No Instagram account selected. Connect and select an Instagram account first.');
		}

		targetId = selectedIg.ig_user_id;
	}

	if (!targetId) {
		throw new Error(`No destination selected for ${platform}`);
	}

	// Materialize payload (source of truth, never re-read Airtable)
	const hook = record.fields?.hook || record.fields?.title || record.fields?.post_title || '';
	const postContent = record.fields?.post_content || '';
	const hashtags = record.fields?.hashtags || '';
	// Build full post text: hook (opener) → body → hashtags
	const bodyParts: string[] = [];
	if (hook) bodyParts.push(hook);
	if (postContent) bodyParts.push(postContent);
	const baseText = bodyParts.join('\n\n');
	const fullText = hashtags ? `${baseText}\n\n${hashtags}` : baseText;
	const imageUrl = record.fields?.image_reference_url || null;

	const payload = {
		text: fullText,
		imageUrl,
		contentItemKey,
		platform,
		targetId,
		createdAt: new Date().toISOString(),
	};

	// Determine scheduled time with queue guard
	const rawScheduledTime = record.fields?.scheduled_time;
	let scheduledTime = rawScheduledTime ? new Date(rawScheduledTime) : new Date();

	// Scheduling strategy: Cron handles all timing, publishes immediately when due
	// No minimum delay needed (previously enforced 10min for FB scheduled_publish_time)
	// Ensure scheduled time is not in the past
	const now = new Date();
	if (scheduledTime < now) {
		scheduledTime = now;
	}

	// Queue guard: enforce 60s spacing per destination
	const { data: recentJobs } = await admin
		.from('publish_jobs')
		.select('scheduled_time')
		.eq('platform', platform)
		.eq('target_id', targetId)
		.order('scheduled_time', { ascending: false })
		.limit(1);

	if (recentJobs && recentJobs.length > 0) {
		const lastScheduledTime = new Date(recentJobs[0].scheduled_time);
		const sixtySecondsAfterLast = new Date(lastScheduledTime.getTime() + 60 * 1000);

		if (scheduledTime < sixtySecondsAfterLast) {
			scheduledTime = sixtySecondsAfterLast;
		}
	}

	// Create job (unique constraint prevents duplicates)
	const { error: insertError } = await admin
		.from('publish_jobs')
		.insert({
			user_id: userId,
			brand_profile_id: brandProfileId,
			content_item_key: contentItemKey,
			platform,
			target_id: targetId,
			status: 'queued',
			scheduled_time: scheduledTime.toISOString(),
			payload_json: payload,
			airtable_record_id: contentId,
		});

	if (insertError) {
		// Check if it's a duplicate (unique constraint violation)
		if (insertError.code === '23505') {
			console.log(`[Meta Job Creation] Duplicate job prevented for ${contentItemKey} (idempotency working)`);
			return; // Silently succeed (idempotent)
		}
		throw new Error(`Failed to create publish job: ${insertError.message}`);
	}

	console.log(`[Meta Job Creation] Created job for ${platform} (${contentItemKey}) scheduled at ${scheduledTime.toISOString()}`);
};

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
		const imagePromptUpdate = body?.image_prompt; // For editing image prompt
		const scheduledTime = body?.scheduled_time; // For updating scheduled time
		const imageUrl = body?.imageUrl; // For image upload
		const cloudinaryId = body?.cloudinaryId; // For image upload
		const imageSource = body?.source; // For image upload (should be "Brand")

		// Handle image update
		if (imageUrl !== undefined && cloudinaryId !== undefined) {
			const updateFields: Record<string, any> = {
				image_reference_url: String(imageUrl),
				image_cloudinary_id: String(cloudinaryId),
				// Only update image_generation_source if provided and it's a valid option
				// Valid options are: 'AI Generated', 'Stock', 'Brand'
				// If the field doesn't allow new options, we'll skip it to avoid permission errors
			};

			// Try to set image_generation_source, but don't fail if it's not allowed
			// The valid options in Airtable are: 'AI Generated', 'Stock', 'Brand'
			if (imageSource && ['AI Generated', 'Stock', 'Brand'].includes(imageSource)) {
				updateFields.image_generation_source = imageSource;
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
				// If the error is about image_generation_source, try again without it
				const errorMessage = patchResult?.error?.message || '';
				if (errorMessage.includes('image_generation_source') || errorMessage.includes('select option')) {
					// Retry without image_generation_source
					const retryFields: Record<string, any> = {
						image_reference_url: String(imageUrl),
						image_cloudinary_id: String(cloudinaryId),
					};
					
					const retryRes = await fetch(`https://api.airtable.com/v0/${BASE_ID}/${TABLE_ID}/${contentId}`, {
						method: 'PATCH',
						headers: {
							Authorization: `Bearer ${AIRTABLE_TOKEN}`,
							'Content-Type': 'application/json',
						},
						body: JSON.stringify({ fields: retryFields }),
					});

					if (!retryRes.ok) {
						const retryResult = await retryRes.json();
						return NextResponse.json(
							{ error: retryResult?.error?.message || 'Failed to update image' },
							{ status: 502 }
						);
					}

					// Success without image_generation_source
					return NextResponse.json({ ok: true, message: 'Image updated successfully (source field skipped)' });
				}

				return NextResponse.json(
					{ error: errorMessage || 'Failed to update image' },
					{ status: 502 }
				);
			}

			return NextResponse.json({ ok: true, message: 'Image updated successfully' });
		}

		// Handle content editing or scheduled time update
		if (
			contentUpdate !== undefined ||
			titleUpdate !== undefined ||
			hashtagsUpdate !== undefined ||
			imagePromptUpdate !== undefined ||
			scheduledTime !== undefined
		) {
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
			if (imagePromptUpdate !== undefined) {
				updateFields.image_prompt = String(imagePromptUpdate);
			}
			if (scheduledTime !== undefined) {
				// Validate X content before allowing scheduling
				const platform = record.fields?.platform || '';
				const postType = record.fields?.post_type || 'single';
				const postContent = record.fields?.post_content || '';
				const charCount = postContent.length;

				// Block scheduling for X threads (export-only in V1)
				if (platform === 'X' && postType === 'thread') {
					return NextResponse.json(
						{ error: 'X threads are export-only and cannot be scheduled. Use copy/paste to publish manually.' },
						{ status: 400 }
					);
				}

				// Block scheduling for X singles that exceed 280 chars
				if (platform === 'X' && postType === 'single' && charCount > 280) {
					return NextResponse.json(
						{ error: `Tweet is ${charCount} characters (max 280). Edit before scheduling.` },
						{ status: 400 }
					);
				}

				// Block scheduling for Blog posts (export-only in V1)
				if (platform === 'Blog') {
					return NextResponse.json(
						{ error: 'Blog posts are export-only and cannot be scheduled. Copy and publish to your blog manually.' },
						{ status: 400 }
					);
				}

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
			// Validate X content before approving
			const platform = record.fields?.platform || '';
			const postType = record.fields?.post_type || 'single';
			const postContent = record.fields?.post_content || '';
			const charCount = postContent.length;

			// Block approval for X threads (export-only in V1)
			if (platform === 'X' && postType === 'thread') {
				return NextResponse.json(
					{ error: 'X threads are export-only and cannot be approved for publishing. Use copy/paste to publish manually.' },
					{ status: 400 }
				);
			}

			// Block approval for X singles that exceed 280 chars
			if (platform === 'X' && postType === 'single' && charCount > 280) {
				return NextResponse.json(
					{ error: `Tweet is ${charCount} characters (max 280). Edit before approving.` },
					{ status: 400 }
				);
			}

			// Check if this is a Blog article - if so, mark as Published directly
			// LinkedIn and other social platforms go to "Ready To Publish" for scheduled publishing
			if (platform === 'Blog') {
				fields.status = 'Published';
				fields.published_at = nowISO;
			} else {
				fields.status = 'Ready To Publish';
			}
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
		// Publishing will be handled by the scheduled job at /api/publish/linkedin-due or /api/publish/meta-due
		// No Make.com webhook needed - all publishing is native

		// ============================================
		// Meta Publishing: Create publish_jobs
		// ============================================
		if (action === 'approve' && isMetaPublishingEnabled()) {
			const platform = record.fields?.platform || '';
			
			if (platform === 'Facebook' || platform === 'Instagram') {
				try {
					await createMetaPublishJob(
						user.id,
						contentId,
						record,
						platform.toLowerCase() as 'facebook' | 'instagram'
					);
				} catch (metaError: any) {
					console.error('[Meta Job Creation] Error:', metaError);
					// Don't fail the approval, but write the error to Airtable
					// so the UI can surface it (e.g. "Approved but not queued")
					try {
						await fetch(`https://api.airtable.com/v0/${BASE_ID}/${TABLE_ID}/${contentId}`, {
							method: 'PATCH',
							headers: {
								Authorization: `Bearer ${AIRTABLE_TOKEN}`,
								'Content-Type': 'application/json',
							},
							body: JSON.stringify({
								fields: {
									publish_error: `Meta job creation failed: ${metaError.message || 'Unknown error'}`,
								},
							}),
						});
					} catch (airtableErr) {
						console.error('[Meta Job Creation] Failed to write error to Airtable:', airtableErr);
					}
				}
			}
		}

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
			// Record doesn't exist or user doesn't own it - return success (idempotent delete)
			// This handles the case where record was already deleted from Airtable
			return NextResponse.json({ ok: true, message: 'Content item not found (may have been already deleted)' });
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
			// If record was already deleted (404), treat as success (idempotent)
			if (deleteRes.status === 404) {
				return NextResponse.json({ ok: true, message: 'Content already deleted' });
			}
			
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
