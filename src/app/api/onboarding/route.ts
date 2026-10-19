import { randomUUID } from 'crypto';
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { z } from 'zod';
import { getIntelligenceStore } from '@/lib/intelligence/actions';
import { assertCanAddBrand, BrandLimitReachedError } from '@/lib/brandLimits';
import { activateBrandFromOnboarding } from '@/lib/intelligence/onboarding/activateFromOnboarding';
import { resolveStrategyEngine } from '@/lib/intelligence/strategy/strategyEngine';
import {
	dispatchStrategyGenerationWorker,
	enqueueNativeStrategyGeneration,
} from '@/lib/intelligence/strategy/generationJob';
import type { OnboardingNativeInput } from '@/lib/intelligence/onboarding/mapOnboardingToNative';
import {
	normalizeOnboardingBody,
	onboardingApiSchema,
} from '@/lib/onboarding/onboardingApiSchema';

export const runtime = 'nodejs';

export async function POST(req: Request) {
	try {
		const rawBody = await req.json();
		const body = normalizeOnboardingBody(
			rawBody && typeof rawBody === 'object' ? (rawBody as Record<string, unknown>) : {},
		);

		if (typeof body.personal_assets_urls !== 'undefined' && !Array.isArray(body.personal_assets_urls)) {
			console.log('[Onboarding API] personal_assets_urls is not an array:', typeof body.personal_assets_urls, body.personal_assets_urls);
		}

		const data = onboardingApiSchema.parse(body);

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

		try {
			await assertCanAddBrand(user.id);
		} catch (limitError) {
			if (limitError instanceof BrandLimitReachedError) {
				return NextResponse.json(
					{
						error: limitError.message,
						code: limitError.code,
						max_brands: limitError.maxBrands,
						current_count: limitError.currentCount,
					},
					{ status: 403 },
				);
			}
			throw limitError;
		}

		// Airtable configuration
		const AIRTABLE_TOKEN = process.env.AIRTABLE_PAT;
		const BASE_ID = process.env.AIRTABLE_BASE_ID;
		const TABLE_ID = process.env.AIRTABLE_BRANDPROFILES_TABLE;

		const airtableConfigured = Boolean(AIRTABLE_TOKEN && BASE_ID && TABLE_ID);

		const clientName =
			data.brand_type === 'personal'
				? String(data.personal_full_name || data.client_name || 'Personal Brand')
				: String(data.client_name || 'Brand');

		const onboardingNative: OnboardingNativeInput = {
			brandType: data.brand_type,
			clientName,
			website: data.website || undefined,
			audience: data.brand_type === 'personal' ? String(data.personal_audience || data.audience || '') : String(data.audience || ''),
			valueProps: data.brand_type === 'personal' ? String(data.personal_expertise || data.value_props || '') : String(data.value_props || ''),
			offers: data.brand_type === 'personal' ? 'Personal brand creator package.' : String(data.offers || ''),
			brandGoals: data.brand_type === 'personal' ? String(data.personal_goals || data.brand_goals || '') : String(data.brand_goals || ''),
			voiceRules: data.voice_rules || undefined,
			brandKeywords: data.brand_keywords || undefined,
			excludeKeywords: data.exclude_keywords || undefined,
			contentRules: data.content_rules || undefined,
			additionalInfo: data.additional_info || undefined,
			platformsRequested: data.platforms_requested,
			timezone: data.timezone,
			languageRegion: data.language_region,
			preferredImageSource: data.preferred_image_source,
			brandPalette: data.brand_palette || undefined,
			approvalContactEmail: data.approval_contact_email || undefined,
			personalVoiceTraits: data.personal_voice_traits,
			personalToneAvoid: data.personal_tone_avoid,
			personalRiskTolerance: data.personal_risk_tolerance,
			personalContentStyle: data.personal_content_style,
			personalExcludeKeywords: data.personal_exclude_keywords || undefined,
		};

		let airtableId: string | undefined;
		let airtableWarning: string | undefined;

		if (!airtableConfigured) {
			airtableId = `local_${randomUUID()}`;
			airtableWarning =
				'Airtable is not configured. Your native brand was created, but legacy Make/Airtable workflows will not run until Airtable is linked.';
		} else {

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
				personal_job_title: string;
				personal_industry: string;
				personal_links: string;
				personal_headline: string;
				personal_audience: string;
				personal_expertise: string;
				personal_goals: string;
				personal_voice_traits: string[]; // Multiple select - array of strings
				personal_tone_avoid: string[]; // Multiple select - array of strings
				personal_risk_tolerance?: string; // Single select
				personal_content_style: string[]; // Multiple select - array of strings
				personal_exclude_keywords: string;
				personal_story: string;
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
				personal_job_title: String(data.personal_job_title || ''),
				personal_industry: String(data.personal_industry || ''),
				personal_links: String(data.personal_links || ''),
				personal_headline: String(data.personal_headline || ''),
				personal_audience: String(data.personal_audience || ''),
				personal_expertise: String(data.personal_expertise || ''),
				personal_goals: String(data.personal_goals || ''),
				personal_voice_traits: Array.isArray(data.personal_voice_traits) ? data.personal_voice_traits : [],
				personal_tone_avoid: Array.isArray(data.personal_tone_avoid) ? data.personal_tone_avoid : [],
				personal_risk_tolerance: data.personal_risk_tolerance || undefined,
				personal_content_style: Array.isArray(data.personal_content_style) ? data.personal_content_style : [],
				personal_exclude_keywords: String(data.personal_exclude_keywords || ''),
				personal_story: String(data.personal_story || ''),
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
				console.error('Airtable payload sent:', JSON.stringify(recordPayload, null, 2));
				airtableId = `local_${randomUUID()}`;
				airtableWarning =
					airtableResult?.error?.message ||
					'Could not save the Airtable brand profile. Your native brand was still created in CCE.';
			} else {
				airtableId = airtableResult.id as string;

				if (process.env.LEGACY_MAKE_ENABLED === 'true' && process.env.MAKE_ONBOARDING_WEBHOOK_URL) {
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
						console.error('Make webhook error:', webhookError);
					}
				}
			}
		}

		if (!airtableId) {
			return NextResponse.json({ error: 'Could not determine brand profile id.' }, { status: 500 });
		}

		const store = getIntelligenceStore();
		const activated = await activateBrandFromOnboarding({
			store,
			userId: user.id,
			airtableTable: TABLE_ID || 'BrandProfiles',
			airtableBrandId: airtableId,
			clientName,
			onboarding: onboardingNative,
			reason: 'onboarding',
		});

		const strategyEngine = resolveStrategyEngine();
		let strategyGenerationJobId: string | undefined;
		if (strategyEngine === 'native') {
			try {
				const job = await enqueueNativeStrategyGeneration({
					ownerUserId: user.id,
					airtableBrandId: airtableId,
					brandBrainId: activated.brandId,
					source: 'onboarding',
				});
				strategyGenerationJobId = job.id;
				await dispatchStrategyGenerationWorker(job.id).catch((err) => {
					console.error('[Onboarding] Native strategy generation dispatch failed:', err);
				});
			} catch (genError) {
				console.error('[Onboarding] Native strategy generation enqueue failed:', genError);
			}
		}

		return NextResponse.json({
			ok: true,
			airtableId,
			brandBrainId: activated.brandId,
			strategyId: activated.strategyId,
			strategyEngine,
			strategyGenerationJobId,
			airtableWarning,
			message: airtableWarning ? 'Native brand created with warnings.' : 'Brand profile created successfully',
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

