import { NextResponse } from 'next/server';
import { z } from 'zod';
import { activateBrandFromOnboarding } from '@/lib/intelligence/onboarding/activateFromOnboarding';
import { getIntelligenceStore } from '@/lib/intelligence/actions';
import { jsonError, requireIntelligenceUser } from '@/lib/intelligence/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const schema = z.object({
	airtableBrandId: z.string().min(1),
});

type AirtableRecord = { id: string; fields?: Record<string, unknown> };

function fieldString(fields: Record<string, unknown>, key: string): string {
	const value = fields[key];
	return typeof value === 'string' ? value : '';
}

function fieldArray(fields: Record<string, unknown>, key: string): string[] {
	const value = fields[key];
	if (Array.isArray(value)) return value.filter((item): item is string => typeof item === 'string');
	return [];
}

export async function POST(request: Request) {
	try {
		const { userId } = await requireIntelligenceUser();
		const body = schema.parse(await request.json());
		const token = process.env.AIRTABLE_PAT;
		const base = process.env.AIRTABLE_BASE_ID;
		const table = process.env.AIRTABLE_BRANDPROFILES_TABLE;
		if (!token || !base || !table) {
			return NextResponse.json({ error: 'Airtable is not configured for activation.' }, { status: 500 });
		}

		const store = getIntelligenceStore();
		const existing = await store.getBrandBrain(userId, body.airtableBrandId);
		if (existing) {
			return NextResponse.json({
				ok: true,
				alreadyActive: true,
				brandId: existing.id,
				airtableBrandId: body.airtableBrandId,
			});
		}

		const response = await fetch(`https://api.airtable.com/v0/${base}/${encodeURIComponent(table)}/${body.airtableBrandId}`, {
			headers: { Authorization: `Bearer ${token}` },
		});
		if (!response.ok) {
			return NextResponse.json({ error: 'Airtable brand profile was not found.' }, { status: 404 });
		}
		const record = (await response.json()) as AirtableRecord;
		const fields = record.fields ?? {};
		const owner = fieldString(fields, 'user_id');
		if (owner && owner !== userId) {
			return NextResponse.json({ error: 'That brand profile belongs to another account.' }, { status: 403 });
		}

		const brandTypeRaw = fieldString(fields, 'brand_type');
		const brandType = brandTypeRaw === 'personal' ? 'personal' : 'company';
		const clientName =
			brandType === 'personal'
				? fieldString(fields, 'personal_full_name') || fieldString(fields, 'client_name')
				: fieldString(fields, 'client_name');

		const activated = await activateBrandFromOnboarding({
			store,
			userId,
			airtableTable: table,
			airtableBrandId: body.airtableBrandId,
			clientName: clientName || 'Brand',
			reason: 'manual_activation',
			onboarding: {
				brandType,
				clientName: clientName || 'Brand',
				website: fieldString(fields, 'website'),
				audience: fieldString(fields, 'audience') || fieldString(fields, 'personal_audience'),
				valueProps: fieldString(fields, 'value_props') || fieldString(fields, 'personal_expertise'),
				offers: fieldString(fields, 'offers'),
				brandGoals: fieldString(fields, 'brand_goals') || fieldString(fields, 'personal_goals'),
				voiceRules: fieldString(fields, 'voice_rules'),
				brandKeywords: fieldString(fields, 'brand_keywords'),
				excludeKeywords: fieldString(fields, 'exclude_keywords'),
				contentRules: fieldString(fields, 'content_rules'),
				additionalInfo: fieldString(fields, 'additional_info'),
				platformsRequested: fieldArray(fields, 'platforms_requested'),
				timezone: fieldString(fields, 'timezone') || 'UTC',
				languageRegion: fieldString(fields, 'language_region') || 'US English',
				preferredImageSource: fieldString(fields, 'preferred_image_source') || 'AI Generated',
				brandPalette: fieldString(fields, 'brand_palette'),
				approvalContactEmail: fieldString(fields, 'approval_contact_email'),
				personalVoiceTraits: fieldArray(fields, 'personal_voice_traits'),
				personalToneAvoid: fieldArray(fields, 'personal_tone_avoid'),
				personalRiskTolerance: fieldString(fields, 'personal_risk_tolerance') || undefined,
				personalContentStyle: fieldArray(fields, 'personal_content_style'),
				personalExcludeKeywords: fieldString(fields, 'personal_exclude_keywords'),
			},
		});

		return NextResponse.json({ ok: true, ...activated });
	} catch (error) {
		const mapped = jsonError(error);
		return NextResponse.json(mapped.body, { status: mapped.status });
	}
}
