'use client';

/**
 * Monthly Content Brief Form
 * 
 * Allows users to submit monthly content briefs that guide content generation.
 * Two modes:
 * - continue: Maintain similar content output
 * - feedback: Optimize based on performance (with best/worst post selection)
 */

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { FileUpload } from '@/components/FileUpload';
import { Loader2, Calendar, Target, ClipboardList, TrendingUp, TrendingDown } from 'lucide-react';

type BrandProfile = {
	id: string;
	client_name: string;
	status: string;
};

type PublishedPost = {
	id: string;
	title: string;
	content: string;
	published_at: string | null;
	published_url: string | null;
};

type FormState = {
	brand_profile_id: string;
	brief_mode: 'continue' | 'feedback';
	cycle_start_date: string;
	objective: string;
	themes_focus: string;
	key_dates: string;
	feedback_notes: string;
	content_preferences: string;
	best_performing_post_id: string;
	worst_performing_post_id: string;
	best_post_reason: string;
	worst_post_reason: string;
	primary_goal: 'Awareness' | 'Engagement' | 'Traffic' | 'Leads' | '';
	success_metric: 'CTR' | 'comments' | 'followers' | 'leads' | '';
	cta: string;
	cta_link: string;
	offers_to_push: string;
	topics_to_avoid_this_month: string;
	competitor_or_inspo_links: string;
	attachments: string[];
};

const initialFormState = (): FormState => {
	const today = new Date();
	const iso = today.toISOString().split('T')[0];
	return {
		brand_profile_id: '',
		brief_mode: 'continue',
		cycle_start_date: iso,
		objective: '',
		themes_focus: '',
		key_dates: '',
		feedback_notes: '',
		content_preferences: '',
		best_performing_post_id: '',
		worst_performing_post_id: '',
		best_post_reason: '',
		worst_post_reason: '',
		primary_goal: '',
		success_metric: '',
		cta: '',
		cta_link: '',
		offers_to_push: '',
		topics_to_avoid_this_month: '',
		competitor_or_inspo_links: '',
		attachments: [],
	};
};

