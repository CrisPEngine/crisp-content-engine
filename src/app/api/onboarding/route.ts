import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { z } from 'zod';

export const runtime = 'nodejs';

const PlatformsEnum = z.enum(['LinkedIn', 'X', 'Instagram', 'Facebook', 'Blog']);
const LanguageRegionEnum = z.enum(['US English', 'UK English', 'AU English']);
const PreferredImageSourceEnum = z.enum(['AI Generated', 'Stock', 'Brand']);
const BrandTypeEnum = z.enum(['company', 'personal']);

const schema = z
	.object({
		brand_type: BrandTypeEnum,
		client_name: z.string().default(''),
		audience: z.string().default(''),
		value_props: z.string().default(''),
		offers: z.string().default(''),
		brand_goals: z.string().default(''),
		// Make these optional with empty-string defaults
		voice_rules: z.string().default(''),
		brand_keywords: z.string().default(''),
		exclude_keywords: z.string().default(''),
		content_rules: z.string().default(''),
		additional_info: z.string().default(''),
		// Platforms: require at least one
		platforms_requested: z.preprocess(
			(val) => {
				if (Array.isArray(val)) return val;
				if (typeof val === 'string') return val.trim() ? [val] : [];
				return [];
			},
			z.array(PlatformsEnum).min(1)
		),
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
		approval_contact_email: z
			.string()
			.default('')
			.refine((value) => value === '' || z.string().email().safeParse(value).success, {
				message: 'Invalid email address',
			}),
		brand_assets_urls: z.preprocess(
			(val) => {
				if (Array.isArray(val)) return val;
				if (typeof val === 'string') return val.trim() ? [val] : [];
				return [];
			},
			z.array(z.string().url()).default([])
		),
		personal_full_name: z.string().default(''),
		personal_headline: z.string().default(''),
		personal_expertise: z.string().default(''),
		personal_audience: z.string().default(''),
		personal_goals: z.string().default(''),
		personal_voice_traits: z.string().default(''),
		personal_story: z.string().default(''),
		personal_links: z.string().default(''),
		personal_assets_urls: z.preprocess(
			(val) => {
				if (Array.isArray(val)) return val;
				if (typeof val === 'string') return val.trim() ? [val] : [];
				return [];
			},
			z.array(z.string().url()).default([])
		),
		assistants: z.string().default(''),
		ghost_writer_preference: z.enum(['Yes', 'No', 'Sometimes']).default('Yes'),
	})
	.superRefine((data, ctx) => {
		if (data.brand_type === 'personal') {
			const requiredPersonalFields: Array<[keyof typeof data, string]> = [
				['personal_full_name', 'Please provide your full name'],
				['personal_headline', 'Please provide a personal headline'],
				['personal_expertise', 'Please describe your expertise'],
				['personal_audience', 'Please describe your target audience'],
				['personal_goals', 'Please describe your goals'],
				['personal_voice_traits', 'Please describe your voice traits'],
				['personal_story', 'Please share your credibility highlights'],
			];

			requiredPersonalFields.forEach(([field, message]) => {
				const value = (data[field] as string) || '';
				if (!value.trim()) {
					ctx.addIssue({
						path: [field],
						code: z.ZodIssueCode.custom,
						message,
					});
				}
			});

			// Validate platforms for personal brands
			if (!data.platforms_requested || data.platforms_requested.length === 0) {
				ctx.addIssue({
					path: ['platforms_requested'],
					code: z.ZodIssueCode.custom,
					message: 'Select at least one platform',
				});
			}

			// Validate timezone for personal brands
			if (!data.timezone || !data.timezone.trim()) {
				ctx.addIssue({
					path: ['timezone'],
					code: z.ZodIssueCode.custom,
					message: 'Please select a timezone',
				});
			}
		}

		if (data.brand_type === 'company') {
			if (!data.client_name || !data.client_name.trim() || data.client_name.trim().length < 2) {
				ctx.addIssue({
					path: ['client_name'],
					code: z.ZodIssueCode.custom,
					message: 'Brand name must be at least 2 characters',
				});
			}
			if (!data.audience || !data.audience.trim() || data.audience.trim().length < 10) {
				ctx.addIssue({
					path: ['audience'],
					code: z.ZodIssueCode.custom,
					message: 'Please describe your audience (at least 10 characters)',
				});
			}
			if (!data.value_props || !data.value_props.trim() || data.value_props.trim().length < 10) {
				ctx.addIssue({
					path: ['value_props'],
					code: z.ZodIssueCode.custom,
					message: 'Please describe your value propositions (at least 10 characters)',
				});
			}
			if (!data.offers || !data.offers.trim() || data.offers.trim().length < 5) {
				ctx.addIssue({
					path: ['offers'],
					code: z.ZodIssueCode.custom,
					message: 'Please describe your offers/products (at least 5 characters)',
				});
			}
			if (!data.brand_goals || !data.brand_goals.trim() || data.brand_goals.trim().length < 10) {
				ctx.addIssue({
					path: ['brand_goals'],
					code: z.ZodIssueCode.custom,
					message: 'Please describe your objectives',
				});
			}
			if (!data.approval_contact_email || !data.approval_contact_email.trim()) {
				ctx.addIssue({
					path: ['approval_contact_email'],
					code: z.ZodIssueCode.custom,
					message: 'Approval contact email is required',
				});
			}
		}
	});

