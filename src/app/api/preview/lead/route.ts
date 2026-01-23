import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSupabaseService } from '@/lib/supabaseService';
import { sendEmail } from '@/lib/email/sendEmail';
import { PreviewPackEmail } from '@/emails/product/PreviewPackEmail';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const requestSchema = z.object({
	previewSessionId: z.string().min(1).optional(), // For anonymous users
	previewPackId: z.string().uuid().optional(), // For logged-in users
	email: z.string().email(),
	persona: z.string().optional(),
	topics: z.any().optional(),
	tone: z.string().optional(),
	goal: z.string().optional(),
	utm_source: z.string().optional().nullable(),
	utm_medium: z.string().optional().nullable(),
	utm_campaign: z.string().optional().nullable(),
	utm_content: z.string().optional().nullable(),
	referrer: z.string().optional().nullable(),
	landing_path: z.string().optional().nullable(),
	locale: z.string().optional().nullable(),
	channel_selected: z.string().optional().nullable(),
	channel: z.string().optional(), // Legacy field
});

export async function POST(req: Request) {
	try {
		const body = await req.json().catch(() => ({}));
		const data = requestSchema.parse(body);

		// Must have either previewSessionId or previewPackId
		if (!data.previewSessionId && !data.previewPackId) {
			return NextResponse.json({ error: 'previewSessionId or previewPackId is required' }, { status: 400 });
		}

		const admin = getSupabaseService();
		let previewPackId: string | null = null;
		let session: any = null;

		// For logged-in users with previewPackId
		if (data.previewPackId) {
			const { data: pack, error: packError } = await admin
				.from('preview_packs')
				.select('*')
				.eq('id', data.previewPackId)
				.maybeSingle();

			if (packError || !pack) {
				return NextResponse.json({ error: 'Preview pack not found' }, { status: 404 });
			}
			previewPackId = pack.id;
			session = pack;
		} else if (data.previewSessionId) {
			// For anonymous users with previewSessionId
			const { data: sessionData, error: sessionError } = await admin
				.from('preview_sessions')
				.select('*')
				.eq('preview_session_id', data.previewSessionId)
				.maybeSingle();

			if (sessionError || !sessionData) {
				return NextResponse.json({ error: 'Preview session not found' }, { status: 404 });
			}
			session = sessionData;
		}

		// Get Airtable config
		const AIRTABLE_TOKEN = process.env.AIRTABLE_PAT;
		const BASE_ID = process.env.AIRTABLE_BASE_ID;
		const PREVIEW_LEADS_TABLE = process.env.AIRTABLE_PREVIEW_LEADS_TABLE || 'PreviewLeads';

		if (!AIRTABLE_TOKEN || !BASE_ID) {
			console.error('[Preview Lead] Airtable config missing');
			return NextResponse.json({ error: 'Configuration error' }, { status: 500 });
		}

		// Build dedupe key - use previewPackId if available, otherwise previewSessionId
		const dedupeKey = previewPackId || data.previewSessionId;
		const dedupeField = previewPackId ? 'preview_pack_id' : 'preview_session_id';

		// Check if lead already exists (de-dupe by email + previewPackId or previewSessionId)
		const searchFormula = previewPackId
			? `AND({email} = "${data.email.replace(/"/g, '""')}", {preview_pack_id} = "${previewPackId}")`
			: `AND({email} = "${data.email.replace(/"/g, '""')}", {preview_session_id} = "${data.previewSessionId}")`;
		
		const searchUrl = `https://api.airtable.com/v0/${BASE_ID}/${PREVIEW_LEADS_TABLE}?filterByFormula=${encodeURIComponent(searchFormula)}`;
		const searchRes = await fetch(searchUrl, {
			headers: {
				Authorization: `Bearer ${AIRTABLE_TOKEN}`,
			},
		});

		let existingRecord: any = null;
		if (searchRes.ok) {
			const searchData = await searchRes.json();
			if (searchData.records && searchData.records.length > 0) {
				existingRecord = searchData.records[0];
			}
		}

		const convertedAtValue = new Date().toISOString().split('T')[0]; // Format: YYYY-MM-DD for Airtable Date field
		
		const leadPayload: any = {
			fields: {
				email: data.email,
				persona: data.persona || session.persona || null,
				topics: data.topics || session.topics ? JSON.stringify(data.topics || session.topics) : null,
				tone: data.tone || session.tone || null,
				goal: data.goal || session.goal || null,
				channel: data.channel_selected || data.channel || session.channel || 'LinkedIn',
				converted_at: convertedAtValue,
				// Attribution fields
				utm_source: data.utm_source || null,
				utm_medium: data.utm_medium || null,
				utm_campaign: data.utm_campaign || null,
				utm_content: data.utm_content || null,
				referrer: data.referrer || null,
				landing_path: data.landing_path || null,
				locale: data.locale || null,
			},
		};

		// Add the appropriate ID field
		if (previewPackId) {
			leadPayload.fields.preview_pack_id = previewPackId;
		} else {
			leadPayload.fields.preview_session_id = data.previewSessionId;
		}

		console.log('[Preview Lead] Payload converted_at value:', convertedAtValue);

		let isNewRecord = false;
		if (existingRecord) {
			// Update existing record
			const updateRes = await fetch(`https://api.airtable.com/v0/${BASE_ID}/${PREVIEW_LEADS_TABLE}/${existingRecord.id}`, {
				method: 'PATCH',
				headers: {
					Authorization: `Bearer ${AIRTABLE_TOKEN}`,
					'Content-Type': 'application/json',
				},
				body: JSON.stringify(leadPayload),
			});

			if (!updateRes.ok) {
				const errorData = await updateRes.json();
				console.error('[Preview Lead] Airtable update error:', errorData);
				console.error('[Preview Lead] Payload sent:', JSON.stringify(leadPayload, null, 2));
				return NextResponse.json({ error: 'Failed to save lead' }, { status: 422 });
			}

			console.log('[Preview Lead] Updated existing lead', { email: data.email, dedupeKey });
		} else {
			// Create new record
			const createRes = await fetch(`https://api.airtable.com/v0/${BASE_ID}/${PREVIEW_LEADS_TABLE}`, {
				method: 'POST',
				headers: {
					Authorization: `Bearer ${AIRTABLE_TOKEN}`,
					'Content-Type': 'application/json',
				},
				body: JSON.stringify(leadPayload),
			});

			if (!createRes.ok) {
				const errorData = await createRes.json();
				console.error('[Preview Lead] Airtable create error:', errorData);
				console.error('[Preview Lead] Payload sent:', JSON.stringify(leadPayload, null, 2));
				return NextResponse.json({ error: 'Failed to save lead' }, { status: 422 });
			}

			isNewRecord = true;
			console.log('[Preview Lead] Created new lead', { email: data.email, dedupeKey });
		}

		// Send email if this is a new record and we have a preview pack URL
		let emailSent = false;
		if (isNewRecord && previewPackId) {
			try {
				const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.crispdigital.io';
				const previewPackUrl = `${appUrl}/preview?preview_pack_id=${previewPackId}`;
				const appHomeUrl = appUrl;

				// Extract first name from email if possible (simple heuristic)
				const firstName = data.email.split('@')[0].split('.')[0];
				const capitalizedFirstName = firstName.charAt(0).toUpperCase() + firstName.slice(1);

				await sendEmail({
					to: data.email,
					subject: 'Your content pack is ready',
					react: PreviewPackEmail({
						previewPackUrl,
						appHomeUrl,
						firstName: capitalizedFirstName,
					}),
					category: 'system',
				});

				emailSent = true;
				console.log('[Preview Lead] Email sent successfully', { email: data.email, previewPackId });
			} catch (emailError: any) {
				// Don't fail the request if email fails
				console.error('[Preview Lead] Email send failed (non-blocking):', emailError?.message || emailError);
			}
		}

		return NextResponse.json({ 
			ok: true,
			emailSent,
			previewPackId: previewPackId || null,
		});
	} catch (error: any) {
		console.error('[Preview Lead] Error:', error);
		if (error instanceof z.ZodError) {
			return NextResponse.json({ error: 'Invalid request body', details: error.issues }, { status: 400 });
		}
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
	}
}
