import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { z } from 'zod';

export const runtime = 'nodejs';

const PlatformsEnum = z.enum(['LinkedIn', 'X', 'Instagram', 'Facebook', 'Blog', 'Medium']);
const LanguageRegionEnum = z.enum(['US English', 'UK English', 'AU English']);
const PreferredImageSourceEnum = z.enum(['AI Generated', 'Stock', 'Brand']);

const schema = z.object({
	client_name: z.string().min(2),
	audience: z.string().min(10),
	value_props: z.string().min(10),
	offers: z.string().min(5),
	brand_goals: z.string().min(10),
	// Make these optional with empty-string defaults
	voice_rules: z.string().default(''),
	brand_keywords: z.string().default(''),
	exclude_keywords: z.string().default(''),
	content_rules: z.string().default(''),
	additional_info: z.string().default(''),
	// Platforms: require at least one
	platforms_requested: z.array(PlatformsEnum).min(1),
	timezone: z.string().min(1),
	language_region: LanguageRegionEnum,
	preferred_image_source: PreferredImageSourceEnum,
	// Optional, validate URL if provided, otherwise empty string
	website: z
		.string()
		.default('')
		.refine((val) => !val || z.string().url().safeParse(val).success, {
			message: 'Invalid URL',
		}),
	brand_palette: z.string().default(''),
	approval_contact_email: z.string().email(),
	brand_assets_urls: z.array(z.string().url()).default([]),
});

export async function POST(req: Request) {
	try {
		const body = await req.json();
		const data = schema.parse(body);

		// Authenticate user
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

		const { data: { user }, error: userErr } = await supabase.auth.getUser();

		if (userErr || !user) {
			return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
		}

		// Airtable configuration
		const AIRTABLE_TOKEN = process.env.AIRTABLE_PAT;
		const BASE_ID = process.env.AIRTABLE_BASE_ID;
		const TABLE_ID = process.env.AIRTABLE_BRANDPROFILES_TABLE;

		if (!AIRTABLE_TOKEN || !BASE_ID || !TABLE_ID) {
			return NextResponse.json(
				{ error: 'Airtable configuration missing. Please contact support.' },
				{ status: 500 }
			);
		}

		// Map attachment URLs to Airtable attachment format
		const attachments = (data.brand_assets_urls || []).map((url) => ({ url }));

		// Prepare Airtable record payload
		// IMPORTANT: Field names must exactly match Airtable table schema
		const recordPayload = {
			fields: {
				client_name: data.client_name,
				website: (data.website && data.website.trim()) || '',
				audience: data.audience,
				value_props: data.value_props,
				offers: data.offers,
				brand_goals: data.brand_goals,
				voice_rules: String(data.voice_rules || ''), // Ensure it's always a string
				brand_keywords: String(data.brand_keywords || ''),
				exclude_keywords: String(data.exclude_keywords || ''),
				content_rules: String(data.content_rules || ''),
				additional_info: String(data.additional_info || ''),
				platforms_requested: data.platforms_requested, // Multi-select field
				timezone: data.timezone, // Single-select field - must match exact option
				language_region: data.language_region, // Single-select field
				preferred_image_source: data.preferred_image_source, // Single-select field
				brand_palette: data.brand_palette || '',
				approval_contact_email: data.approval_contact_email,
				brand_assets: attachments.length > 0 ? attachments : undefined, // Attachment field
				status: 'New Brief', // Initial status - matches Airtable options
				strategy_approval: false,
				user_id: user.id, // Link to Supabase user
				created_at: new Date().toISOString(),
			},
		};

		// Write to Airtable
		const airtableRes = await fetch(`https://api.airtable.com/v0/${BASE_ID}/${TABLE_ID}`, {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${AIRTABLE_TOKEN}`,
				'Content-Type': 'application/json',
			},
			body: JSON.stringify(recordPayload),
		});

		const airtableResult = await airtableRes.json();

		if (!airtableRes.ok) {
			console.error('Airtable error:', airtableResult);
			// Common errors:
			// - Unknown field name
			// - Invalid select option value
			// - Insufficient permissions
			return NextResponse.json(
				{
					error: airtableResult?.error?.message || 'Failed to create brand profile',
					details: airtableResult?.error,
				},
				{ status: 422 }
			);
		}

		// Optional: Trigger Make webhook for site scraping/strategy generation
		if (process.env.MAKE_ONBOARDING_WEBHOOK_URL) {
			try {
				await fetch(process.env.MAKE_ONBOARDING_WEBHOOK_URL, {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						...(process.env.MAKE_API_KEY && {
							'x-api-key': process.env.MAKE_API_KEY,
						}),
					},
					body: JSON.stringify({
						brand_profile_id: airtableResult.id,
						user_id: user.id,
						client_name: data.client_name,
						website: data.website || '',
					}),
				});
			} catch (webhookError) {
				// Log but don't fail the request if webhook fails
				console.error('Make webhook error:', webhookError);
			}
		}

		return NextResponse.json({
			ok: true,
			airtableId: airtableResult.id,
			message: 'Brand profile created successfully',
		});
	} catch (e: any) {
		console.error('Onboarding error:', e);
		if (e instanceof z.ZodError) {
			return NextResponse.json(
				{ error: 'Validation error', details: e.issues },
				{ status: 400 }
			);
		}
		return NextResponse.json({ error: e?.message || 'Server error' }, { status: 500 });
	}
}

