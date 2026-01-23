import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSupabaseService } from '@/lib/supabaseService';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const requestSchema = z.object({
	previewSessionId: z.string().min(1),
	email: z.string().email(),
	persona: z.string().optional(),
	topics: z.any().optional(),
	tone: z.string().optional(),
	goal: z.string().optional(),
	utm_source: z.string().optional().nullable(),
	utm_campaign: z.string().optional().nullable(),
	channel: z.string().optional(),
});

export async function POST(req: Request) {
	try {
		const body = await req.json().catch(() => ({}));
		const data = requestSchema.parse(body);

		// Validate preview session exists
		const admin = getSupabaseService();
		const { data: session, error: sessionError } = await admin
			.from('preview_sessions')
			.select('*')
			.eq('preview_session_id', data.previewSessionId)
			.maybeSingle();

		if (sessionError || !session) {
			return NextResponse.json({ error: 'Preview session not found' }, { status: 404 });
		}

		// Get Airtable config
		const AIRTABLE_TOKEN = process.env.AIRTABLE_PAT;
		const BASE_ID = process.env.AIRTABLE_BASE_ID;
		const PREVIEW_LEADS_TABLE = process.env.AIRTABLE_PREVIEW_LEADS_TABLE || 'PreviewLeads';

		if (!AIRTABLE_TOKEN || !BASE_ID) {
			console.error('[Preview Lead] Airtable config missing');
			return NextResponse.json({ error: 'Configuration error' }, { status: 500 });
		}

		// Check if lead already exists (de-dupe by email + previewSessionId)
		const searchUrl = `https://api.airtable.com/v0/${BASE_ID}/${PREVIEW_LEADS_TABLE}?filterByFormula=${encodeURIComponent(`AND({email} = "${data.email.replace(/"/g, '""')}", {preview_session_id} = "${data.previewSessionId}")`)}`;
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

		const leadPayload = {
			fields: {
				email: data.email,
				preview_session_id: data.previewSessionId,
				persona: data.persona || session.persona || null,
				topics: data.topics || session.topics ? JSON.stringify(data.topics || session.topics) : null,
				tone: data.tone || session.tone || null,
				goal: data.goal || session.goal || null,
				utm_source: data.utm_source || session.utm_source || null,
				utm_campaign: data.utm_campaign || session.utm_campaign || null,
				channel: data.channel || 'LinkedIn',
				converted_at: new Date().toISOString(),
			},
		};

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
				return NextResponse.json({ error: 'Failed to save lead' }, { status: 422 });
			}

			console.log('[Preview Lead] Updated existing lead', { email: data.email, previewSessionId: data.previewSessionId });
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
				return NextResponse.json({ error: 'Failed to save lead' }, { status: 422 });
			}

			console.log('[Preview Lead] Created new lead', { email: data.email, previewSessionId: data.previewSessionId });
		}

		return NextResponse.json({ ok: true });
	} catch (error: any) {
		console.error('[Preview Lead] Error:', error);
		if (error instanceof z.ZodError) {
			return NextResponse.json({ error: 'Invalid request body', details: error.issues }, { status: 400 });
		}
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
	}
}
