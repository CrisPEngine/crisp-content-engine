import { z } from 'zod';
import { coerceBoolean } from './coerceBoolean';

export const PlatformsEnum = z.enum(['LinkedIn', 'X', 'Instagram', 'Facebook', 'Blog']);
export const LanguageRegionEnum = z.enum(['US English', 'UK English', 'AU English']);
export const PreferredImageSourceEnum = z.enum(['AI Generated', 'Stock', 'Brand']);
export const BrandTypeEnum = z.enum(['company', 'personal']);

const arrayFromUnknown = (val: unknown): string[] => {
	if (Array.isArray(val)) return val as string[];
	if (typeof val === 'string') return val.trim() ? [val] : [];
	return [];
};

export const onboardingApiSchema = z
	.object({
		brand_type: BrandTypeEnum,
		client_name: z.string().default(''),
		audience: z.string().default(''),
		value_props: z.string().default(''),
		offers: z.string().default(''),
		brand_goals: z.string().default(''),
		voice_rules: z.string().default(''),
		brand_keywords: z.string().default(''),
		exclude_keywords: z.string().default(''),
		content_rules: z.string().default(''),
		additional_info: z.string().default(''),
		platforms_requested: z.preprocess(
			arrayFromUnknown,
			z.array(PlatformsEnum).min(1)
		),
		timezone: z.string().min(1),
		language_region: LanguageRegionEnum,
		preferred_image_source: PreferredImageSourceEnum,
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
			arrayFromUnknown,
			z.array(z.string().url()).default([])
		),
		personal_full_name: z.string().default(''),
		personal_job_title: z.string().default(''),
		personal_industry: z.string().default(''),
		personal_links: z.string().default(''),
		personal_headline: z.string().default(''),
		personal_audience: z.string().default(''),
		personal_expertise: z.string().default(''),
		personal_goals: z.string().default(''),
		personal_voice_traits: z.preprocess(arrayFromUnknown, z.array(z.string()).default([])),
		personal_tone_avoid: z.preprocess(arrayFromUnknown, z.array(z.string()).default([])),
		personal_risk_tolerance: z.preprocess(
			(val) => {
				if (!val || val === '' || val === null) return undefined;
				return val;
			},
			z
				.enum([
					'Low risk (safe, neutral, reputation-protected)',
					'Medium risk (balanced, industry-relevant opinions)',
					'High risk (strong viewpoints, controversial insights)',
				])
				.optional()
		),
		personal_content_style: z.preprocess(arrayFromUnknown, z.array(z.string()).default([])),
		personal_exclude_keywords: z.string().default(''),
		personal_story: z.string().default(''),
		personal_assets_urls: z.preprocess(
			arrayFromUnknown,
			z.array(z.string().url()).default([])
		),
		assistants: z.string().default(''),
		ghost_writer_preference: z.enum(['Yes', 'No', 'Sometimes']).default('Yes'),
		// Client-only field; coerce strings so passthrough payloads do not break strict downstream use.
		avoid_negative_tones: z
			.preprocess((val) => coerceBoolean(val, true), z.boolean())
			.optional(),
	})
	.superRefine((data, ctx) => {
		if (data.brand_type === 'personal') {
			const requiredPersonalFields: Array<[keyof typeof data, string]> = [
				['personal_full_name', 'Please provide your full name'],
				['personal_job_title', 'Please provide your job title/role'],
				['personal_industry', 'Please provide your industry'],
				['personal_links', 'Please provide your website'],
				['personal_headline', 'Please describe yourself in one sentence'],
				['personal_audience', 'Please describe your primary audience'],
				['personal_expertise', 'Please describe what subjects or themes you want to post about'],
				['personal_goals', 'Please describe what you want to achieve with your content'],
				['personal_story', 'Please share your personal story, experiences, or achievements'],
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

			if (!data.personal_voice_traits || (data.personal_voice_traits as string[]).length === 0) {
				ctx.addIssue({
					path: ['personal_voice_traits'],
					code: z.ZodIssueCode.custom,
					message: 'Please select at least 1 tone & style option (up to 3)',
				});
			}

			if (!data.personal_risk_tolerance) {
				ctx.addIssue({
					path: ['personal_risk_tolerance'],
					code: z.ZodIssueCode.custom,
					message: 'Please select your risk tolerance level',
				});
			}

			if (!data.personal_content_style || (data.personal_content_style as string[]).length === 0) {
				ctx.addIssue({
					path: ['personal_content_style'],
					code: z.ZodIssueCode.custom,
					message: 'Please select at least 1 content style preference (up to 4)',
				});
			}

			if (!data.platforms_requested || data.platforms_requested.length === 0) {
				ctx.addIssue({
					path: ['platforms_requested'],
					code: z.ZodIssueCode.custom,
					message: 'Select at least one platform',
				});
			}

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

export type OnboardingApiInput = z.infer<typeof onboardingApiSchema>;

/** Normalize raw JSON body before Zod parse (arrays, legacy string booleans). */
export function normalizeOnboardingBody(body: Record<string, unknown>): Record<string, unknown> {
	const normalized = { ...body };

	if (typeof normalized.personal_assets_urls === 'string') {
		normalized.personal_assets_urls = normalized.personal_assets_urls.trim()
			? [normalized.personal_assets_urls]
			: [];
	} else if (!Array.isArray(normalized.personal_assets_urls)) {
		normalized.personal_assets_urls = [];
	}

	if (typeof normalized.brand_assets_urls === 'string') {
		normalized.brand_assets_urls = normalized.brand_assets_urls.trim()
			? [normalized.brand_assets_urls]
			: [];
	} else if (!Array.isArray(normalized.brand_assets_urls)) {
		normalized.brand_assets_urls = [];
	}

	if (typeof normalized.platforms_requested === 'string') {
		normalized.platforms_requested = normalized.platforms_requested.trim()
			? [normalized.platforms_requested]
			: [];
	} else if (!Array.isArray(normalized.platforms_requested)) {
		normalized.platforms_requested = [];
	}

	normalized.personal_assets_urls = Array.isArray(normalized.personal_assets_urls)
		? normalized.personal_assets_urls
		: [];
	normalized.brand_assets_urls = Array.isArray(normalized.brand_assets_urls)
		? normalized.brand_assets_urls
		: [];
	normalized.platforms_requested = Array.isArray(normalized.platforms_requested)
		? normalized.platforms_requested
		: [];

	if ('avoid_negative_tones' in normalized) {
		normalized.avoid_negative_tones = coerceBoolean(normalized.avoid_negative_tones, true);
	}

	return normalized;
}

export function companyOnboardingFixture(overrides: Record<string, unknown> = {}): Record<string, unknown> {
	return {
		brand_type: 'company',
		client_name: 'PremiumDieCast',
		audience: 'Collectors and hobbyists who buy diecast models online.',
		value_props: 'Curated inventory, fast shipping, and rare models.',
		offers: 'Diecast cars, trucks, and display cases.',
		brand_goals: 'Grow ecommerce sales and community engagement.',
		platforms_requested: ['Instagram', 'Facebook'],
		timezone: 'America/New_York',
		language_region: 'US English',
		preferred_image_source: 'Brand',
		approval_contact_email: 'chris@example.com',
		brand_assets_urls: ['https://cdn.example.com/PremiumDieCast-logo.png'],
		...overrides,
	};
}
