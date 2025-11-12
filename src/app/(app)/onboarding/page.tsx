"use client";

import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { motion, AnimatePresence } from 'framer-motion';
import { FileUpload } from '@/components/FileUpload';
import { SubmissionLoading } from '@/components/SubmissionLoading';
import { TIMEZONES } from '@/lib/timezones';
import { useSupabase } from '@/components/SupabaseProvider';

const PlatformsEnum = z.enum(['LinkedIn', 'X', 'Instagram', 'Facebook', 'Blog', 'Medium']);
const LanguageRegionEnum = z.enum(['US English', 'UK English', 'AU English']);
const PreferredImageSourceEnum = z.enum(['AI Generated', 'Stock', 'Brand']);
const BrandTypeEnum = z.enum(['company', 'personal']);

const schema = z
	.object({
		brand_type: BrandTypeEnum,
		client_name: z.string().min(2, 'Brand name must be at least 2 characters'),
		audience: z.string().min(10, 'Please describe your audience (at least 10 characters)'),
		value_props: z.string().min(10, 'Please describe your value propositions (at least 10 characters)'),
		offers: z.string().min(5, 'Please describe your offers/products (at least 5 characters)'),
		brand_goals: z.string().min(10, 'Please describe your objectives'),
		voice_rules: z.string().default(''),
		brand_keywords: z.string().default(''),
		exclude_keywords: z.string().default(''),
		content_rules: z.string().default(''),
		additional_info: z.string().default(''),
		platforms_requested: z.array(PlatformsEnum).min(1, 'Select at least one platform'),
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
		approval_contact_email: z.string().email('Invalid email address'),
		brand_assets_urls: z.array(z.string().url()).default([]),
		personal_full_name: z.string().default(''),
		personal_headline: z.string().default(''),
		personal_expertise: z.string().default(''),
		personal_audience: z.string().default(''),
		personal_goals: z.string().default(''),
		personal_voice_traits: z.string().default(''),
		personal_story: z.string().default(''),
		personal_links: z.string().default(''),
		personal_assets_urls: z.array(z.string().url()).default([]),
		assistants: z.string().default(''),
		ghost_writer_preference: z.enum(['Yes', 'No', 'Sometimes']).default('Yes'),
	})
	.superRefine((data, ctx) => {
		if (data.brand_type === 'personal') {
			const requiredPersonal: Array<[keyof typeof data, string]> = [
				['personal_full_name', 'Please provide your full name'],
				['personal_headline', 'Please provide your headline'],
				['personal_expertise', 'Please describe your expertise'],
				['personal_audience', 'Please describe your audience'],
				['personal_goals', 'Please describe your goals'],
				['personal_voice_traits', 'Please describe your voice traits'],
				['personal_story', 'Please share your credibility highlights'],
			];

			requiredPersonal.forEach(([field, message]) => {
				if (!(data[field] as string)?.trim()) {
					ctx.addIssue({ path: [field], code: z.ZodIssueCode.custom, message });
				}
			});
		}
	});

type FormData = z.infer<typeof schema>;

const personalFields = [
	'personal_full_name',
	'personal_headline',
	'personal_expertise',
	'personal_audience',
	'personal_goals',
	'personal_voice_traits',
	'personal_story',
	'personal_links',
	'personal_assets_urls',
	'assistants',
	'ghost_writer_preference',
] as const;

