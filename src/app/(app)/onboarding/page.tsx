'use client';

import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FileUpload } from '@/components/FileUpload';
import { TIMEZONES } from '@/lib/timezones';
import { useSupabase } from '@/components/SupabaseProvider';
import { Linkedin } from 'lucide-react';

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
	brand_goals: z.string().min(10, 'Please describe your content engine objectives (at least 10 characters)'),
	// Make these optional with empty-string defaults so the resolver is happy
	voice_rules: z.string().default(''),
	brand_keywords: z.string().default(''),
	exclude_keywords: z.string().default(''),
	content_rules: z.string().default(''),
	additional_info: z.string().default(''),
	// Platforms: require at least one
	platforms_requested: z.array(PlatformsEnum).min(1, 'Select at least one platform'),
	timezone: z.string().min(1, 'Please select a timezone'),
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
    }
  });

type FormData = z.infer<typeof schema>;

const PLATFORMS = ['LinkedIn', 'X', 'Instagram', 'Facebook', 'Blog', 'Medium'] as const;

const STEPS = useMemo(
		() => [
			{
				id: 1,
				title: 'Brand Basics',
				fields: [
					'brand_type',
					'client_name',
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
					'website',
					'timezone',
					'approval_contact_email',
					'language_region',
					'preferred_image_source',
				],
			},
			{ id: 2, title: 'Audience & Value', fields: ['audience', 'value_props', 'offers', 'brand_goals'] },
			{ id: 3, title: 'Voice & Content', fields: ['voice_rules', 'brand_keywords', 'exclude_keywords', 'content_rules', 'additional_info'] },
			{ id: 4, title: 'Platforms & Assets', fields: ['platforms_requested', 'brand_palette', 'brand_assets_urls'] },
		],
		[]
	);