export async function POST(req: Request) {
	try {
		const body = await req.json();
		
		// Debug logging (remove in production if needed)
		if (typeof body.personal_assets_urls !== 'undefined' && !Array.isArray(body.personal_assets_urls)) {
			console.log('[Onboarding API] personal_assets_urls is not an array:', typeof body.personal_assets_urls, body.personal_assets_urls);
		}
		
		// Pre-process arrays to ensure they're always arrays (not strings, null, or undefined)
		// Handle personal_assets_urls
		if (typeof body.personal_assets_urls === 'string') {
			body.personal_assets_urls = body.personal_assets_urls.trim() ? [body.personal_assets_urls] : [];
		} else if (!Array.isArray(body.personal_assets_urls)) {
			body.personal_assets_urls = [];
		}
		
		// Handle brand_assets_urls
		if (typeof body.brand_assets_urls === 'string') {
			body.brand_assets_urls = body.brand_assets_urls.trim() ? [body.brand_assets_urls] : [];
		} else if (!Array.isArray(body.brand_assets_urls)) {
			body.brand_assets_urls = [];
		}
		
		// Handle platforms_requested
		if (typeof body.platforms_requested === 'string') {
			body.platforms_requested = body.platforms_requested.trim() ? [body.platforms_requested] : [];
		} else if (!Array.isArray(body.platforms_requested)) {
			body.platforms_requested = [];
		}
		
		// Final safety check - ensure they're arrays (handle null/undefined)
		body.personal_assets_urls = Array.isArray(body.personal_assets_urls) ? body.personal_assets_urls : [];
		body.brand_assets_urls = Array.isArray(body.brand_assets_urls) ? body.brand_assets_urls : [];
		body.platforms_requested = Array.isArray(body.platforms_requested) ? body.platforms_requested : [];
		
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
		const recordPayload: {
			fields: {
				brand_type: typeof data.brand_type;
				client_name: string;
				website: string;
				audience: string;
				value_props: string;
				offers: string;
				brand_goals: string;
				voice_rules: string;
				brand_keywords: string;
				exclude_keywords: string;
				content_rules: string;
				additional_info: string;
				platforms_requested: string[];
				timezone: string;
				language_region: typeof data.language_region;
				preferred_image_source: typeof data.preferred_image_source;
				brand_palette: string;
				approval_contact_email: string;
				brand_assets?: { url: string }[];
				personal_full_name: string;
				personal_headline: string;
				personal_expertise: string;
				personal_audience: string;
				personal_goals: string;
				personal_voice_traits: string;
				personal_story: string;
				personal_links: string;
				// assistants: string; // Optional - only include if field exists in Airtable
				// ghost_writer_preference: typeof data.ghost_writer_preference; // Optional - only include if field exists in Airtable
				personal_assets?: { url: string }[];
				status: string;
				strategy_approval: boolean;
				user_id: string;
				created_time?: string;
				last_modified_time?: string;
			};
		} = {
			fields: {
				brand_type: data.brand_type,
				client_name: data.brand_type === 'personal' 
					? String(data.personal_full_name || '') 
					: String(data.client_name || ''),
				website: (data.website && data.website.trim()) || '',
				audience: data.brand_type === 'personal' 
					? String(data.personal_audience || '') 
					: String(data.audience || ''),
				value_props: data.brand_type === 'personal' 
					? String(data.personal_expertise || '') 
					: String(data.value_props || ''),
				offers: data.brand_type === 'personal' 
					? '' // Personal brands don't have "offers" in the same way
					: String(data.offers || ''),
				brand_goals: data.brand_type === 'personal' 
					? String(data.personal_goals || '') 
					: String(data.brand_goals || ''), // Ensure it's always a string
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
				approval_contact_email: data.brand_type === 'personal' 
					? (data.approval_contact_email || user.email || '')
					: data.approval_contact_email,
				brand_assets: attachments.length > 0 ? attachments : undefined, // Attachment field
				personal_full_name: String(data.personal_full_name || ''),
				personal_headline: String(data.personal_headline || ''),
				personal_expertise: String(data.personal_expertise || ''),
				personal_audience: String(data.personal_audience || ''),
				personal_goals: String(data.personal_goals || ''),
				personal_voice_traits: String(data.personal_voice_traits || ''),
				personal_story: String(data.personal_story || ''),
				personal_links: String(data.personal_links || ''),
				// Only include these fields if they exist in Airtable (optional fields)
				// assistants: String(data.assistants || ''),
				// ghost_writer_preference: data.ghost_writer_preference,
				status: 'New Brief', // Initial status - matches Airtable options
				strategy_approval: false,
				user_id: user.id, // Link to Supabase user
				// Note: created_time and last_modified_time are automatic fields in Airtable
				// Do not set them manually - Airtable will handle them automatically
			},
		};

		const personalAttachments = (data.personal_assets_urls || []).map((url) => ({ url }));
		if (personalAttachments.length > 0) {
			recordPayload.fields.personal_assets = personalAttachments;
		}

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
			console.error('Airtable error:', JSON.stringify(airtableResult, null, 2));
			// Common errors:
			// - Unknown field name
			// - Invalid select option value
			// - Insufficient permissions
			// - Field type mismatch (e.g., trying to send text to a select field)
			const errorMessage = airtableResult?.error?.message || 'Failed to create brand profile';
			const errorDetails = airtableResult?.error || {};
			
			// Log the full payload for debugging
			console.error('Airtable payload sent:', JSON.stringify(recordPayload, null, 2));
			
			return NextResponse.json(
				{
					error: errorMessage,
					details: errorDetails,
					fieldErrors: airtableResult?.error?.fields || {},
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
			// Format validation errors for better UX
			const fieldErrors: Record<string, { message: string; type: string }> = {};
			e.issues.forEach((issue) => {
				const path = issue.path.join('.');
				fieldErrors[path] = {
					message: issue.message,
					type: issue.code,
				};
			});
			
			// Extract the first error message for alert
			const firstError = e.issues[0];
			const errorMessage = firstError?.message || 'Validation error';
			
			return NextResponse.json(
				{ 
					error: errorMessage, 
					details: e.issues,
					fieldErrors,
				},
				{ status: 400 }
			);
		}
		return NextResponse.json({ error: e?.message || 'Server error' }, { status: 500 });
	}
}

