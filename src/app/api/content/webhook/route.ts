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

		// TODO: You can extend this later to:
		// - Update BrandProfiles status in Airtable
		// - Create/update ContentQueue records
		// - Trigger notifications to users
		// - Update usage statistics

		// For now, just acknowledge receipt
		return NextResponse.json({ ok: true, received: true }, { status: 200 });
	} catch (err: any) {
		console.error('[CONTENT WEBHOOK ERROR]', err);
		return NextResponse.json({ ok: false, error: 'Internal error', details: err?.message }, { status: 500 });
	}
}