export default function OnboardingPage() {
	const supabase = useSupabase();
	const [currentStep, setCurrentStep] = useState(1);
	const [submitting, setSubmitting] = useState(false);
	const [uploadedUrls, setUploadedUrls] = useState<string[]>([]);
	const [personalUploadedUrls, setPersonalUploadedUrls] = useState<string[]>([]);
	const [mounted, setMounted] = useState(false);
	const [linkedinProfile, setLinkedinProfile] = useState<any>(null);
	const [appliedLinkedinPrefill, setAppliedLinkedinPrefill] = useState(false);
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
	const watchedPlatforms = watch('platforms_requested');
	const personalFullName = watch('personal_full_name');
	const personalHeadline = watch('personal_headline');
	const clientName = watch('client_name');
	const personalAssetsUrls = watch('personal_assets_urls');

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
		const fetchLinkedinStatus = async () => {
			try {
				const res = await fetch('/api/connections/linkedin/status', { cache: 'no-store' });
				if (res.ok) {
					const data = await res.json();
					if (data?.connected) {
						setLinkedinProfile(data);
					}
				}
			} catch (error) {
				console.error('Failed to fetch LinkedIn status', error);
			}
		};
		fetchLinkedinStatus();
	}, []);

	useEffect(() => {
		if (brandType === 'personal' && linkedinProfile && !appliedLinkedinPrefill) {
			const meta = linkedinProfile.metadata || {};
			const name = linkedinProfile.accountName || meta.localizedFirstName && meta.localizedLastName
				? `${meta.localizedFirstName ?? ''} ${meta.localizedLastName ?? ''}`.trim()
				: '';
			const headline = meta.localizedHeadline || '';
			const avatarUrl = linkedinProfile.accountAvatar || null;

			if (name && !personalFullName) {
				setValue('personal_full_name', name, { shouldDirty: false });
			}
			if (headline && !personalHeadline) {
				setValue('personal_headline', headline, { shouldDirty: false });
			}
			if (name && !clientName) {
				setValue('client_name', name, { shouldDirty: false });
			}
			if (avatarUrl && personalAssetsUrls.length === 0) {
				setValue('personal_assets_urls', [avatarUrl], { shouldDirty: false });
				setPersonalUploadedUrls([avatarUrl]);
			}
			setAppliedLinkedinPrefill(true);
		}
	}, [brandType, linkedinProfile, appliedLinkedinPrefill, personalFullName, personalHeadline, clientName, personalAssetsUrls, setValue]);

	useEffect(() => {
		if (brandType === 'personal' && personalFullName) {
			if (!clientName || clientName === '' || clientName === personalFullName) {
				setValue('client_name', personalFullName, { shouldDirty: false });
			}
		}
	}, [brandType, personalFullName, clientName, setValue]);

	const togglePlatform = (platform: typeof PLATFORMS[number]) => {
		const current = watchedPlatforms || [];
		if (current.includes(platform)) {
			setValue('platforms_requested', current.filter((p) => p !== platform));
		} else {
			setValue('platforms_requested', [...current, platform]);
		}
		trigger('platforms_requested');
	};

	const handleFileUpload = (urls: string[]) => {
		setUploadedUrls(urls);
		setValue('brand_assets_urls', urls);
	};

	const handlePersonalFileUpload = (urls: string[]) => {
		setPersonalUploadedUrls(urls);
		setValue('personal_assets_urls', urls);
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

			// Show loading animation straight away so the user sees feedback
			setSubmittedBrandName(data.client_name);
			setShowLoading(true);

			// Kick off strategy generation in the background
			await fetch('/api/strategy/generate', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					...data,
					airtableId: result.airtableId,
				}),
			}).catch((error) => {
				console.error('Failed to trigger strategy generation', error);
			});
		} catch (e: any) {
			alert(e.message || 'Failed to save. Please try again.');
			setSubmitting(false);
		}
	};

	const handleLoadingComplete = () => {
		// Redirect to dashboard after loading animation
		window.location.href = '/dashboard';
	};

	const personalOnlyFields = useMemo(
		() => [
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
		],
		[]
	);

	const nextStep = async () => {
		const currentStepFields = STEPS[currentStep - 1].fields.filter((field) => {
			if (personalOnlyFields.includes(field)) {
				return brandType === 'personal';
			}
			return true;
		});
		const isValid = await trigger(currentStepFields as any);
		if (isValid) {
			setCurrentStep(Math.min(currentStep + 1, STEPS.length));
		}
	};

	const prevStep = () => {
		setCurrentStep(Math.max(currentStep - 1, 1));
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
			{/* Progress indicator */}
			<div className="mb-8">
				<div className="flex items-center justify-between mb-4">
					{STEPS.map((step, index) => (
						<div key={step.id} className="flex items-center flex-1">
							<div className="flex flex-col items-center flex-1">
								<div
									className={`
										w-10 h-10 rounded-full flex items-center justify-center text-sm font-medium border-2 transition
										${currentStep >= step.id
											? 'bg-primary/20 border-primary/60 text-primary'
											: 'bg-surface/30 border-edge/60 text-text-dim'
										}
									`}
								>
									{currentStep > step.id ? '✓' : step.id}
								</div>
								<p className="mt-2 text-xs text-text-dim text-center">{step.title}</p>
							</div>
							{index < STEPS.length - 1 && (
								<div
									className={`h-0.5 flex-1 mx-2 ${currentStep > step.id ? 'bg-primary/40' : 'bg-edge/60'}`}
								/>
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
							{/* Step 1: Brand Basics */}
							{currentStep === 1 && (
								<div className="space-y-6">
									<div>
										<h2 className="text-2xl font-semibold mb-2">Brand Basics</h2>
										<p className="text-text-dim">Tell us about your brand</p>
									</div>

									<input type="hidden" {...register('brand_type')} />

									<div>
										<label className="block text-sm font-medium mb-2">Brand Type *</label>
										<div className="inline-flex rounded-xl2 border border-edge/60 overflow-hidden">
											<button
												type="button"
												onClick={() => setValue('brand_type', 'personal')}
												className={`px-4 py-2 text-sm transition ${brandType === 'personal' ? 'bg-primary/15 border-r border-primary/40 text-primary' : 'text-text'}`}
											>
												Personal
											</button>
											<button
												type="button"
												onClick={() => setValue('brand_type', 'company')}
												className={`px-4 py-2 text-sm transition ${brandType === 'company' ? 'bg-primary/15 text-primary' : 'text-text'}`}
											>
												Company
											</button>
										</div>
									</div>

									{brandType === 'personal' ? (
										<div className="space-y-5 border border-primary/30 rounded-xl2 p-5 bg-primary/5">
											<div className="flex items-center gap-2 text-sm text-primary">
												<Linkedin className="w-4 h-4" />
												<span>Pulls from your LinkedIn profile if available.</span>
											</div>

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
													placeholder="e.g. Digital marketing, leadership, productivity, AI tools"
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
													placeholder="Describe your ideal audience—job title, industry, interests"
												/>
												{errors.personal_audience && (
													<p className="mt-1 text-sm text-danger">{errors.personal_audience.message}</p>
												)}
											</div>

											<div>
												<label className="block text-sm font-medium mb-2">What do you want to achieve with your content? *</label>
												<textarea
													{...register('personal_goals')}
													rows={3}
													className="w-full rounded-xl2 border border-edge/60 bg-bg/80 px-4 py-3 text-text focus:border-primary/60 focus:outline-none focus:ring-1 focus:ring-primary/20 resize-none"
													placeholder="Grow authority, attract clients, drive traffic, etc."
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
													placeholder="Pick 3–5 words such as bold, analytical, witty..."
												/>
												{errors.personal_voice_traits && (
													<p className="mt-1 text-sm text-danger">{errors.personal_voice_traits.message}</p>
												)}
											</div>

											<div>
												<label className="block text-sm font-medium mb-2">What experience or achievements should your audience know about? *</label>
												<textarea
													{...register('personal_story')}
													rows={3}
													className="w-full rounded-xl2 border border-edge/60 bg-bg/80 px-4 py-3 text-text focus:border-primary/60 focus:outline-none focus:ring-1 focus:ring-primary/20 resize-none"
													placeholder="Notable roles, companies, awards, results, milestones"
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
													placeholder="Website, portfolio, podcast, Twitter..."
												/>
											</div>

											<div>
												<label className="block text-sm font-medium mb-2">Upload a profile photo or assets (optional)</label>
												<FileUpload onUpload={handlePersonalFileUpload} />
												<p className="mt-2 text-xs text-text-dim">We’ll reference these in social content where appropriate.</p>
											</div>

											<div>
												<label className="block text-sm font-medium mb-2">Should anyone else review or approve content?</label>
												<input
													{...register('assistants')}
													className="w-full rounded-xl2 border border-edge/60 bg-bg/80 px-4 py-3 text-text focus:border-primary/60 focus:outline-none focus:ring-1 focus:ring-primary/20"
													placeholder="List names or emails"
												/>
											</div>

											<div>
												<label className="block text-sm font-medium mb-2">Ghost writing preference</label>
												<select
													{...register('ghost_writer_preference')}
													className="w-full rounded-xl2 border border-edge/60 bg-bg/80 px-4 py-3 text-text focus:border-primary/60 focus:outline-none focus:ring-1 focus:ring-primary/20"
												>
													<option value="Yes">Yes – write fully in my voice</option>
													<option value="No">No – I’ll draft my own</option>
													<option value="Sometimes">Sometimes – co-authored</option>
												</select>
											</div>
										</div>
									) : null}

									<div>
										<label className="block text-sm font-medium mb-2">{brandType === 'personal' ? 'Display Name *' : 'Brand Name *'}</label>
										<input
											{...register('client_name')}
											className="w-full rounded-xl2 border border-edge/60 bg-bg/80 px-4 py-3 text-text focus:border-primary/60 focus:outline-none focus:ring-1 focus:ring-primary/20"
											placeholder={brandType === 'personal' ? 'e.g. Jordan Chen' : 'Your brand name'}
										/>
										{errors.client_name && (
											<p className="mt-1 text-sm text-danger">{errors.client_name.message}</p>
										)}
									</div>

									<div>
										<label className="block text-sm font-medium mb-2">Website</label>
										<input
											{...register('website')}
											type="url"
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
										<p className="mt-1 text-xs text-text-dim">
											What regional language should content be created in?
										</p>
										{errors.language_region && <p className="mt-1 text-sm text-danger">{errors.language_region.message}</p>}
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
										<p className="mt-1 text-xs text-text-dim">
											Where should images come from for your content?
										</p>
										{errors.preferred_image_source && <p className="mt-1 text-sm text-danger">{errors.preferred_image_source.message}</p>}
									</div>

									<div>
										<label className="block text-sm font-medium mb-2">Approval Contact Email *</label>
										<input
											{...register('approval_contact_email')}
											type="email"
											className="w-full rounded-xl2 border border-edge/60 bg-bg/80 px-4 py-3 text-text focus:border-primary/60 focus:outline-none focus:ring-1 focus:ring-primary/20"
											placeholder="approver@example.com"
										/>
										<p className="mt-1 text-xs text-text-dim">
											Who should approve content before publishing?
										</p>
										{errors.approval_contact_email && (
											<p className="mt-1 text-sm text-danger">{errors.approval_contact_email.message}</p>
										)}
									</div>
								</div>
							)}

							{/* Step 2: Audience & Value */}
							{currentStep === 2 && (
								<div className="space-y-6">
									<div>
										<h2 className="text-2xl font-semibold mb-2">Audience & Value</h2>
										<p className="text-text-dim">Who you serve and what you offer</p>
									</div>

									<div>
										<label className="block text-sm font-medium mb-2">
											Audience <span className="text-text-dim">(Who do you speak to?)</span> *
										</label>
										<textarea
											{...register('audience')}
											rows={4}
											className="w-full rounded-xl2 border border-edge/60 bg-bg/80 px-4 py-3 text-text focus:border-primary/60 focus:outline-none focus:ring-1 focus:ring-primary/20 resize-none"
											placeholder="Describe your target audience, their demographics, interests, pain points..."
										/>
										{errors.audience && <p className="mt-1 text-sm text-danger">{errors.audience.message}</p>}
									</div>

									<div>
										<label className="block text-sm font-medium mb-2">Unique Value Propositions *</label>
										<textarea
											{...register('value_props')}
											rows={4}
											className="w-full rounded-xl2 border border-edge/60 bg-bg/80 px-4 py-3 text-text focus:border-primary/60 focus:outline-none focus:ring-1 focus:ring-primary/20 resize-none"
											placeholder="What makes your brand unique? What problems do you solve?"
										/>
										{errors.value_props && <p className="mt-1 text-sm text-danger">{errors.value_props.message}</p>}
									</div>

									<div>
										<label className="block text-sm font-medium mb-2">Offers / Products *</label>
										<textarea
											{...register('offers')}
											rows={3}
											className="w-full rounded-xl2 border border-edge/60 bg-bg/80 px-4 py-3 text-text focus:border-primary/60 focus:outline-none focus:ring-1 focus:ring-primary/20 resize-none"
											placeholder="List your main products, services, or offers..."
										/>
										{errors.offers && <p className="mt-1 text-sm text-danger">{errors.offers.message}</p>}
									</div>

									<div>
										<label className="block text-sm font-medium mb-2">
											Content Engine Objectives <span className="text-text-dim">(What are your goals?)</span> *
										</label>
										<textarea
											{...register('brand_goals')}
											rows={4}
											className="w-full rounded-xl2 border border-edge/60 bg-bg/80 px-4 py-3 text-text focus:border-primary/60 focus:outline-none focus:ring-1 focus:ring-primary/20 resize-none"
											placeholder="What do you want to achieve with your content engine? (e.g., increase brand awareness, drive leads, educate audience...)"
										/>
										{errors.brand_goals && <p className="mt-1 text-sm text-danger">{errors.brand_goals.message}</p>}
									</div>
								</div>
							)}

							{/* Step 3: Voice & Content */}
							{currentStep === 3 && (
								<div className="space-y-6">
									<div>
										<h2 className="text-2xl font-semibold mb-2">Voice & Content Rules</h2>
										<p className="text-text-dim">Define your brand voice and content guidelines</p>
									</div>

									<div>
										<label className="block text-sm font-medium mb-2">
											Voice Rules <span className="text-text-dim">(Tone, style, personality)</span>
										</label>
										<textarea
											{...register('voice_rules')}
											rows={3}
											className="w-full rounded-xl2 border border-edge/60 bg-bg/80 px-4 py-3 text-text focus:border-primary/60 focus:outline-none focus:ring-1 focus:ring-primary/20 resize-none"
											placeholder="e.g., Professional but approachable, use active voice, avoid jargon..."
										/>
									</div>

									<div>
										<label className="block text-sm font-medium mb-2">Preferred Keywords / Phrases</label>
										<textarea
											{...register('brand_keywords')}
											rows={2}
											className="w-full rounded-xl2 border border-edge/60 bg-bg/80 px-4 py-3 text-text focus:border-primary/60 focus:outline-none focus:ring-1 focus:ring-primary/20 resize-none"
											placeholder="Keywords or phrases you want to include in content..."
										/>
									</div>

									<div>
										<label className="block text-sm font-medium mb-2">Topics / Phrases to Avoid</label>
										<textarea
											{...register('exclude_keywords')}
											rows={2}
											className="w-full rounded-xl2 border border-edge/60 bg-bg/80 px-4 py-3 text-text focus:border-primary/60 focus:outline-none focus:ring-1 focus:ring-primary/20 resize-none"
											placeholder="Topics, phrases, or words to avoid in content..."
										/>
									</div>

									<div>
										<label className="block text-sm font-medium mb-2">Content Rules / Flags</label>
										<textarea
											{...register('content_rules')}
											rows={2}
											className="w-full rounded-xl2 border border-edge/60 bg-bg/80 px-4 py-3 text-text focus:border-primary/60 focus:outline-none focus:ring-1 focus:ring-primary/20 resize-none"
											placeholder="Any additional rules, flags, or guidelines for content creation..."
										/>
									</div>

									<div>
										<label className="block text-sm font-medium mb-2">
											Additional Information <span className="text-text-dim">(Websites, pages to scrape, etc.)</span>
										</label>
										<textarea
											{...register('additional_info')}
											rows={4}
											className="w-full rounded-xl2 border border-edge/60 bg-bg/80 px-4 py-3 text-text focus:border-primary/60 focus:outline-none focus:ring-1 focus:ring-primary/20 resize-none"
											placeholder="Any additional websites, specific pages, or information sources we should scrape or reference when creating content..."
										/>
										<p className="mt-1 text-xs text-text-dim">
											Provide URLs to specific pages or websites that contain valuable information about your brand
										</p>
									</div>
								</div>
							)}

							{/* Step 4: Platforms & Assets */}
							{currentStep === 4 && (
								<div className="space-y-6">
									<div>
										<h2 className="text-2xl font-semibold mb-2">Platforms & Assets</h2>
										<p className="text-text-dim">Select platforms and upload brand assets</p>
									</div>

									<div>
										<label className="block text-sm font-medium mb-3">Platforms *</label>
										<div className="grid grid-cols-2 md:grid-cols-3 gap-3">
											{PLATFORMS.map((platform) => (
												<label
													key={platform}
													className={`
														flex items-center gap-2 p-3 rounded-xl2 border cursor-pointer transition
														${watchedPlatforms?.includes(platform)
															? 'bg-primary/15 border-primary/50 text-primary'
															: 'bg-surface/30 border-edge/60 hover:border-edge/80'
														}
													`}
												>
													<input
														type="checkbox"
														checked={watchedPlatforms?.includes(platform) || false}
														onChange={() => togglePlatform(platform)}
														className="sr-only"
													/>
													<div
														className={`
															w-5 h-5 rounded border-2 flex items-center justify-center transition
															${watchedPlatforms?.includes(platform)
																? 'bg-primary border-primary'
																: 'border-edge/60 bg-bg/80'
															}
														`}
													>
														{watchedPlatforms?.includes(platform) && (
															<svg className="w-3 h-3 text-bg" fill="currentColor" viewBox="0 0 20 20">
																<path
																	fillRule="evenodd"
																	d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
																	clipRule="evenodd"
																/>
															</svg>
														)}
													</div>
													<span className="text-sm">{platform}</span>
												</label>
											))}
										</div>
										{errors.platforms_requested && (
											<p className="mt-2 text-sm text-danger">{errors.platforms_requested.message}</p>
										)}
									</div>

									<div>
										<label className="block text-sm font-medium mb-2">Brand Palette</label>
										<textarea
											{...register('brand_palette')}
											rows={2}
											className="w-full rounded-xl2 border border-edge/60 bg-bg/80 px-4 py-3 text-text focus:border-primary/60 focus:outline-none focus:ring-1 focus:ring-primary/20 resize-none"
											placeholder="e.g., Primary: #8AB4F8, Secondary: #4FF0B8, or describe your color scheme..."
										/>
									</div>

									<div>
										<label className="block text-sm font-medium mb-2">
											Brand Assets <span className="text-text-dim">(Logos, guidelines, images)</span>
										</label>
										<FileUpload onUpload={handleFileUpload} />
										<p className="mt-2 text-xs text-text-dim">
											Upload brand guidelines PDFs, logos, or other assets (optional)
										</p>
									</div>
								</div>
							)}
						</div>
					</motion.div>
				</AnimatePresence>

				{/* Navigation buttons */}
				<div className="flex items-center justify-between pt-6">
					<button
						type="button"
						onClick={prevStep}
						disabled={currentStep === 1}
						className={`
							px-6 py-3 rounded-xl2 border transition
							${currentStep === 1
								? 'border-edge/40 bg-surface/20 text-text-dim cursor-not-allowed'
								: 'border-edge/60 bg-surface/30 text-text hover:bg-surface/50'
							}
						`}
					>
						← Previous
					</button>

					{currentStep < STEPS.length ? (
						<button
							type="button"
							onClick={nextStep}
							className="px-6 py-3 rounded-xl2 border border-primary/40 bg-primary/10 text-text hover:bg-primary/20 transition"
						>
							Next →
						</button>
					) : (
						<button
							type="submit"
							disabled={submitting}
							className="px-6 py-3 rounded-xl2 border border-primary/40 bg-primary/10 text-text hover:bg-primary/20 disabled:opacity-50 disabled:cursor-not-allowed transition"
						>
							{submitting ? 'Saving...' : 'Save & Generate Strategy'}
						</button>
					)}
				</div>
			</form>
		</div>
	);
}
