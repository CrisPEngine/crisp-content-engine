import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

const CONTENT_WEBHOOK_SECRET =
	process.env.MAKE_CONTENT_WEBHOOK_SECRET || process.env.MAKE_SHARED_SECRET || 'crisp_engine';

export async function POST(req: NextRequest) {
	try {
		const secret = req.headers.get('x-make-secret') || '';

		if (secret !== CONTENT_WEBHOOK_SECRET) {
			console.warn('[CONTENT WEBHOOK] Unauthorized - secret mismatch');
			return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
		}

		const body = await req.json();

		// Destructure expected fields
		const {
			mode,
			trigger_type,
			brief_id,
			ok,
			brand_profile_id,
			user_id,
			created_posts,
			created_articles,
			generated_content_ids,
			status,
			timestamp,
		} = body;

		// Log the webhook payload
		console.log('[CONTENT WEBHOOK] Received:', {
			mode,
			trigger_type,
			brief_id,
			ok,
			brand_profile_id,
			user_id,
			created_posts,
			created_articles,
			generated_content_ids,
			status,
			timestamp,
		});

		// Verify content was created in Airtable by checking ContentQueue
		if (ok && brand_profile_id) {
			try {
				const AIRTABLE_TOKEN = process.env.AIRTABLE_PAT;
				const BASE_ID = process.env.AIRTABLE_BASE_ID;
				const TABLE_ID = process.env.AIRTABLE_CONTENTQUEUE_TABLE;

				if (AIRTABLE_TOKEN && BASE_ID && TABLE_ID) {
					// Check if content exists for this brand profile
					const checkUrl = new URL(`https://api.airtable.com/v0/${BASE_ID}/${TABLE_ID}`);
					checkUrl.searchParams.set('filterByFormula', `{brand_profile_id} = "${brand_profile_id}"`);
					checkUrl.searchParams.set('maxRecords', '5');

					const checkRes = await fetch(checkUrl.toString(), {
						headers: {
							Authorization: `Bearer ${AIRTABLE_TOKEN}`,
							'Content-Type': 'application/json',
						},
					});

					if (checkRes.ok) {
						const checkData = await checkRes.json();
						const records = checkData.records || [];
						console.log(`[CONTENT WEBHOOK] Found ${records.length} content records in Airtable for brand_profile_id: ${brand_profile_id}`);
						
						// Log status of each record
						records.forEach((record: any, index: number) => {
							console.log(`[CONTENT WEBHOOK] Record ${index + 1}:`, {
								id: record.id,
								status: record.fields?.status || 'NO STATUS',
								title: record.fields?.title || record.fields?.post_title || 'NO TITLE',
								platform: record.fields?.platform || 'NO PLATFORM',
								brand_profile_id: record.fields?.brand_profile_id || 'NO BRAND_PROFILE_ID',
							});
						});
					} else {
						const errorText = await checkRes.text();
						console.warn('[CONTENT WEBHOOK] Failed to check Airtable:', errorText);
					}
				}
			} catch (checkError: any) {
				console.error('[CONTENT WEBHOOK] Error checking Airtable:', checkError);
			}
		}

		// Handle content brief completion
		if (mode === 'content_generation' && trigger_type === 'content_brief_approved' && brief_id) {
			const AIRTABLE_TOKEN = process.env.AIRTABLE_PAT;
			const BASE_ID = process.env.AIRTABLE_BASE_ID;
			const CONTENTBRIEFS_TABLE = process.env.AIRTABLE_STRATEGYUPDATES_TABLE;

			if (AIRTABLE_TOKEN && BASE_ID && CONTENTBRIEFS_TABLE) {
				try {
					const updateFields: any = {
						status: ok ? 'Generation Completed' : 'Failed',
						generation_completed_at: new Date().toISOString(),
					};

					if (ok && generated_content_ids) {
						// Store generated content IDs if provided
						const contentIdsJson = Array.isArray(generated_content_ids)
							? JSON.stringify(generated_content_ids)
							: String(generated_content_ids);
						updateFields.generated_content_ids = contentIdsJson;
					}

					if (!ok) {
						updateFields.last_error = status || 'Content generation failed';
					}

					const updateRes = await fetch(
						`https://api.airtable.com/v0/${BASE_ID}/${CONTENTBRIEFS_TABLE}/${brief_id}`,
						{
							method: 'PATCH',
							headers: {
								Authorization: `Bearer ${AIRTABLE_TOKEN}`,
								'Content-Type': 'application/json',
							},
							body: JSON.stringify({ fields: updateFields }),
						}
					);

					if (updateRes.ok) {
						console.log('[CONTENT WEBHOOK] Updated content brief status to:', updateFields.status);
						
						// Send email notification if generation completed successfully
						if (ok && user_id) {
							try {
								const { sendEmail } = await import('@/lib/email/sendEmail');
								const { ContentReadyEmail } = await import('@/emails/product/ContentReadyEmail');
								
								// Get user email from Supabase
								const { getSupabaseService } = await import('@/lib/supabaseService');
								const admin = getSupabaseService();
								const { data: profile } = await admin
									.from('profiles')
									.select('email, full_name')
									.eq('id', user_id)
									.maybeSingle();

								if (profile?.email) {
									const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.crispdigital.io';
									const contentUrl = `${appUrl}/content/approval?brand_profile_id=${brand_profile_id}`;
									
									await sendEmail({
										to: profile.email,
										subject: 'New content ready for approval',
										react: ContentReadyEmail({
											userName: profile.full_name || 'there',
											contentUrl,
											brandName: brand_profile_id, // Could fetch actual brand name if needed
										}),
										category: 'content',
									});

									console.log('[CONTENT WEBHOOK] Sent content ready email to:', profile.email);
								}
							} catch (emailError) {
								console.error('[CONTENT WEBHOOK] Failed to send email:', emailError);
								// Don't fail the webhook if email fails
							}
						}
					} else {
						const errorText = await updateRes.text();
						console.error('[CONTENT WEBHOOK] Failed to update content brief:', errorText);
					}
				} catch (briefError) {
					console.error('[CONTENT WEBHOOK] Error updating content brief:', briefError);
					// Don't fail the webhook if brief update fails
				}
			}
		}

		// For now, just acknowledge receipt
		return NextResponse.json({ ok: true, received: true }, { status: 200 });
	} catch (err: any) {
		console.error('[CONTENT WEBHOOK ERROR]', err);
		return NextResponse.json({ ok: false, error: 'Internal error', details: err?.message }, { status: 500 });
	}
}

