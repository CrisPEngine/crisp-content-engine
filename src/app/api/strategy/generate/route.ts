import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { z } from 'zod';

export const runtime = 'nodejs';

const requestSchema = z.object({
	airtableId: z.string().min(1),
	client_name: z.string().min(1),
	audience: z.string().min(1),
	value_props: z.string().min(1),
	offers: z.string().min(1),
	brand_goals: z.string().optional().default(''),
	voice_rules: z.string().optional().default(''),
	brand_keywords: z.string().optional().default(''),
	exclude_keywords: z.string().optional().default(''),
	content_rules: z.string().optional().default(''),
	additional_info: z.string().optional().default(''),
	platforms_requested: z.array(z.string()).optional().default([]),
	timezone: z.string().optional().default(''),
	language_region: z.string().optional().default(''),
	preferred_image_source: z.string().optional().default(''),
	website: z.string().optional().default(''),
	brand_palette: z.string().optional().default(''),
	approval_contact_email: z.string().optional().default(''),
	brand_assets_urls: z.array(z.string().url()).optional().default([]),
});

const parseList = (value: string) =>
	value
		.split(/\r?\n|,/)
		.map((item) => item.trim())
		.filter(Boolean);

const dedupe = <T,>(items: T[]) => Array.from(new Set(items));

const inferMimeType = (url: string) => {
	try {
		const extension = new URL(url).pathname.split('.').pop()?.toLowerCase();
		if (!extension) return 'application/octet-stream';
		switch (extension) {
			case 'png':
			case 'jpg':
			case 'jpeg':
			case 'gif':
			case 'webp':
				return `image/${extension === 'jpg' ? 'jpeg' : extension}`;
			case 'pdf':
				return 'application/pdf';
			case 'doc':
			case 'docx':
				return 'application/msword';
			case 'ppt':
			case 'pptx':
				return 'application/vnd.ms-powerpoint';
			case 'xls':
			case 'xlsx':
				return 'application/vnd.ms-excel';
			case 'zip':
				return 'application/zip';
			default:
				return 'application/octet-stream';
		}
	} catch (error) {
		return 'application/octet-stream';
	}
};

export async function POST(req: Request) {
	try {
		if (!process.env.MAKE_STRATEGY_WEBHOOK_URL) {
			return NextResponse.json({ error: 'MAKE_STRATEGY_WEBHOOK_URL is not configured' }, { status: 500 });
		}

		const body = await req.json();
		const data = requestSchema.parse(body);

		// Authenticate the user via Supabase cookies
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

		const keywords = parseList(data.brand_keywords);
		const exclusions = parseList(data.exclude_keywords);
		const additionalInfoText = data.additional_info || '';
		const additionalInfoUrls = parseList(additionalInfoText).filter((value) => value.startsWith('http'));

		const urlsToScrape = dedupe(
			[
				...(data.website ? [data.website] : []),
				...additionalInfoUrls,
			]
		);

		const assets = (data.brand_assets_urls || []).map((url) => ({
			url,
			type: inferMimeType(url),
		}));

		const makePayload = {
			brand_profile_id: data.airtableId,
			airtable_table: 'BrandProfiles',
			user_id: user.id,
			brand: {
				name: data.client_name,
				website: data.website,
				timezone: data.timezone,
				language_region: data.language_region,
				voice_rules: data.voice_rules,
				brand_keywords: keywords,
				exclude_keywords: exclusions,
				content_rules: data.content_rules,
				brand_palette: data.brand_palette,
				preferred_image_source: data.preferred_image_source,
				approval_contact_email: data.approval_contact_email,
			},
			audience: data.audience,
			value_props: data.value_props,
			offers: data.offers,
			brand_goals: data.brand_goals,
			platforms_requested: data.platforms_requested,
			urls_to_scrape: urlsToScrape,
			assets,
			strategy_context: {
				submitted_at: new Date().toISOString(),
				extra_instructions: additionalInfoText,
			},
		};

		const headers: Record<string, string> = {
			'Content-Type': 'application/json',
		};

		const outboundSecret = process.env.MAKE_STRATEGY_WEBHOOK_SECRET || process.env.MAKE_SHARED_SECRET;
		if (outboundSecret) {
			headers['x-make-secret'] = outboundSecret;
		}

		const makeResponse = await fetch(process.env.MAKE_STRATEGY_WEBHOOK_URL, {
			method: 'POST',
			headers,
			body: JSON.stringify(makePayload),
		});

		if (!makeResponse.ok) {
			const errorText = await makeResponse.text();
			console.error('Make strategy webhook error:', errorText);
			return NextResponse.json({ error: 'Failed to trigger strategy generation', details: errorText }, { status: 502 });
		}

		return NextResponse.json({ ok: true });
	} catch (error: any) {
		console.error('strategy/generate error:', error);
		return NextResponse.json(
			{ error: error?.message || 'Server error' },
			{ status: error instanceof z.ZodError ? 400 : 500 }
		);
	}
}
