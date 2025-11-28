"use client";

import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { motion, AnimatePresence } from 'framer-motion';
import { FileUpload } from '@/components/FileUpload';
import { SubmissionLoading } from '@/components/SubmissionLoading';
import { LoadingButton } from '@/components/LoadingButton';
import { TIMEZONES } from '@/lib/timezones';
import { useSupabase } from '@/components/SupabaseProvider';

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
		voice_rules: z.string().default(''),
		brand_keywords: z.string().default(''),
		exclude_keywords: z.string().default(''),
		content_rules: z.string().default(''),
		additional_info: z.string().default(''),
		platforms_requested: z.preprocess(
			(val) => {
				if (Array.isArray(val)) return val;
				if (typeof val === 'string') return val.trim() ? [val] : [];
				return [];
			},
			z.array(PlatformsEnum).min(1, 'Select at least one platform')
		),
		timezone: z.string().min(1, 'Please select a timezone'),
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
			(val) => {
				if (Array.isArray(val)) return val;
				if (typeof val === 'string') return val.trim() ? [val] : [];
				return [];
			},
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
		personal_voice_traits: z.preprocess(
			(val) => {
				if (Array.isArray(val)) return val;
				if (typeof val === 'string') return val.trim() ? [val] : [];
				return [];
			},
			z.array(z.string()).max(3, 'Select up to 3 tone & style options').default([])
		),
		personal_tone_avoid: z.preprocess(
			(val) => {
				if (Array.isArray(val)) return val;
				if (typeof val === 'string') return val.trim() ? [val] : [];
				return [];
			},
			z.array(z.string()).default([])
		),
		personal_risk_tolerance: z.preprocess(
			(val) => {
				// Convert empty string, null, or undefined to undefined
				if (!val || val === '' || val === null) return undefined;
				return val;
			},
			z.enum([
				'Low risk (safe, neutral, reputation-protected)',
				'Medium risk (balanced, industry-relevant opinions)',
				'High risk (strong viewpoints, controversial insights)'
			]).optional()
		),
		personal_content_style: z.preprocess(
			(val) => {
				if (Array.isArray(val)) return val;
				if (typeof val === 'string') return val.trim() ? [val] : [];
				return [];
			},
			z.array(z.string()).max(4, 'Select up to 4 content style preferences').default([])
		),
		personal_exclude_keywords: z.string().default(''),
		personal_story: z.string().default(''),
		personal_assets_urls: z.preprocess(
			(val) => {
				if (Array.isArray(val)) return val;
				if (typeof val === 'string') return val.trim() ? [val] : [];
				return [];
			},
			z.array(z.string().url()).default([])
		),
	})
	.superRefine((data, ctx) => {
		if (data.brand_type === 'personal') {
			const requiredPersonal: Array<[keyof typeof data, string]> = [
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

			requiredPersonal.forEach(([field, message]) => {
				if (!(data[field] as string)?.trim()) {
					ctx.addIssue({ path: [field], code: z.ZodIssueCode.custom, message });
				}
			});

			// Validate voice traits (must select 1-3)
			if (!data.personal_voice_traits || (data.personal_voice_traits as string[]).length === 0) {
				ctx.addIssue({ 
					path: ['personal_voice_traits'], 
					code: z.ZodIssueCode.custom, 
					message: 'Please select at least 1 tone & style option (up to 3)' 
				});
			}

			// Validate tone avoid (must select at least 1)
			if (!data.personal_tone_avoid || (data.personal_tone_avoid as string[]).length === 0) {
				ctx.addIssue({ 
					path: ['personal_tone_avoid'], 
					code: z.ZodIssueCode.custom, 
					message: 'Please select at least 1 tone to avoid' 
				});
			}

			// Validate risk tolerance
			if (!data.personal_risk_tolerance) {
				ctx.addIssue({ 
					path: ['personal_risk_tolerance'], 
					code: z.ZodIssueCode.custom, 
					message: 'Please select your risk tolerance level' 
				});
			}

			// Validate content style (must select 1-4)
			if (!data.personal_content_style || (data.personal_content_style as string[]).length === 0) {
				ctx.addIssue({ 
					path: ['personal_content_style'], 
					code: z.ZodIssueCode.custom, 
					message: 'Please select at least 1 content style preference (up to 4)' 
				});
			}

			// Validate platforms for personal brands
			if (!data.platforms_requested || data.platforms_requested.length === 0) {
				ctx.addIssue({ path: ['platforms_requested'], code: z.ZodIssueCode.custom, message: 'Select at least one platform' });
			}

			// Validate timezone for personal brands
			if (!data.timezone || !data.timezone.trim()) {
				ctx.addIssue({ path: ['timezone'], code: z.ZodIssueCode.custom, message: 'Please select a timezone' });
			}
		}

		if (data.brand_type === 'company') {
			if (!data.client_name || !data.client_name.trim() || data.client_name.trim().length < 2) {
				ctx.addIssue({ path: ['client_name'], code: z.ZodIssueCode.custom, message: 'Brand name must be at least 2 characters' });
			}
			if (!data.audience || !data.audience.trim() || data.audience.trim().length < 10) {
				ctx.addIssue({ path: ['audience'], code: z.ZodIssueCode.custom, message: 'Please describe your audience (at least 10 characters)' });
			}
			if (!data.value_props || !data.value_props.trim() || data.value_props.trim().length < 10) {
				ctx.addIssue({ path: ['value_props'], code: z.ZodIssueCode.custom, message: 'Please describe your value propositions (at least 10 characters)' });
			}
			if (!data.offers || !data.offers.trim() || data.offers.trim().length < 5) {
				ctx.addIssue({ path: ['offers'], code: z.ZodIssueCode.custom, message: 'Please describe your offers/products (at least 5 characters)' });
			}
			if (!data.brand_goals || !data.brand_goals.trim() || data.brand_goals.trim().length < 10) {
				ctx.addIssue({ path: ['brand_goals'], code: z.ZodIssueCode.custom, message: 'Please describe your objectives' });
			}
			if (!data.approval_contact_email || !data.approval_contact_email.trim()) {
				ctx.addIssue({ path: ['approval_contact_email'], code: z.ZodIssueCode.custom, message: 'Approval contact email is required' });
			}
		}
	});

type FormData = z.infer<typeof schema>;

const personalFields = [
	'personal_full_name',
	'personal_job_title',
	'personal_industry',
	'personal_links',
	'personal_headline',
	'personal_audience',
	'personal_expertise',
	'personal_goals',
	'personal_voice_traits',
	'personal_tone_avoid',
	'personal_risk_tolerance',
	'personal_content_style',
	'personal_exclude_keywords',
	'personal_story',
	'personal_assets_urls',
] as const;

const baseStepFields = {
	companyBasics: ['brand_type', 'client_name', 'website', 'timezone', 'approval_contact_email', 'language_region', 'preferred_image_source'] as const,
	personalBasics: [
		'brand_type',
		'personal_full_name',
		'personal_job_title',
		'personal_industry',
		'personal_links',
		'personal_headline',
		'personal_audience',
		'personal_expertise',
		'personal_goals',
		'personal_voice_traits',
		'personal_tone_avoid',
		'personal_risk_tolerance',
		'personal_content_style',
		'personal_exclude_keywords',
		'personal_story',
		'personal_assets_urls',
		'timezone',
		'language_region',
		'preferred_image_source',
		'platforms_requested',
		'brand_assets_urls',
	] as const,
	audience: ['audience', 'value_props', 'offers', 'brand_goals'] as const,
	voice: ['voice_rules', 'brand_keywords', 'exclude_keywords', 'content_rules', 'additional_info'] as const,
	platforms: ['platforms_requested', 'brand_palette', 'brand_assets_urls'] as const,
};

export default function OnboardingPage() {
	const supabase = useSupabase();
	const [mounted, setMounted] = useState(false);
	const [currentStep, setCurrentStep] = useState(1);
	const [submitting, setSubmitting] = useState(false);
	const [showLoading, setShowLoading] = useState(false);
	const [submittedBrandName, setSubmittedBrandName] = useState('');

	const {
		register,
		handleSubmit,
		formState: { errors },
		setValue,
		watch,
		trigger,
		setError,
	} = useForm<FormData>({
		resolver: zodResolver(schema) as any,
		defaultValues: {
			brand_type: 'personal',
			client_name: '',
			audience: '',
			value_props: '',
			offers: '',
			brand_goals: '',
			voice_rules: '',
			brand_keywords: '',
			exclude_keywords: '',
			content_rules: '',
			additional_info: '',
			platforms_requested: [],
			timezone: '',
			language_region: 'US English',
			preferred_image_source: 'AI Generated',
			website: '',
			brand_palette: '',
			approval_contact_email: '',
			brand_assets_urls: [],
			personal_full_name: '',
			personal_job_title: '',
			personal_industry: '',
			personal_links: '',
			personal_headline: '',
			personal_audience: '',
			personal_expertise: '',
			personal_goals: '',
			personal_voice_traits: [],
			personal_tone_avoid: [],
			personal_risk_tolerance: undefined,
			personal_content_style: [],
			personal_exclude_keywords: '',
			personal_story: '',
			personal_assets_urls: [],
		},
	});

	const brandType = watch('brand_type');
	const isPersonal = brandType === 'personal';
	const watchedPlatforms = watch('platforms_requested') || [];
	const personalFullName = watch('personal_full_name');
	const personalBrandName = watch('client_name');

	useEffect(() => {
		setMounted(true);
		if (supabase) {
			supabase.auth.getUser().then((response: any) => {
				if (!response.data.user) {
					window.location.href = '/login';
				}
			});
		}
	}, [supabase]);

	useEffect(() => {
		if (isPersonal) {
			const trimmed = (personalFullName || '').trim();
			if (trimmed && (!personalBrandName || personalBrandName === '' || personalBrandName === personalFullName)) {
				setValue('client_name', trimmed, { shouldDirty: true });
			}
		}
	}, [isPersonal, personalFullName, personalBrandName, setValue]);

	const steps = useMemo(() => {
		if (isPersonal) {
			return [
				{
					id: 1,
					title: 'Personal Profile',
					fields: baseStepFields.personalBasics,
				},
			];
		}
		return [
			{ id: 1, title: 'Brand Basics', fields: baseStepFields.companyBasics },
			{ id: 2, title: 'Audience & Value', fields: baseStepFields.audience },
			{ id: 3, title: 'Voice & Content', fields: baseStepFields.voice },
			{ id: 4, title: 'Platforms & Assets', fields: baseStepFields.platforms },
		];
	}, [isPersonal]);

	const handleBrandTypeChange = (type: 'personal' | 'company') => {
		setValue('brand_type', type, { shouldDirty: true });
		if (type === 'company') {
			personalFields.forEach((field) => setValue(field, '', { shouldDirty: false }));
			setValue('client_name', '', { shouldDirty: true });
		}
	};

	const handleFileUpload = (urls: string[]) => {
		setValue('brand_assets_urls', urls, { shouldDirty: true });
	};

	const handlePersonalFileUpload = (urls: string[]) => {
		setValue('personal_assets_urls', urls, { shouldDirty: true });
	};

	const onSubmit = async (data: FormData) => {
		// Set loading state immediately on button click
		setSubmitting(true);
		
		try {
			console.log('Form submitted with data:', { isPersonal, data });
			
			// Check brand limit before submitting
			const brandsRes = await fetch('/api/brands', { cache: 'no-store' });
			const brandsData = await brandsRes.json();
			const currentBrandCount = brandsData.profiles?.length || 0;
			
			// Get user's plan and max brands
			const planRes = await fetch('/api/plan');
			const planData = await planRes.json();
			const plan = planData.planName?.toLowerCase() || 'free';
			
			// Get max brands from entitlements
			let maxBrands = 999;
			try {
				const entsRes = await fetch('/api/usage/summary');
				if (entsRes.ok) {
					const entsData = await entsRes.json();
					maxBrands = entsData.caps?.max_brands || 999;
				}
			} catch (err) {
				console.warn('Failed to get entitlements:', err);
			}
			
			if (currentBrandCount >= maxBrands) {
				setSubmitting(false); // Reset loading state
				alert(`You've reached the maximum number of brands for your plan (${maxBrands} brand${maxBrands !== 1 ? 's' : ''}). Please upgrade your package or create a new account to add more brands.`);
				return;
			}
		} catch (err) {
			console.error('Failed to check brand limit:', err);
			// Continue with submission if check fails
		}
		
		try {
			const inferredClientName = isPersonal
				? (data.personal_full_name?.trim() || 'Personal Brand')
				: (data.client_name?.trim() || 'Brand');
			const normalisedData = {
				...data,
				client_name: inferredClientName,
				// Pre-fill business-centric fields when personal to avoid downstream nulls
				audience: data.audience || data.personal_audience || 'Audience details captured via personal onboarding.',
				value_props: data.value_props || data.personal_headline || 'Personal brand value proposition provided in personal onboarding.',
				offers: data.offers || 'Personal brand creator package.',
				brand_goals: data.brand_goals || data.personal_goals || 'Personal brand objectives provided in personal onboarding.',
			};

			// Ensure arrays are properly formatted before sending
			// Helper function to safely convert to array
			const ensureArray = (value: any): string[] => {
				if (Array.isArray(value)) return value;
				if (typeof value === 'string') return value.trim() ? [value] : [];
				if (value === null || value === undefined) return [];
				return [];
			};
			
			// Build payload - exclude personal fields for company brands
			const basePayload = {
				...normalisedData,
				brand_assets_urls: ensureArray(normalisedData.brand_assets_urls),
				platforms_requested: ensureArray(normalisedData.platforms_requested),
			};
			
			// Only include personal fields if it's a personal brand
			const payloadData = isPersonal
				? {
						...basePayload,
						personal_assets_urls: ensureArray(normalisedData.personal_assets_urls),
					}
				: {
						...basePayload,
						// For company brands, set personal fields to empty defaults
						personal_full_name: '',
						personal_job_title: '',
						personal_industry: '',
						personal_links: '',
						personal_headline: '',
						personal_audience: '',
						personal_expertise: '',
						personal_goals: '',
						personal_voice_traits: [],
						personal_tone_avoid: [],
						personal_risk_tolerance: undefined,
						personal_content_style: [],
						personal_exclude_keywords: '',
						personal_story: '',
						personal_assets_urls: [],
					};

			// Debug logging
			if (typeof payloadData.personal_assets_urls !== 'undefined' && !Array.isArray(payloadData.personal_assets_urls)) {
				console.error('[Onboarding Form] personal_assets_urls is not an array before sending:', typeof payloadData.personal_assets_urls, payloadData.personal_assets_urls);
			}
			console.log('[Onboarding Form] Sending payload with personal_assets_urls:', Array.isArray(payloadData.personal_assets_urls) ? 'array' : typeof payloadData.personal_assets_urls, payloadData.personal_assets_urls);

			const res = await fetch('/api/onboarding', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(payloadData),
			});

			const result = await res.json();

			if (!res.ok) {
				console.error('Onboarding API error:', result);
				
				// Set field-specific errors if available
				if (result.fieldErrors && typeof result.fieldErrors === 'object') {
					// Set errors on the form for each field
					Object.entries(result.fieldErrors).forEach(([field, err]: [string, any]) => {
						setError(field as keyof FormData, {
							type: 'server',
							message: err.message || err || 'Validation error',
						});
					});
					// Still throw to prevent form submission
					throw new Error('Please fix the validation errors above');
				}
				
				// For non-field-specific errors, show a general error
				const errorMessage = result.error || result.details?.message || 'Failed to save brand profile';
				setError('root', {
					type: 'server',
					message: errorMessage,
				});
				throw new Error(errorMessage);
			}

			const airtableId: string | undefined = result?.airtableId;
			const brandName = inferredClientName;
			setSubmittedBrandName(brandName);
			setShowLoading(true);

			if (airtableId) {
				const combinedAssets = [...(normalisedData.brand_assets_urls || []), ...(normalisedData.personal_assets_urls || [])];
				const additionalSegments: string[] = [];
				if (normalisedData.personal_story) additionalSegments.push(`Personal Story: ${normalisedData.personal_story}`);
				if (normalisedData.personal_links) additionalSegments.push(`Links: ${normalisedData.personal_links}`);
				const additionalInfo = [normalisedData.additional_info, ...additionalSegments].filter(Boolean).join('\n\n');

				const strategyPayload = {
					airtableId,
					client_name: brandName,
					audience: normalisedData.audience,
					value_props: normalisedData.value_props,
					offers: normalisedData.offers,
					brand_goals: normalisedData.brand_goals,
					voice_rules: normalisedData.voice_rules,
					brand_keywords: normalisedData.brand_keywords,
					exclude_keywords: normalisedData.exclude_keywords,
					content_rules: normalisedData.content_rules,
					additional_info: additionalInfo,
					platforms_requested: normalisedData.platforms_requested,
					timezone: normalisedData.timezone,
					language_region: normalisedData.language_region,
					preferred_image_source: normalisedData.preferred_image_source,
					website: normalisedData.website,
					brand_palette: normalisedData.brand_palette,
					approval_contact_email: normalisedData.approval_contact_email,
					brand_assets_urls: combinedAssets,
				};

				await fetch('/api/strategy/generate', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify(strategyPayload),
				}).catch((hookError) => {
					console.error('strategy generation trigger failed', hookError);
				});
			}
		} catch (err: any) {
			console.error('Onboarding submission error:', err);
			setShowLoading(false);
			alert(err.message || 'Failed to save. Please try again.');
		} finally {
			setSubmitting(false);
		}
	};

	const nextStep = async () => {
		const currentFields = steps[currentStep - 1].fields;
		const filteredFields = currentFields.filter((field) => {
			if ((personalFields as readonly string[]).includes(field)) {
				return isPersonal;
			}
			if (field === 'client_name') {
				return !isPersonal;
			}
			return true;
		});
		const isValid = await trigger(filteredFields as any);
		if (isValid) {
			setCurrentStep(Math.min(currentStep + 1, steps.length));
		}
	};

	const prevStep = () => {
		setCurrentStep(Math.max(currentStep - 1, 1));
	};

	const handleLoadingComplete = () => {
		window.location.href = '/dashboard';
	};

	if (!mounted) {
		return (
			<div className="mx-auto max-w-3xl">
				<div className="card p-8 text-center">
					<div className="text-text-soft">Loading...</div>
				</div>
			</div>
		);
	}

	if (showLoading) {
		return <SubmissionLoading brandName={submittedBrandName} onComplete={handleLoadingComplete} />;
	}

	return (
		<div className="mx-auto max-w-3xl">
			<div className="mb-8">
				<div className="flex items-center justify-between mb-4">
					{steps.map((step, index) => (
						<div key={step.id} className="flex items-center flex-1">
							<div className="flex flex-col items-center flex-1">
								<div
									className={`
										w-10 h-10 rounded-full flex items-center justify-center text-sm font-medium border-2 transition
										${currentStep >= step.id ? 'bg-primary/20 border-primary/60 text-primary' : 'bg-surface/30 border-edge/60 text-text-dim'}
									`}
								>
									{currentStep > step.id ? '✓' : step.id}
								</div>
								<p className="mt-2 text-xs text-text-dim text-center">{step.title}</p>
							</div>
							{index < steps.length - 1 && (
								<div className={`h-0.5 flex-1 mx-2 ${currentStep > step.id ? 'bg-primary/40' : 'bg-edge/60'}`} />
							)}
						</div>
					))}
				</div>
			</div>

			<form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
				<AnimatePresence mode="wait">
					<motion.div
						key={currentStep}
						initial={{ opacity: 0, x: 20 }}
						animate={{ opacity: 1, x: 0 }}
						exit={{ opacity: 0, x: -20 }}
						transition={{ duration: 0.3 }}
					>
						<div className="card p-8 space-y-6">
							{currentStep === 1 && (
								<div className="space-y-6">
									<div>
										<h2 className="text-2xl font-semibold mb-2">Brand Basics</h2>
										<p className="text-text-dim">Tell us about your brand.</p>
									</div>

									<div>
										<label className="block text-sm font-medium mb-2">Brand Type *</label>
										<div className="inline-flex rounded-xl2 border border-edge/60 overflow-hidden">
											<button
												type="button"
												onClick={() => handleBrandTypeChange('personal')}
												className={`px-4 py-2 text-sm transition ${isPersonal ? 'bg-primary/15 border-r border-primary/40 text-primary' : 'text-text'}`}
											>
												Personal
											</button>
											<button
												type="button"
												onClick={() => handleBrandTypeChange('company')}
												className={`px-4 py-2 text-sm transition ${!isPersonal ? 'bg-primary/15 text-primary' : 'text-text'}`}
											>
												Company
											</button>
										</div>
									</div>

									{isPersonal ? (
										<div className="space-y-5 border border-primary/30 rounded-xl2 p-5 bg-primary/5">
											<input type="hidden" {...register('client_name')} />
											
											{/* Basic Information */}
											<div>
												<label className="block text-sm font-semibold mb-2">Full name? *</label>
												<input
													{...register('personal_full_name')}
													className="w-full rounded-xl2 border border-edge/60 bg-bg/80 px-4 py-3 text-text focus:border-primary/60 focus:outline-none focus:ring-1 focus:ring-primary/20"
													placeholder="e.g. Jordan Chen"
												/>
												{errors.personal_full_name && (
													<p className="mt-1 text-sm text-danger">{errors.personal_full_name.message}</p>
												)}
											</div>

											<div className="grid gap-4 md:grid-cols-2">
												<div>
													<label className="block text-sm font-semibold mb-2">Job title/role *</label>
													<input
														{...register('personal_job_title')}
														className="w-full rounded-xl2 border border-edge/60 bg-bg/80 px-4 py-3 text-text focus:border-primary/60 focus:outline-none focus:ring-1 focus:ring-primary/20"
														placeholder="e.g. Marketing Director"
													/>
													{errors.personal_job_title && (
														<p className="mt-1 text-sm text-danger">{errors.personal_job_title.message}</p>
													)}
												</div>

												<div>
													<label className="block text-sm font-semibold mb-2">Industry *</label>
													<input
														{...register('personal_industry')}
														className="w-full rounded-xl2 border border-edge/60 bg-bg/80 px-4 py-3 text-text focus:border-primary/60 focus:outline-none focus:ring-1 focus:ring-primary/20"
														placeholder="e.g. Technology, Finance, Healthcare"
													/>
													{errors.personal_industry && (
														<p className="mt-1 text-sm text-danger">{errors.personal_industry.message}</p>
													)}
												</div>
											</div>

											<div>
												<label className="block text-sm font-semibold mb-2">Website *</label>
												<input
													type="url"
													{...register('personal_links')}
													className="w-full rounded-xl2 border border-edge/60 bg-bg/80 px-4 py-3 text-text focus:border-primary/60 focus:outline-none focus:ring-1 focus:ring-primary/20"
													placeholder="https://yourwebsite.com"
												/>
												{errors.personal_links && (
													<p className="mt-1 text-sm text-danger">{errors.personal_links.message}</p>
												)}
											</div>

											{/* Content Strategy */}
											<div>
												<label className="block text-sm font-semibold mb-2">Describe yourself in one sentence *</label>
												<input
													{...register('personal_headline')}
													className="w-full rounded-xl2 border border-edge/60 bg-bg/80 px-4 py-3 text-text focus:border-primary/60 focus:outline-none focus:ring-1 focus:ring-primary/20"
													placeholder="Helping founders scale through data-driven marketing"
												/>
												{errors.personal_headline && (
													<p className="mt-1 text-sm text-danger">{errors.personal_headline.message}</p>
												)}
											</div>

											<div>
												<label className="block text-sm font-semibold mb-2">Who is your primary audience? *</label>
												<textarea
													{...register('personal_audience')}
													rows={3}
													className="w-full rounded-xl2 border border-edge/60 bg-bg/80 px-4 py-3 text-text focus:border-primary/60 focus:outline-none focus:ring-1 focus:ring-primary/20 resize-none"
													placeholder="Describe your ideal audience"
												/>
												{errors.personal_audience && (
													<p className="mt-1 text-sm text-danger">{errors.personal_audience.message}</p>
												)}
											</div>

											<div>
												<label className="block text-sm font-semibold mb-2">What subjects or themes do you want to post about regularly? *</label>
												<textarea
													{...register('personal_expertise')}
													rows={3}
													className="w-full rounded-xl2 border border-edge/60 bg-bg/80 px-4 py-3 text-text focus:border-primary/60 focus:outline-none focus:ring-1 focus:ring-primary/20 resize-none"
													placeholder="Digital marketing, leadership, productivity, AI tools..."
												/>
												{errors.personal_expertise && (
													<p className="mt-1 text-sm text-danger">{errors.personal_expertise.message}</p>
												)}
											</div>

											<div>
												<label className="block text-sm font-semibold mb-2">What do you want to achieve with your content? *</label>
												<textarea
													{...register('personal_goals')}
													rows={3}
													className="w-full rounded-xl2 border border-edge/60 bg-bg/80 px-4 py-3 text-text focus:border-primary/60 focus:outline-none focus:ring-1 focus:ring-primary/20 resize-none"
													placeholder="Grow authority, attract clients, build community..."
												/>
												{errors.personal_goals && (
													<p className="mt-1 text-sm text-danger">{errors.personal_goals.message}</p>
												)}
											</div>

											{/* Voice & Tone */}
											<div>
												<label className="block text-sm font-semibold mb-2">What is your Tone & Style? * (Select up to 3)</label>
												<div className="grid grid-cols-2 md:grid-cols-3 gap-2">
													{['Optimistic', 'Warm', 'Helpful', 'Inspirational', 'Confident', 'Direct', 'Analytical', 'Corporate', 'Calm', 'Playful', 'Friendly', 'Expert-led', 'Conversational', 'Witty', 'Insightful', 'Knowledgeable', 'Trustworthy'].map((trait) => {
														const currentTraits = (watch('personal_voice_traits') as string[]) || [];
														const isSelected = currentTraits.includes(trait);
														const isMaxed = currentTraits.length >= 3 && !isSelected;
														return (
															<label
																key={trait}
																className={`
																	flex items-center gap-2 p-2 rounded-lg border cursor-pointer transition text-sm
																	${isSelected ? 'bg-primary/15 border-primary/50 text-primary' : isMaxed ? 'opacity-50 cursor-not-allowed bg-surface/70 border-edge/40' : 'bg-surface/70 border-edge/60 hover:bg-surface/80 hover:border-edge/80'}
																`}
															>
																<input
																	type="checkbox"
																	checked={isSelected}
																	disabled={isMaxed}
																	onChange={() => {
																		const current = currentTraits;
																		const next = isSelected ? current.filter((t) => t !== trait) : [...current, trait].slice(0, 3);
																		setValue('personal_voice_traits', next, { shouldDirty: true });
																	}}
																	className="sr-only"
																/>
																<span>{trait}</span>
															</label>
														);
													})}
												</div>
												<p className="mt-1 text-xs text-text-dim">Selected: {((watch('personal_voice_traits') as string[]) || []).length}/3</p>
												{errors.personal_voice_traits && (
													<p className="mt-1 text-sm text-danger">{errors.personal_voice_traits.message}</p>
												)}
											</div>

											<div>
												<label className="block text-sm font-semibold mb-2">What tone should we absolutely avoid? * (Select all that apply)</label>
												<div className="grid grid-cols-2 md:grid-cols-3 gap-2">
													{['Negative', 'Critical', 'Confrontational', 'Cynical', 'Judgmental', 'Sarcastic', 'Too personal', 'Too emotional', 'Too corporate', 'Too verbose', 'rants'].map((tone) => {
														const currentAvoid = (watch('personal_tone_avoid') as string[]) || [];
														const isSelected = currentAvoid.includes(tone);
														return (
															<label
																key={tone}
																className={`
																	flex items-center gap-2 p-2 rounded-lg border cursor-pointer transition text-sm
																	${isSelected ? 'bg-danger/15 border-danger/50 text-danger' : 'bg-surface/70 border-edge/60 hover:bg-surface/80 hover:border-edge/80'}
																`}
															>
																<input
																	type="checkbox"
																	checked={isSelected}
																	onChange={() => {
																		const current = currentAvoid;
																		const next = isSelected ? current.filter((t) => t !== tone) : [...current, tone];
																		setValue('personal_tone_avoid', next, { shouldDirty: true });
																	}}
																	className="sr-only"
																/>
																<span>{tone}</span>
															</label>
														);
													})}
												</div>
												{errors.personal_tone_avoid && (
													<p className="mt-1 text-sm text-danger">{errors.personal_tone_avoid.message}</p>
												)}
											</div>

											<div>
												<label className="block text-sm font-semibold mb-2">What is your Risk tolerance level? Select one *</label>
												<select
													{...register('personal_risk_tolerance')}
													className="w-full rounded-xl2 border border-edge/60 bg-bg/80 px-4 py-3 text-text focus:border-primary/60 focus:outline-none focus:ring-1 focus:ring-primary/20"
												>
													<option value="">Select risk tolerance level...</option>
													<option value="Low risk (safe, neutral, reputation-protected)">Low risk (safe, neutral, reputation-protected)</option>
													<option value="Medium risk (balanced, industry-relevant opinions)">Medium risk (balanced, industry-relevant opinions)</option>
													<option value="High risk (strong viewpoints, controversial insights)">High risk (strong viewpoints, controversial insights)</option>
												</select>
												{errors.personal_risk_tolerance && (
													<p className="mt-1 text-sm text-danger">{errors.personal_risk_tolerance.message}</p>
												)}
											</div>

											{/* Content Style */}
											<div>
												<label className="block text-sm font-semibold mb-2">Content Style Preference * (Select up to 4)</label>
												<div className="grid grid-cols-2 md:grid-cols-3 gap-2">
													{['Story-based posts', 'Tactical how-to posts', 'Thought leadership', 'Short punchy posts', 'Case studies', 'Listicals', 'Analogy / metaphor style', 'Principle-based posts (rules, lessons, frameworks)', 'Founder/leader insights', 'Soft Corporate Tone', 'Data-driven Content', 'Conversational tone', 'Statistic based'].map((style) => {
														const currentStyles = (watch('personal_content_style') as string[]) || [];
														const isSelected = currentStyles.includes(style);
														const isMaxed = currentStyles.length >= 4 && !isSelected;
														return (
															<label
																key={style}
																className={`
																	flex items-center gap-2 p-2 rounded-lg border cursor-pointer transition text-sm
																	${isSelected ? 'bg-primary/15 border-primary/50 text-primary' : isMaxed ? 'opacity-50 cursor-not-allowed bg-surface/70 border-edge/40' : 'bg-surface/70 border-edge/60 hover:bg-surface/80 hover:border-edge/80'}
																`}
															>
																<input
																	type="checkbox"
																	checked={isSelected}
																	disabled={isMaxed}
																	onChange={() => {
																		const current = currentStyles;
																		const next = isSelected ? current.filter((s) => s !== style) : [...current, style].slice(0, 4);
																		setValue('personal_content_style', next, { shouldDirty: true });
																	}}
																	className="sr-only"
																/>
																<span className="text-xs">{style}</span>
															</label>
														);
													})}
												</div>
												<p className="mt-1 text-xs text-text-dim">Selected: {((watch('personal_content_style') as string[]) || []).length}/4</p>
												{errors.personal_content_style && (
													<p className="mt-1 text-sm text-danger">{errors.personal_content_style.message}</p>
												)}
											</div>

											<div>
												<label className="block text-sm font-semibold mb-2">Words, phrases your themes you want to avoid? (optional)</label>
												<input
													{...register('personal_exclude_keywords')}
													className="w-full rounded-xl2 border border-edge/60 bg-bg/80 px-4 py-3 text-text focus:border-primary/60 focus:outline-none focus:ring-1 focus:ring-primary/20"
													placeholder="e.g. spam, clickbait, jargon"
												/>
											</div>

											{/* Personal Story */}
											<div>
												<label className="block text-sm font-semibold mb-2">What particular experiences or achievements would you like to highlight or center the content around ie. what's your personal story *</label>
												<textarea
													{...register('personal_story')}
													rows={4}
													className="w-full rounded-xl2 border border-edge/60 bg-bg/80 px-4 py-3 text-text focus:border-primary/60 focus:outline-none focus:ring-1 focus:ring-primary/20 resize-none"
													placeholder="Notable roles, results, awards, milestones, experiences..."
												/>
												{errors.personal_story && (
													<p className="mt-1 text-sm text-danger">{errors.personal_story.message}</p>
												)}
											</div>

											{/* Assets */}
											<div>
												<label className="block text-sm font-semibold mb-2">Upload a profile photo, your CV or other assets (optional)</label>
												<FileUpload onUpload={handlePersonalFileUpload} />
												<p className="mt-2 text-xs text-text-dim">We'll reference these in social content where appropriate.</p>
											</div>

											{/* Settings */}
											<div className="grid gap-4 md:grid-cols-2">
												<div>
													<label className="block text-sm font-semibold mb-2">Timezone *</label>
													<select
														{...register('timezone')}
														className="w-full rounded-xl2 border border-edge/60 bg-bg/80 px-4 py-3 text-text focus:border-primary/60 focus:outline-none focus:ring-1 focus:ring-primary/20"
													>
														<option value="">Select timezone...</option>
														{TIMEZONES.map((tz) => (
															<option key={tz} value={tz}>
																{tz}
															</option>
														))}
													</select>
													{errors.timezone && <p className="mt-1 text-sm text-danger">{errors.timezone.message}</p>}
												</div>

												<div>
													<label className="block text-sm font-medium mb-2">Preferred Image Source *</label>
													<select
														{...register('preferred_image_source')}
														className="w-full rounded-xl2 border border-edge/60 bg-bg/80 px-4 py-3 text-text focus:border-primary/60 focus:outline-none focus:ring-1 focus:ring-primary/20"
													>
														<option value="AI Generated">AI Generated</option>
														<option value="Stock">Stock</option>
														<option value="Brand">Brand</option>
													</select>
												</div>
											</div>

											<div>
												<label className="block text-sm font-semibold mb-2">Language / Region *</label>
												<select
													{...register('language_region')}
													className="w-full rounded-xl2 border border-edge/60 bg-bg/80 px-4 py-3 text-text focus:border-primary/60 focus:outline-none focus:ring-1 focus:ring-primary/20"
												>
													<option value="US English">US English</option>
													<option value="UK English">UK English</option>
													<option value="AU English">AU English</option>
												</select>
											</div>

											<div>
												<label className="block text-sm font-semibold mb-3">Platforms (select the channels you wish to publish to) *</label>
												<div className="grid grid-cols-2 md:grid-cols-3 gap-3">
													{PlatformsEnum.options.map((platform) => {
														const isSelected = watchedPlatforms.includes(platform);
														return (
															<label
																key={platform}
																className={`
																	flex items-center gap-2 p-3 rounded-xl2 border cursor-pointer transition
																	${isSelected ? 'bg-primary/15 border-primary/50 text-primary' : 'bg-surface/30 border-edge/60 hover:border-edge/80'}
																`}
															>
																<input
																	type="checkbox"
																	checked={isSelected}
																	onChange={() => {
																		const current = watchedPlatforms || [];
																		const next = isSelected ? current.filter((p) => p !== platform) : [...current, platform];
																		setValue('platforms_requested', next as FormData['platforms_requested'], { shouldDirty: true });
																	}}
																	className="sr-only"
																/>
																<span className="text-sm">{platform}</span>
															</label>
														);
													})}
												</div>
												{errors.platforms_requested && <p className="mt-2 text-sm text-danger">{errors.platforms_requested.message}</p>}
											</div>
										</div>
								) : (
										<div className="space-y-5">
											<div>
												<label className="block text-sm font-medium mb-2">Brand Name *</label>
												<input
													{...register('client_name')}
													className="w-full rounded-xl2 border border-edge/60 bg-bg/80 px-4 py-3 text-text focus:border-primary/60 focus:outline-none focus:ring-1 focus:ring-primary/20"
													placeholder="Your brand name"
												/>
												{errors.client_name && (
													<p className="mt-1 text-sm text-danger">{errors.client_name.message}</p>
												)}
											</div>

											<div>
												<label className="block text-sm font-medium mb-2">Website</label>
												<input
													{...register('website')}
													className="w-full rounded-xl2 border border-edge/60 bg-bg/80 px-4 py-3 text-text focus:border-primary/60 focus:outline-none focus:ring-1 focus:ring-primary/20"
													placeholder="https://example.com (optional)"
												/>
												{errors.website && <p className="mt-1 text-sm text-danger">{errors.website.message}</p>}
											</div>

											<div>
												<label className="block text-sm font-medium mb-2">Timezone *</label>
												<select
													{...register('timezone')}
													className="w-full rounded-xl2 border border-edge/60 bg-bg/80 px-4 py-3 text-text focus:border-primary/60 focus:outline-none focus:ring-1 focus:ring-primary/20"
												>
													<option value="">Select timezone...</option>
													{TIMEZONES.map((tz) => (
														<option key={tz} value={tz}>
															{tz}
														</option>
													))}
												</select>
												{errors.timezone && <p className="mt-1 text-sm text-danger">{errors.timezone.message}</p>}
											</div>

											<div className="grid gap-4 md:grid-cols-2">
												<div>
													<label className="block text-sm font-medium mb-2">
														Approval Contact Email {isPersonal ? '(optional)' : '*'}
													</label>
													<input
														{...register('approval_contact_email')}
														className="w-full rounded-xl2 border border-edge/60 bg-bg/80 px-4 py-3 text-text focus:border-primary/60 focus:outline-none focus:ring-1 focus:ring-primary/20"
														placeholder="approver@example.com"
													/>
													{errors.approval_contact_email && (
														<p className="mt-1 text-sm text-danger">{errors.approval_contact_email.message}</p>
													)}
												</div>

												<div>
													<label className="block text-sm font-medium mb-2">Preferred Image Source *</label>
													<select
														{...register('preferred_image_source')}
														className="w-full rounded-xl2 border border-edge/60 bg-bg/80 px-4 py-3 text-text focus:border-primary/60 focus:outline-none focus:ring-1 focus:ring-primary/20"
													>
														<option value="AI Generated">AI Generated</option>
														<option value="Stock">Stock</option>
														<option value="Brand">Brand</option>
													</select>
												</div>
											</div>
										</div>
									)}

									{!isPersonal && (
										<div>
											<label className="block text-sm font-semibold mb-2">Language / Region *</label>
											<select
												{...register('language_region')}
												className="w-full rounded-xl2 border border-edge/60 bg-bg/80 px-4 py-3 text-text focus:border-primary/60 focus:outline-none focus:ring-1 focus:ring-primary/20"
											>
												<option value="US English">US English</option>
												<option value="UK English">UK English</option>
												<option value="AU English">AU English</option>
											</select>
										</div>
									)}
								</div>
							)}

							{currentStep === 2 && (
								<div className="space-y-6">
									<div>
										<h2 className="text-2xl font-semibold mb-2">Audience & Value</h2>
										<p className="text-text-dim">Who you serve and what you offer.</p>
									</div>

									<div>
										<label className="block text-sm font-medium mb-2">Who do you want your content to reach or influence? (Your Audience) *</label>
										<textarea
											{...register('audience')}
											rows={4}
											className="w-full rounded-xl2 border border-edge/60 bg-bg/80 px-4 py-3 text-text focus:border-primary/60 focus:outline-none focus:ring-1 focus:ring-primary/20 resize-none"
											placeholder="Describe your target audience, demographics, pain points..."
										/>
										{errors.audience && <p className="mt-1 text-sm text-danger">{errors.audience.message}</p>}
									</div>

									<div>
										<label className="block text-sm font-medium mb-2">Unique Value Propositions *</label>
										<textarea
											{...register('value_props')}
											rows={4}
											className="w-full rounded-xl2 border border-edge/60 bg-bg/80 px-4 py-3 text-text focus:border-primary/60 focus:outline-none focus:ring-1 focus:ring-primary/20 resize-none"
											placeholder="What makes your brand unique?"
										/>
										{errors.value_props && <p className="mt-1 text-sm text-danger">{errors.value_props.message}</p>}
									</div>

									<div>
										<label className="block text-sm font-medium mb-2">Offers / Products *</label>
										<textarea
											{...register('offers')}
											rows={3}
											className="w-full rounded-xl2 border border-edge/60 bg-bg/80 px-4 py-3 text-text focus:border-primary/60 focus:outline-none focus:ring-1 focus:ring-primary/20 resize-none"
											placeholder="List your main offers, services, or products"
										/>
										{errors.offers && <p className="mt-1 text-sm text-danger">{errors.offers.message}</p>}
									</div>

									<div>
										<label className="block text-sm font-medium mb-2">Content Engine Objectives *</label>
										<textarea
											{...register('brand_goals')}
											rows={3}
											className="w-full rounded-xl2 border border-edge/60 bg-bg/80 px-4 py-3 text-text focus:border-primary/60 focus:outline-none focus:ring-1 focus:ring-primary/20 resize-none"
											placeholder="Grow authority, attract clients, build community..."
										/>
										{errors.brand_goals && <p className="mt-1 text-sm text-danger">{errors.brand_goals.message}</p>}
									</div>
								</div>
							)}

							{currentStep === 3 && (
								<div className="space-y-6">
									<div>
										<h2 className="text-2xl font-semibold mb-2">Voice & Content Rules</h2>
										<p className="text-text-dim">Define guardrails for tone, language, and red flags.</p>
									</div>

									<div>
										<label className="block text-sm font-medium mb-2">Voice Rules</label>
										<textarea
											{...register('voice_rules')}
											rows={3}
											className="w-full rounded-xl2 border border-edge/60 bg-bg/80 px-4 py-3 text-text focus:border-primary/60 focus:outline-none focus:ring-1 focus:ring-primary/20 resize-none"
											placeholder="Tone, style, personality..."
										/>
									</div>

									<div className="grid gap-4 md:grid-cols-2">
										<div>
											<label className="block text-sm font-medium mb-2">Preferred Keywords / Phrases</label>
											<textarea
												{...register('brand_keywords')}
												rows={2}
												className="w-full rounded-xl2 border border-edge/60 bg-bg/80 px-4 py-3 text-text focus:border-primary/60 focus:outline-none focus:ring-1 focus:ring-primary/20 resize-none"
												placeholder="Important words or phrases to use"
											/>
										</div>

										<div>
											<label className="block text-sm font-medium mb-2">Topics / Phrases to Avoid</label>
											<textarea
												{...register('exclude_keywords')}
												rows={2}
												className="w-full rounded-xl2 border border-edge/60 bg-bg/80 px-4 py-3 text-text focus:border-primary/60 focus:outline-none focus:ring-1 focus:ring-primary/20 resize-none"
												placeholder="Topics, phrases, or words to avoid"
											/>
										</div>
									</div>

									<div>
										<label className="block text-sm font-medium mb-2">Content Rules / Flags</label>
										<textarea
											{...register('content_rules')}
											rows={2}
											className="w-full rounded-xl2 border border-edge/60 bg-bg/80 px-4 py-3 text-text focus:border-primary/60 focus:outline-none focus:ring-1 focus:ring-primary/20 resize-none"
											placeholder="Any compliance notes or guidelines"
										/>
									</div>

									<div>
										<label className="block text-sm font-medium mb-2">Additional Information</label>
										<textarea
											{...register('additional_info')}
											rows={3}
											className="w-full rounded-xl2 border border-edge/60 bg-bg/80 px-4 py-3 text-text focus:border-primary/60 focus:outline-none focus:ring-1 focus:ring-primary/20 resize-none"
											placeholder="Any other notes, links, or context sources"
										/>
									</div>
								</div>
							)}

							{currentStep === 4 && (
								<div className="space-y-6">
									<div>
										<h2 className="text-2xl font-semibold mb-2">Platforms & Assets</h2>
										<p className="text-text-dim">Select platforms and upload assets.</p>
									</div>

									<div>
										<label className="block text-sm font-medium mb-3">Platforms *</label>
										<div className="grid grid-cols-2 md:grid-cols-3 gap-3">
											{PlatformsEnum.options.map((platform) => {
												const isSelected = watchedPlatforms.includes(platform);
												return (
													<label
														key={platform}
														className={`
															flex items-center gap-2 p-3 rounded-xl2 border cursor-pointer transition
															${isSelected ? 'bg-primary/15 border-primary/50 text-primary' : 'bg-surface/30 border-edge/60 hover:border-edge/80'}
														`}
													>
														<input
															 type="checkbox"
															 checked={isSelected}
															 onChange={() => {
																const current = watchedPlatforms || [];
																const next = isSelected ? current.filter((p) => p !== platform) : [...current, platform];
																setValue('platforms_requested', next as FormData['platforms_requested'], { shouldDirty: true });
														}}
														className="sr-only"
													/>
													<span className="text-sm">{platform}</span>
												</label>
											);
										})}
									</div>
									{errors.platforms_requested && <p className="mt-2 text-sm text-danger">{errors.platforms_requested.message}</p>}
								</div>

								<div>
									<label className="block text-sm font-medium mb-2">Brand Palette</label>
									<textarea
										{...register('brand_palette')}
										rows={2}
										className="w-full rounded-xl2 border border-edge/60 bg-bg/80 px-4 py-3 text-text focus:border-primary/60 focus:outline-none focus:ring-1 focus:ring-primary/20 resize-none"
										placeholder="e.g., Primary: #8AB4F8, Secondary: #4FF0B8"
									/>
								</div>

								<div>
									<label className="block text-sm font-medium mb-2">Brand Assets</label>
									<FileUpload onUpload={handleFileUpload} />
									<p className="mt-2 text-xs text-text-dim">Upload guidelines, logos, or other reference assets (optional).</p>
								</div>
							</div>
						)}
						</div>
					</motion.div>
				</AnimatePresence>

				<div className="flex items-center justify-between pt-6">
					<button
						type="button"
						onClick={prevStep}
						disabled={currentStep === 1}
						className={`
							px-6 py-3 rounded-xl2 border transition active:scale-[0.99] active:bg-surface/60
							${currentStep === 1 ? 'border-edge/40 bg-surface/20 text-text-dim cursor-not-allowed' : 'border-edge/60 bg-surface/30 text-text hover:bg-surface/50'}
						`}
					>
						← Previous
					</button>

					{currentStep < steps.length ? (
						<LoadingButton
							type="button"
							onClick={nextStep}
						>
							Next →
						</LoadingButton>
					) : (
						<LoadingButton
							type="submit"
							loading={submitting}
							loadingText="Saving..."
							onClick={(e) => {
								e.preventDefault();
								handleSubmit(
									onSubmit,
									(validationErrors) => {
										setSubmitting(false); // Reset loading state on validation error
										console.log('Form validation failed:', JSON.stringify(validationErrors, null, 2));
										// Find the first error with a message
										for (const [fieldName, error] of Object.entries(validationErrors)) {
											if (error) {
												// Handle both single error object and array of errors
												const errorArray = Array.isArray(error) ? error : [error];
												for (const err of errorArray) {
													const errorObj = err as { message?: string; type?: string };
													if (errorObj?.message) {
														alert(`Validation error: ${errorObj.message}`);
														return;
													}
												}
											}
										}
										// Fallback if no message found
										const firstField = Object.keys(validationErrors)[0];
										alert(`Validation error: Please fix the ${firstField || 'form'} field`);
									}
								)();
							}}
						>
							Save Brand Profile
						</LoadingButton>
					)}
				</div>
			</form>
		</div>
	);
}
