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

		// Log the webhook payload with timestamp
		const receivedAt = new Date().toISOString();
		console.log('[CONTENT WEBHOOK] Received at', receivedAt, ':', {
			mode,
			trigger_type,
			brief_id,
			ok,
			brand_profile_id,
			user_id,
			created_posts,
			created_articles,
			generated_content_ids_count: Array.isArray(generated_content_ids) ? generated_content_ids.length : (generated_content_ids ? 1 : 0),
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
					// If generated_content_ids is provided, check those specific records instead
					let checkUrl: URL;
					if (Array.isArray(generated_content_ids) && generated_content_ids.length > 0) {
						// Check specific records that Make.com claims to have created
						const recordIds = generated_content_ids.slice(0, 10); // Limit to 10 for formula length
						const recordFilters = recordIds.map(id => `RECORD_ID() = "${id}"`).join(',');
						checkUrl = new URL(`https://api.airtable.com/v0/${BASE_ID}/${TABLE_ID}`);
						checkUrl.searchParams.set('filterByFormula', `OR(${recordFilters})`);
						checkUrl.searchParams.set('maxRecords', String(recordIds.length));
					} else {
						// Fallback: Check any records for this brand profile
						checkUrl = new URL(`https://api.airtable.com/v0/${BASE_ID}/${TABLE_ID}`);
						checkUrl.searchParams.set('filterByFormula', `{brand_profile_id} = "${brand_profile_id}"`);
						checkUrl.searchParams.set('maxRecords', '5');
					}

					const checkRes = await fetch(checkUrl.toString(), {
						headers: {
							Authorization: `Bearer ${AIRTABLE_TOKEN}`,
							'Content-Type': 'application/json',
						},
					});

					if (checkRes.ok) {
						const checkData = await checkRes.json();
						const records = checkData.records || [];
						
						if (Array.isArray(generated_content_ids) && generated_content_ids.length > 0) {
							const foundIds = records.map((r: any) => r.id);
							const missingIds = generated_content_ids.filter((id: string) => !foundIds.includes(id));
							console.log(`[CONTENT WEBHOOK] Make.com claims ${generated_content_ids.length} records created, found ${records.length} in Airtable`);
							if (missingIds.length > 0) {
								console.warn(`[CONTENT WEBHOOK] Missing ${missingIds.length} records that Make.com claims were created:`, missingIds.slice(0, 5));
							}
						} else {
							console.log(`[CONTENT WEBHOOK] Found ${records.length} content records in Airtable for brand_profile_id: ${brand_profile_id}`);
						}
						
						// Log status of each record
						records.forEach((record: any, index: number) => {
							console.log(`[CONTENT WEBHOOK] Record ${index + 1}:`, {
								id: record.id,
								status: record.fields?.status || 'NO STATUS',
								title: record.fields?.title || record.fields?.post_title || 'NO TITLE',
								platform: record.fields?.platform || 'NO PLATFORM',
								brand_profile_id: record.fields?.brand_profile_id || 'NO BRAND_PROFILE_ID',
								content_brief_id: record.fields?.content_brief_id || 'NO BRIEF_ID',
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
					// Fetch current brief status for idempotency check
					const briefCheckRes = await fetch(
						`https://api.airtable.com/v0/${BASE_ID}/${CONTENTBRIEFS_TABLE}/${brief_id}`,
						{
							headers: {
								Authorization: `Bearer ${AIRTABLE_TOKEN}`,
								'Content-Type': 'application/json',
							},
						}
					);

					if (briefCheckRes.ok) {
						const briefCheckData = await briefCheckRes.json();
						const currentStatus = briefCheckData.fields?.status || '';

						// Idempotency: Ignore duplicate callbacks for completed briefs
						if (currentStatus === 'Generation Completed') {
							console.log(`[CONTENT WEBHOOK] Ignoring duplicate callback for completed brief ${brief_id}`);
							return NextResponse.json({ ok: true, received: true, message: 'Duplicate callback ignored' }, { status: 200 });
						}

						// Only update if not already completed
						if (currentStatus !== 'Generation Completed') {
							const updateFields: any = {};
							
							if (ok) {
								updateFields.status = 'Generation Completed';
								updateFields.generation_completed_at = new Date().toISOString();
								
								if (generated_content_ids) {
									// Store generated content IDs if provided
									const contentIdsJson = Array.isArray(generated_content_ids)
										? JSON.stringify(generated_content_ids)
										: String(generated_content_ids);
									updateFields.generated_content_ids = contentIdsJson;
								}
							} else {
								updateFields.status = 'Failed';
								updateFields.generation_completed_at = new Date().toISOString();
								// Use error_message from payload if provided, otherwise fallback to status
								updateFields.last_error = body.error_message || status || 'Content generation failed';
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
											// Include content_brief_id in deep link for traceability
											const contentUrl = `${appUrl}/content/approval?brand_profile_id=${brand_profile_id}${brief_id ? `&content_brief_id=${brief_id}` : ''}`;
											
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
						}
					} else {
						console.warn(`[CONTENT WEBHOOK] Failed to fetch brief ${brief_id} for status check`);
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