const baseStepFields = {
	companyBasics: ['brand_type', 'client_name', 'website', 'timezone', 'approval_contact_email', 'language_region', 'preferred_image_source'] as const,
	personalBasics: [
		'brand_type',
		'personal_full_name',
		'personal_headline',
		'personal_expertise',
		'personal_audience',
		'personal_goals',
		'personal_voice_traits',
		'personal_story',
		'personal_links',
		'personal_assets_urls',
		'assistants',
		'ghost_writer_preference',
		'client_name',
		'website',
		'timezone',
		'approval_contact_email',
		'language_region',
		'preferred_image_source',
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
			personal_headline: '',
			personal_expertise: '',
			personal_audience: '',
			personal_goals: '',
			personal_voice_traits: '',
			personal_story: '',
			personal_links: '',
			personal_assets_urls: [],
			assistants: '',
			ghost_writer_preference: 'Yes',
		},
	});

	const brandType = watch('brand_type');
	const isPersonal = brandType === 'personal';
	const watchedPlatforms = watch('platforms_requested') || [];

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

	const steps = useMemo(
		() => [
			{
				id: 1,
				title: 'Brand Basics',
				fields: isPersonal ? baseStepFields.personalBasics : baseStepFields.companyBasics,
			},
			{ id: 2, title: 'Audience & Value', fields: baseStepFields.audience },
			{ id: 3, title: 'Voice & Content', fields: baseStepFields.voice },
			{ id: 4, title: 'Platforms & Assets', fields: baseStepFields.platforms },
		],
		[isPersonal]
	);

	const handleBrandTypeChange = (type: 'personal' | 'company') => {
		setValue('brand_type', type, { shouldDirty: true });
		if (type === 'company') {
			personalFields.forEach((field) => setValue(field, '', { shouldDirty: false }));
		}
	};

	const handleFileUpload = (urls: string[]) => {
		setValue('brand_assets_urls', urls, { shouldDirty: true });
	};

	const handlePersonalFileUpload = (urls: string[]) => {
		setValue('personal_assets_urls', urls, { shouldDirty: true });
	};

	const onSubmit = async (data: FormData) => {
		setSubmitting(true);
		try {
			const res = await fetch('/api/onboarding', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(data),
			});

			const result = await res.json();

			if (!res.ok) {
				throw new Error(result.error || 'Failed to save brand profile');
			}

			setSubmittedBrandName(data.client_name || data.personal_full_name || 'Your brand');
			setShowLoading(true);
		} catch (err: any) {
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
											<div>
												<label className="block text-sm font-medium mb-2">What is your full name? *</label>
												<input
													{...register('personal_full_name')}
													className="w-full rounded-xl2 border border-edge/60 bg-bg/80 px-4 py-3 text-text focus:border-primary/60 focus:outline-none focus:ring-1 focus:ring-primary/20"
													placeholder="e.g. Jordan Chen"
												/>
												{errors.personal_full_name && (
													<p className="mt-1 text-sm text-danger">{errors.personal_full_name.message}</p>
												)}
											</div>

											<div>
												<label className="block text-sm font-medium mb-2">How do you describe yourself in one sentence? *</label>
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
												<label className="block text-sm font-medium mb-2">What subjects or themes do you want to post about regularly? *</label>
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
												<label className="block text-sm font-medium mb-2">Who do you want your content to reach or influence? *</label>
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

											<div className="grid gap-4 md:grid-cols-2">
												<div>
													<label className="block text-sm font-medium mb-2">What do you want to achieve with your content? *</label>
													<textarea
														{...register('personal_goals')}
														rows={2}
														className="w-full rounded-xl2 border border-edge/60 bg-bg/80 px-4 py-3 text-text focus:border-primary/60 focus:outline-none focus:ring-1 focus:ring-primary/20 resize-none"
														placeholder="Grow authority, attract clients, build community..."
													/>
													{errors.personal_goals && (
														<p className="mt-1 text-sm text-danger">{errors.personal_goals.message}</p>
													)}
												</div>

												<div>
													<label className="block text-sm font-medium mb-2">How would you describe your communication style? *</label>
													<textarea
														{...register('personal_voice_traits')}
														rows={2}
														className="w-full rounded-xl2 border border-edge/60 bg-bg/80 px-4 py-3 text-text focus:border-primary/60 focus:outline-none focus:ring-1 focus:ring-primary/20 resize-none"
														placeholder="Bold, analytical, witty, educational..."
													/>
													{errors.personal_voice_traits && (
														<p className="mt-1 text-sm text-danger">{errors.personal_voice_traits.message}</p>
													)}
												</div>
											</div>

											<div>
												<label className="block text-sm font-medium mb-2">What experience or achievements should your audience know about? *</label>
												<textarea
													{...register('personal_story')}
													rows={3}
													className="w-full rounded-xl2 border border-edge/60 bg-bg/80 px-4 py-3 text-text focus:border-primary/60 focus:outline-none focus:ring-1 focus:ring-primary/20 resize-none"
													placeholder="Notable roles, results, awards, milestones"
												/>
												{errors.personal_story && (
													<p className="mt-1 text-sm text-danger">{errors.personal_story.message}</p>
												)}
											</div>

											<div>
												<label className="block text-sm font-medium mb-2">Add any links you’d like referenced (optional)</label>
												<textarea
													{...register('personal_links')}
													rows={2}
													className="w-full rounded-xl2 border border-edge/60 bg-bg/80 px-4 py-3 text-text focus:border-primary/60 focus:outline-none focus:ring-1 focus:ring-primary/20 resize-none"
													placeholder="Website, portfolio, podcast, Twitter, YouTube..."
												/>
											</div>

											<div>
												<label className="block text-sm font-medium mb-2">Upload a profile photo or assets (optional)</label>
												<FileUpload onUpload={handlePersonalFileUpload} />
												<p className="mt-2 text-xs text-text-dim">We’ll reference these in social content where appropriate.</p>
											</div>

											<div className="grid gap-4 md:grid-cols-2">
												<div>
													<label className="block text-sm font-medium mb-2">Should anyone else review content? (optional)</label>
													<input
														{...register('assistants')}
														className="w-full rounded-xl2 border border-edge/60 bg-bg/80 px-4 py-3 text-text focus:border-primary/60 focus:outline-none focus:ring-1 focus:ring-primary/20"
														placeholder="Names or emails"
												/>
											</div>

												<div>
													<label className="block text-sm font-medium mb-2">Ghost writing preference</label>
													<select
														{...register('ghost_writer_preference')}
														className="w-full rounded-xl2 border border-edge/60 bg-bg/80 px-4 py-3 text-text focus:border-primary/60 focus:outline-none focus:ring-1 focus:ring-primary/20"
													>
														<option value="Yes">Yes – write fully in my voice</option>
														<option value="No">No – I’ll draft my own pieces</option>
														<option value="Sometimes">Sometimes – co-authored</option>
													</select>
												</div>
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
													<label className="block text-sm font-medium mb-2">Approval Contact Email *</label>
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

								<div>
									<label className="block text-sm font-medium mb-2">Language / Region *</label>
									<select
										{...register('language_region')}
										className="w-full rounded-xl2 border border-edge/60 bg-bg/80 px-4 py-3 text-text focus:border-primary/60 focus:outline-none focus:ring-1 focus:ring-primary/20"
									>
										<option value="US English">US English</option>
										<option value="UK English">UK English</option>
										<option value="AU English">AU English</option>
									</select>
								</div>
							</div>
						)}
					</motion.div>
				</AnimatePresence>

				{currentStep === 2 && (
					<div className="space-y-6">
						<div>
							<h2 className="text-2xl font-semibold mb-2">Audience & Value</h2>
							<p className="text-text-dim">Who you serve and what you offer.</p>
						</div>

						<div>
							<label className="block text-sm font-medium mb-2">Audience *</label>
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
									className="w-full rounded-xl2 border border-edge/60 bg-bg/80 px-4 py-3 text-text focus;border-primary/60 focus:outline-none focus:ring-1 focus:ring-primary/20 resize-none"
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

				<div className="flex items-center justify-between pt-6">
					<button
						type="button"
						onClick={prevStep}
						disabled={currentStep === 1}
						className={`
							px-6 py-3 rounded-xl2 border transition
							${currentStep === 1 ? 'border-edge/40 bg-surface/20 text-text-dim cursor-not-allowed' : 'border-edge/60 bg-surface/30 text-text hover:bg-surface/50'}
						`}
					>
						← Previous
					</button>

					{currentStep < steps.length ? (
						<button
							type="button"
							onClick={nextStep}
							className="px-6 py-3 rounded-xl2 border border-primary/40 bg-primary/10 text-text hover:bg-primary/20"
						>
							Next →
						</button>
					) : (
						<button
							type="submit"
							disabled={submitting}
							className="px-6 py-3 rounded-xl2 border border-primary/40 bg-primary/10 text-text hover:bg-primary/20 disabled:opacity-50"
						>
							{submitting ? 'Saving...' : 'Save Brand Profile'}
						</button>
					)}
				</div>
			</form>
		</div>
	);
}
