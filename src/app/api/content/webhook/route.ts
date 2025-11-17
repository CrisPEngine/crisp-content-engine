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
			ok,
			brand_profile_id,
			user_id,
			created_posts,
			created_articles,
			status,
			timestamp,
		} = body;

		// Log the webhook payload
		console.log('[CONTENT WEBHOOK] Received:', {
			mode,
			ok,
			brand_profile_id,
			user_id,
			created_posts,
			created_articles,
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

		// TODO: You can extend this later to:
		// - Update BrandProfiles status in Airtable
		// - Verify ContentQueue records have correct status
		// - Trigger notifications to users
		// - Update usage statistics

		// For now, just acknowledge receipt
		return NextResponse.json({ ok: true, received: true }, { status: 200 });
	} catch (err: any) {
		console.error('[CONTENT WEBHOOK ERROR]', err);
		return NextResponse.json({ ok: false, error: 'Internal error', details: err?.message }, { status: 500 });
	}
}