export default function ContentBriefPage() {
	const router = useRouter();
	const [profiles, setProfiles] = useState<BrandProfile[]>([]);
	const [publishedPosts, setPublishedPosts] = useState<PublishedPost[]>([]);
	const [loadingPosts, setLoadingPosts] = useState(false);
	const [loading, setLoading] = useState(true);
	const [submitting, setSubmitting] = useState(false);
	const [form, setForm] = useState<FormState>(() => initialFormState());
	const [error, setError] = useState<string | null>(null);
	const [success, setSuccess] = useState<string | null>(null);

	useEffect(() => {
		const fetchProfiles = async () => {
			try {
				const res = await fetch('/api/brands', { cache: 'no-store' });
				if (!res.ok) {
					throw new Error('Failed to load brand profiles');
				}
				const data = await res.json();
				setProfiles(data.profiles || []);
			} catch (err: any) {
				console.error(err);
				setError(err.message || 'Unable to load brand profiles');
			} finally {
				setLoading(false);
			}
		};

		fetchProfiles();
	}, []);

	// Fetch published posts when brand profile and feedback mode are selected
	useEffect(() => {
		if (form.brand_profile_id && form.brief_mode === 'feedback') {
			setLoadingPosts(true);
			fetch(`/api/content/published?brand_profile_id=${form.brand_profile_id}`)
				.then((res) => res.json())
				.then((data) => {
					setPublishedPosts(data.posts || []);
				})
				.catch((err) => {
					console.error('Failed to load published posts:', err);
					setPublishedPosts([]);
				})
				.finally(() => {
					setLoadingPosts(false);
				});
		} else {
			setPublishedPosts([]);
		}
	}, [form.brand_profile_id, form.brief_mode]);

	const selectedProfile = useMemo(
		() => profiles.find((profile) => profile.id === form.brand_profile_id) || null,
		[profiles, form.brand_profile_id]
	);

	const updateField = (field: keyof FormState, value: string | string[]) => {
		setForm((prev) => ({
			...prev,
			[field]: value,
		}));
	};

	const resetForm = () => {
		setForm(initialFormState());
	};

	const handleSubmit = async (event: React.FormEvent) => {
		event.preventDefault();
		setError(null);
		setSuccess(null);

		if (!form.brand_profile_id) {
			setError('Please select a brand profile.');
			return;
		}

		// Validate required fields for feedback mode
		if (form.brief_mode === 'feedback') {
			if (!form.objective.trim()) {
				setError('Please add a clear objective for this cycle.');
				return;
			}
			if (!form.themes_focus.trim()) {
				setError('Share the themes or campaigns you want us to focus on.');
				return;
			}
		}

		setSubmitting(true);
		try {
			const res = await fetch('/api/content-brief', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({
					...form,
					// Only include best/worst post IDs if feedback mode
					best_performing_post_id: form.brief_mode === 'feedback' ? form.best_performing_post_id || undefined : undefined,
					worst_performing_post_id: form.brief_mode === 'feedback' ? form.worst_performing_post_id || undefined : undefined,
					best_post_reason: form.brief_mode === 'feedback' ? form.best_post_reason || undefined : undefined,
					worst_post_reason: form.brief_mode === 'feedback' ? form.worst_post_reason || undefined : undefined,
				}),
			});

			if (!res.ok) {
				const data = await res.json().catch(() => ({}));
				throw new Error(data?.error || 'Failed to submit content brief');
			}

			setSuccess('Content brief submitted successfully. Redirecting to strategy page...');
			
			// Redirect to strategy page after short delay
			setTimeout(() => {
				router.push(`/strategy?brand_profile_id=${form.brand_profile_id}&tab=content-briefs`);
			}, 1500);
		} catch (err: any) {
			console.error('Content brief error:', err);
			setError(err.message || 'Something went wrong while submitting your brief.');
		} finally {
			setSubmitting(false);
		}
	};

	if (loading) {
		return (
			<div className="mx-auto max-w-3xl">
				<div className="card p-8 text-center">
					<Loader2 className="w-8 h-8 text-primary animate-spin mx-auto mb-4" />
					<p className="text-text-soft">Loading your brand profiles...</p>
				</div>
			</div>
		);
	}

	if (!profiles.length) {
		return (
			<div className="mx-auto max-w-3xl space-y-4">
				<div className="card p-8 text-center space-y-3">
					<p className="text-text-soft text-sm">
						You don't have any brand profiles yet. Complete onboarding first to generate your initial strategy.
					</p>
					<button
						onClick={() => router.push('/onboarding')}
						className="px-4 py-2 rounded-xl2 border border-primary/40 bg-primary/10 hover:bg-primary/20"
					>
						Go to Onboarding
					</button>
				</div>
			</div>
		);
	}

	return (
		<div className="mx-auto max-w-3xl space-y-6">
			<header className="space-y-2">
				<button
					onClick={() => router.back()}
					className="text-text-soft hover:text-text text-sm inline-flex items-center gap-1"
				>
					← Back
				</button>
				<h1 className="text-3xl font-semibold">Monthly Content Brief</h1>
				<p className="text-text-dim text-sm">
					Submit a brief to guide next month's content generation. Your master strategy remains unchanged.
				</p>
			</header>

			{error && (
				<div className="card p-4 border-danger/40 bg-danger/10 text-danger text-sm">
					{error}
				</div>
			)}

			{success && (
				<div className="card p-4 border-accent/40 bg-accent/10 text-accent text-sm">
					{success}
				</div>
			)}

			<form onSubmit={handleSubmit} className="card p-8 space-y-6">
				<div className="grid gap-5">
					<div className="space-y-2">
						<label className="block text-sm font-medium">Brand profile *</label>
						<select
							value={form.brand_profile_id}
							onChange={(e) => updateField('brand_profile_id', e.target.value)}
							className="w-full rounded-xl2 border border-edge/60 bg-bg/80 px-4 py-3 text-text focus:border-primary/60 focus:outline-none focus:ring-1 focus:ring-primary/20"
						>
							<option value="">Select brand…</option>
							{profiles.map((profile) => (
								<option key={profile.id} value={profile.id}>
									{profile.client_name} · {profile.status}
								</option>
							))}
						</select>
					</div>

					{/* Brief Mode Toggle */}
					<div className="space-y-3 p-4 rounded-xl2 border border-edge/60 bg-surface/30">
						<label className="block text-sm font-medium mb-3">Brief Mode *</label>
						<div className="flex items-center gap-4">
							<label className="flex items-center gap-2 cursor-pointer">
								<input
									type="radio"
									name="brief_mode"
									value="continue"
									checked={form.brief_mode === 'continue'}
									onChange={(e) => updateField('brief_mode', e.target.value as 'continue' | 'feedback')}
									className="w-4 h-4 text-primary focus:ring-primary/20"
								/>
								<span className="text-sm">
									<span className="font-medium">Continue same brief</span>
									<span className="text-text-dim block text-xs mt-1">
										Maintain similar content output for the next month.
									</span>
								</span>
							</label>
						</div>
						<div className="flex items-center gap-4 mt-3">
							<label className="flex items-center gap-2 cursor-pointer">
								<input
									type="radio"
									name="brief_mode"
									value="feedback"
									checked={form.brief_mode === 'feedback'}
									onChange={(e) => updateField('brief_mode', e.target.value as 'continue' | 'feedback')}
									className="w-4 h-4 text-primary focus:ring-primary/20"
								/>
								<span className="text-sm">
									<span className="font-medium">Submit feedback brief</span>
									<span className="text-text-dim block text-xs mt-1">
										Optimize content based on performance feedback.
									</span>
								</span>
							</label>
						</div>
					</div>

					{/* Cycle Start Date */}
					<div className="grid gap-4 md:grid-cols-2">
						<div className="space-y-2">
							<label className="block text-sm font-medium">Cycle start date *</label>
							<input
								type="date"
								value={form.cycle_start_date}
								onChange={(e) => updateField('cycle_start_date', e.target.value)}
								className="w-full rounded-xl2 border border-edge/60 bg-bg/80 px-4 py-3 text-text focus:border-primary/60 focus:outline-none focus:ring-1 focus:ring-primary/20"
							/>
						</div>
						<div className="text-sm text-text-dim bg-surface/30 border border-edge/60 rounded-xl2 p-4 flex items-start gap-3">
							<Calendar className="w-4 h-4 mt-0.5 text-primary" />
							<span>
								Pick the date you'd like the new schedule to start from.
							</span>
						</div>
					</div>

					{/* Objective */}
					<div className="space-y-2">
						<label className="block text-sm font-medium">
							Objective {form.brief_mode === 'feedback' && '*'}
						</label>
						<textarea
							rows={4}
							value={form.objective}
							onChange={(e) => updateField('objective', e.target.value)}
							placeholder="e.g. Promote our new AI feature launch, grow waitlist by 500 leads, nurture audience ahead of conference."
							className="w-full rounded-xl2 border border-edge/60 bg-bg/80 px-4 py-3 text-text focus:border-primary/60 focus:outline-none focus:ring-1 focus:ring-primary/20 resize-none"
						/>
					</div>

					{/* Themes & Focus */}
					<div className="space-y-2">
						<label className="block text-sm font-medium">
							Priority themes & campaigns {form.brief_mode === 'feedback' && '*'}
						</label>
						<textarea
							rows={4}
							value={form.themes_focus}
							onChange={(e) => updateField('themes_focus', e.target.value)}
							placeholder="List topics we should emphasise this month. Bullet points are perfect."
							className="w-full rounded-xl2 border border-edge/60 bg-bg/80 px-4 py-3 text-text focus:border-primary/60 focus:outline-none focus:ring-1 focus:ring-primary/20 resize-none"
						/>
					</div>

					{/* Feedback Mode Fields */}
					{form.brief_mode === 'feedback' && (
						<div className="space-y-4 p-4 rounded-xl2 border border-primary/30 bg-primary/5">
							<div className="flex items-center gap-2 text-sm font-medium text-primary">
								<Target className="w-4 h-4" />
								Performance Feedback
							</div>

							{loadingPosts ? (
								<div className="text-sm text-text-dim">Loading published posts...</div>
							) : publishedPosts.length === 0 ? (
								<div className="text-sm text-text-dim">
									No published posts found. Select best/worst posts after you have published content.
								</div>
							) : (
								<>
									<div className="grid gap-4 md:grid-cols-2">
										<div className="space-y-2">
											<label className="block text-sm font-medium flex items-center gap-2">
												<TrendingUp className="w-4 h-4 text-accent" />
												Best performing post
											</label>
											<select
												value={form.best_performing_post_id}
												onChange={(e) => updateField('best_performing_post_id', e.target.value)}
												className="w-full rounded-xl2 border border-edge/60 bg-bg/80 px-4 py-3 text-text focus:border-primary/60 focus:outline-none focus:ring-1 focus:ring-primary/20"
											>
												<option value="">Select post...</option>
												{publishedPosts.map((post) => (
													<option key={post.id} value={post.id}>
														{post.title}
													</option>
												))}
											</select>
										</div>

										<div className="space-y-2">
											<label className="block text-sm font-medium flex items-center gap-2">
												<TrendingDown className="w-4 h-4 text-danger" />
												Poorest performing post
											</label>
											<select
												value={form.worst_performing_post_id}
												onChange={(e) => updateField('worst_performing_post_id', e.target.value)}
												className="w-full rounded-xl2 border border-edge/60 bg-bg/80 px-4 py-3 text-text focus:border-primary/60 focus:outline-none focus:ring-1 focus:ring-primary/20"
											>
												<option value="">Select post...</option>
												{publishedPosts.map((post) => (
													<option key={post.id} value={post.id}>
														{post.title}
													</option>
												))}
											</select>
										</div>
									</div>

									{form.best_performing_post_id && (
										<div className="space-y-2">
											<label className="block text-sm font-medium">Why did this post perform well?</label>
											<textarea
												rows={3}
												value={form.best_post_reason}
												onChange={(e) => updateField('best_post_reason', e.target.value)}
												placeholder="What made this post successful? (e.g., high engagement, many shares, drove sign-ups)"
												className="w-full rounded-xl2 border border-edge/60 bg-bg/80 px-4 py-3 text-text focus:border-primary/60 focus:outline-none focus:ring-1 focus:ring-primary/20 resize-none"
											/>
										</div>
									)}

									{form.worst_performing_post_id && (
										<div className="space-y-2">
											<label className="block text-sm font-medium">Why did this post underperform?</label>
											<textarea
												rows={3}
												value={form.worst_post_reason}
												onChange={(e) => updateField('worst_post_reason', e.target.value)}
												placeholder="What didn't work? (e.g., low engagement, wrong tone, unclear message)"
												className="w-full rounded-xl2 border border-edge/60 bg-bg/80 px-4 py-3 text-text focus:border-primary/60 focus:outline-none focus:ring-1 focus:ring-primary/20 resize-none"
											/>
										</div>
									)}
								</>
							)}
						</div>
					)}

					{/* Key Dates */}
					<div className="space-y-2">
						<label className="block text-sm font-medium">Key launches or dates</label>
						<textarea
							rows={3}
							value={form.key_dates}
							onChange={(e) => updateField('key_dates', e.target.value)}
							placeholder="Product drops, events, campaigns, newsletter dates, etc."
							className="w-full rounded-xl2 border border-edge/60 bg-bg/80 px-4 py-3 text-text focus:border-primary/60 focus:outline-none focus:ring-1 focus:ring-primary/20 resize-none"
						/>
					</div>

					{/* Feedback Notes */}
					<div className="space-y-2">
						<label className="block text-sm font-medium">Feedback or notes</label>
						<textarea
							rows={3}
							value={form.feedback_notes}
							onChange={(e) => updateField('feedback_notes', e.target.value)}
							placeholder="Any additional feedback about content performance or direction..."
							className="w-full rounded-xl2 border border-edge/60 bg-bg/80 px-4 py-3 text-text focus:border-primary/60 focus:outline-none focus:ring-1 focus:ring-primary/20 resize-none"
						/>
					</div>

					{/* Content Preferences */}
					<div className="space-y-2">
						<label className="block text-sm font-medium">Content preferences</label>
						<textarea
							rows={4}
							value={form.content_preferences}
							onChange={(e) => updateField('content_preferences', e.target.value)}
							placeholder="e.g. More video content, longer-form posts, specific CTAs, etc."
							className="w-full rounded-xl2 border border-edge/60 bg-bg/80 px-4 py-3 text-text focus:border-primary/60 focus:outline-none focus:ring-1 focus:ring-primary/20 resize-none"
						/>
					</div>

					{/* Primary Goal & Success Metric */}
					<div className="grid gap-4 md:grid-cols-2">
						<div className="space-y-2">
							<label className="block text-sm font-medium">Primary goal</label>
							<select
								value={form.primary_goal}
								onChange={(e) => updateField('primary_goal', e.target.value)}
								className="w-full rounded-xl2 border border-edge/60 bg-bg/80 px-4 py-3 text-text focus:border-primary/60 focus:outline-none focus:ring-1 focus:ring-primary/20"
							>
								<option value="">Select goal...</option>
								<option value="Awareness">Awareness</option>
								<option value="Engagement">Engagement</option>
								<option value="Traffic">Traffic</option>
								<option value="Leads">Leads</option>
							</select>
						</div>
						<div className="space-y-2">
							<label className="block text-sm font-medium">Success metric</label>
							<select
								value={form.success_metric}
								onChange={(e) => updateField('success_metric', e.target.value)}
								className="w-full rounded-xl2 border border-edge/60 bg-bg/80 px-4 py-3 text-text focus:border-primary/60 focus:outline-none focus:ring-1 focus:ring-primary/20"
							>
								<option value="">Select metric...</option>
								<option value="CTR">CTR</option>
								<option value="comments">Comments</option>
								<option value="followers">Followers</option>
								<option value="leads">Leads</option>
							</select>
						</div>
					</div>

					{/* CTA & CTA Link */}
					<div className="grid gap-4 md:grid-cols-2">
						<div className="space-y-2">
							<label className="block text-sm font-medium">Call-to-action (optional)</label>
							<input
								type="text"
								value={form.cta}
								onChange={(e) => updateField('cta', e.target.value)}
								placeholder="e.g. Sign up now, Learn more, Get started"
								className="w-full rounded-xl2 border border-edge/60 bg-bg/80 px-4 py-3 text-text focus:border-primary/60 focus:outline-none focus:ring-1 focus:ring-primary/20"
							/>
						</div>
						<div className="space-y-2">
							<label className="block text-sm font-medium">CTA link (optional)</label>
							<input
								type="url"
								value={form.cta_link}
								onChange={(e) => updateField('cta_link', e.target.value)}
								placeholder="https://example.com/signup"
								className="w-full rounded-xl2 border border-edge/60 bg-bg/80 px-4 py-3 text-text focus:border-primary/60 focus:outline-none focus:ring-1 focus:ring-primary/20"
							/>
						</div>
					</div>

					{/* Offers to Push */}
					<div className="space-y-2">
						<label className="block text-sm font-medium">Offers to push (optional)</label>
						<textarea
							rows={3}
							value={form.offers_to_push}
							onChange={(e) => updateField('offers_to_push', e.target.value)}
							placeholder="List any special offers, promotions, or products you want to highlight this month"
							className="w-full rounded-xl2 border border-edge/60 bg-bg/80 px-4 py-3 text-text focus:border-primary/60 focus:outline-none focus:ring-1 focus:ring-primary/20 resize-none"
						/>
					</div>

					{/* Topics to Avoid */}
					<div className="space-y-2">
						<label className="block text-sm font-medium">Topics to avoid this month (optional)</label>
						<textarea
							rows={3}
							value={form.topics_to_avoid_this_month}
							onChange={(e) => updateField('topics_to_avoid_this_month', e.target.value)}
							placeholder="List any topics, keywords, or themes to avoid in this month's content"
							className="w-full rounded-xl2 border border-edge/60 bg-bg/80 px-4 py-3 text-text focus:border-primary/60 focus:outline-none focus:ring-1 focus:ring-primary/20 resize-none"
						/>
					</div>

					{/* Competitor/Inspo Links */}
					<div className="space-y-2">
						<label className="block text-sm font-medium">Competitor or inspiration links (optional)</label>
						<textarea
							rows={3}
							value={form.competitor_or_inspo_links}
							onChange={(e) => updateField('competitor_or_inspo_links', e.target.value)}
							placeholder="Share links to competitor content or inspiration that you'd like us to reference (one per line)"
							className="w-full rounded-xl2 border border-edge/60 bg-bg/80 px-4 py-3 text-text focus:border-primary/60 focus:outline-none focus:ring-1 focus:ring-primary/20 resize-none"
						/>
					</div>

					{/* File Attachments */}
					<div className="space-y-2">
						<label className="block text-sm font-medium">Attachments (optional)</label>
						<FileUpload
							onUpload={(urls) => updateField('attachments', urls)}
							acceptedTypes={['image/*', 'application/pdf']}
							maxFiles={5}
							maxSizeMB={10}
						/>
					</div>
				</div>

				<div className="flex gap-3 pt-4 border-t border-edge/60">
					<button
						type="button"
						onClick={resetForm}
						className="px-6 py-3 rounded-xl2 border border-edge/60 bg-surface/30 hover:bg-surface/50"
					>
						Clear form
					</button>
					<button
						type="submit"
						disabled={submitting}
						className="flex-1 px-6 py-3 rounded-xl2 border border-accent/40 bg-accent/10 hover:bg-accent/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
					>
						{submitting ? (
							<>
								<Loader2 className="w-4 h-4 animate-spin" />
								Submitting...
							</>
						) : (
							<>
								<ClipboardList className="w-4 h-4" />
								Submit content brief
							</>
						)}
					</button>
				</div>
			</form>
		</div>
	);
}
