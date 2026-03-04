'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useSupabase } from '@/components/SupabaseProvider';
import { Loader2, Sparkles, ArrowRight, AlertCircle } from 'lucide-react';
import { ContentGenerationLoading } from '@/components/ContentGenerationLoading';
import { useUsage } from '@/lib/useUsage';
import type { PlanId } from '@/config/pricing';
import { CAPS, PER_CHANNEL_REQUEST_CAPS } from '@/config/pricing';
import { UpgradeModal } from '@/components/UpgradeModal';
import { TrialBanner } from '@/components/TrialBanner';

type BrandProfile = {
	id: string;
	client_name: string;
	platforms_requested?: string[];
	status: string;
};

const PLATFORM_OPTIONS = [
	{ value: 'LinkedIn', label: 'LinkedIn', icon: '💼' },
	{ value: 'X', label: 'X (Twitter)', icon: '𝕏' },
	{ value: 'Instagram', label: 'Instagram', icon: '📷' },
	{ value: 'Facebook', label: 'Facebook', icon: '👥' },
	{ value: 'Blog', label: 'Blog', icon: '📝' },
];

export default function ContentGeneratePage() {
	const router = useRouter();
	const searchParams = useSearchParams();
	const supabase = useSupabase();
	const { data: usageData } = useUsage();

	const [loading, setLoading] = useState(true);
	const [brands, setBrands] = useState<BrandProfile[]>([]);
	const [selectedBrand, setSelectedBrand] = useState<string>('');
	const [quantities, setQuantities] = useState<Record<string, number>>({});
	const [submitting, setSubmitting] = useState(false);
	const [showLoading, setShowLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [userPlan, setUserPlan] = useState<PlanId | null>(null);
	const [showUpgradeModal, setShowUpgradeModal] = useState(false);
	const [upgradeReason, setUpgradeReason] = useState<string>('');

	// Load user plan
	useEffect(() => {
		if (!supabase) return;
		loadUserPlan();
	}, [supabase]);

	// Load brands
	useEffect(() => {
		if (!supabase) return;
		loadBrands();
	}, [supabase]);

	async function loadUserPlan() {
		try {
			const res = await fetch('/api/plan', { cache: 'no-store' });
			if (res.ok) {
				const data = await res.json();
				const planName = data.planName?.toLowerCase() || 'creator';
				setUserPlan(planName as PlanId);
			}
		} catch (err) {
			console.error('Failed to load user plan:', err);
		}
	}

	async function loadBrands() {
		try {
			const res = await fetch('/api/brands', { cache: 'no-store' });
			if (!res.ok) throw new Error('Failed to load brands');
			const data = await res.json();
			const profiles = (data.profiles || []).filter((p: BrandProfile) => {
				const status = (p.status || '').toLowerCase();
				return status.includes('approved') || status === 'strategy approved';
			});
			setBrands(profiles);

			// Auto-select brand from query param or first brand
			const brandParam = searchParams.get('brand');
			if (brandParam && profiles.some((p: BrandProfile) => p.id === brandParam)) {
				setSelectedBrand(brandParam);
			} else if (profiles.length === 1) {
				setSelectedBrand(profiles[0].id);
			} else if (profiles.length > 0) {
				// Default to most recently created
				setSelectedBrand(profiles[0].id);
			}
		} catch (err: any) {
			console.error(err);
			setError(err.message || 'Failed to load brands');
		} finally {
			setLoading(false);
		}
	}

	const selectedBrandData = useMemo(
		() => brands.find((b) => b.id === selectedBrand),
		[brands, selectedBrand]
	);

	// Filter platforms based on user plan (guard: plan may be 'free' or missing from CAPS)
	const availablePlatforms = useMemo(() => {
		if (!userPlan) return PLATFORM_OPTIONS;
		const planCaps = CAPS[userPlan as PlanId] ?? CAPS.growth;
		const allowedPlatformKeys = planCaps.includedPlatforms;
		return PLATFORM_OPTIONS.filter((platform) => {
			const key = platform.value.toLowerCase();
			return allowedPlatformKeys.includes(key as any);
		});
	}, [userPlan]);

	// Check if user is on Starter plan (export-only)
	const isStarterPlan = userPlan === 'starter';

	// Calculate remaining posts from caps and usage (global posts cap)
	const postsCap = usageData?.caps?.posts_per_month ?? 0;
	const postsUsed = usageData?.usage?.posts ?? 0;
	const isUnlimited = !postsCap || postsCap === 999999 || postsCap >= 999999;
	const postsRemaining = isUnlimited ? 999999 : Math.max(0, postsCap - postsUsed);
	
	// Starter generates the full monthly pack in one click
	const starterTotal =
		CAPS.starter.linkedinPostsMonthly +
		CAPS.starter.xPostsMonthly +
		(CAPS.starter.blogArticlesMonthly || CAPS.starter.blogOutlinesMonthly || 0);

	const totalRequested = isStarterPlan
		? starterTotal
		: Object.values(quantities).reduce((sum, qty) => sum + qty, 0);

	const canSubmit =
		!!selectedBrand &&
		(isStarterPlan
			? (isUnlimited || totalRequested <= postsRemaining)
			: totalRequested > 0 && (isUnlimited || totalRequested <= postsRemaining));

	async function handleSubmit(e: React.FormEvent) {
		e.preventDefault();
		if (!canSubmit) return;

		setSubmitting(true);
		setError(null);

		try {
			let channels: { platform: string; count: number }[];
			if (isStarterPlan) {
				const caps = CAPS.starter;
				channels = [
					{ platform: 'LinkedIn', count: caps.linkedinPostsMonthly },
					{ platform: 'X', count: caps.xPostsMonthly },
					{ platform: 'Blog', count: caps.blogArticlesMonthly || caps.blogOutlinesMonthly || 0 },
				].filter((c) => c.count > 0);
			} else {
				channels = Object.entries(quantities)
					.filter(([, qty]) => qty > 0)
					.map(([platform, count]) => ({ platform, count }));
			}

			const res = await fetch('/api/content/generate', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					brandProfileId: selectedBrand,
					channels,
				}),
			});

			const data = await res.json();

			if (!res.ok) {
				throw new Error(data.error || 'Failed to generate content');
			}

			setShowLoading(true);
		} catch (err: any) {
			console.error('Content generation error:', err);
			setError(err.message || 'Failed to generate content. Please try again.');
			setSubmitting(false);
		}
	}

	async function pollForCompletion(): Promise<boolean> {
		if (!selectedBrand) return false;
		try {
			const res = await fetch(
				`/api/content/queue?stage=approval&brand_profile_id=${selectedBrand}`,
				{ cache: 'no-store' }
			);
			if (!res.ok) return false;
			const data = await res.json();
			const items = Array.isArray(data.items) ? data.items : [];
			return items.length > 0;
		} catch {
			return false;
		}
	}

	function handleContentGenerationComplete() {
		router.push(`/content/approval?brand_profile_id=${selectedBrand}`);
	}

	if (showLoading) {
		return (
			<ContentGenerationLoading
				onComplete={handleContentGenerationComplete}
				pollForCompletion={pollForCompletion}
				brandProfileId={selectedBrand}
			/>
		);
	}

	if (loading) {
		return (
			<main className="p-6">
				<div className="max-w-2xl mx-auto card p-8 text-center">
					<Loader2 className="w-8 h-8 text-primary animate-spin mx-auto mb-4" />
					<p className="text-text-soft">Loading...</p>
				</div>
			</main>
		);
	}

	if (brands.length === 0) {
		return (
			<main className="p-6">
				<div className="max-w-2xl mx-auto card p-8 text-center">
					<AlertCircle className="w-12 h-12 text-warning mx-auto mb-4" />
					<h2 className="text-xl font-semibold mb-2">No Approved Strategies</h2>
					<p className="text-text-dim mb-4">
						You need to create and approve a brand strategy before generating content.
					</p>
					<button
						onClick={() => router.push('/onboarding')}
						className="px-6 py-3 rounded-xl2 bg-primary hover:bg-primary/90 text-white font-semibold"
					>
						Create Brand
					</button>
				</div>
			</main>
		);
	}

	return (
		<main className="p-4 md:p-6">
			<div className="max-w-3xl mx-auto space-y-6">
				<div>
					<h1 className="text-2xl md:text-3xl font-semibold mb-2">Generate Content</h1>
					<p className="text-text-dim">
						Create additional posts for your brands within your monthly allowance.
					</p>
				</div>

				{/* Export-only note for Starter plan */}
				{isStarterPlan && (
					<div className="card p-4 bg-blue-500/10 border border-blue-500/30">
						<div className="flex items-center gap-2 mb-1">
							<AlertCircle className="w-4 h-4 text-blue-400" />
							<p className="text-sm font-semibold text-blue-300">Starter content pack</p>
						</div>
						<p className="text-sm text-blue-300/80 mb-2">
							Your Starter plan includes LinkedIn, 𝕏 and Blog for manual export. When you generate content, we automatically create up to 4 LinkedIn posts, 4 𝕏 posts and 1 blog article from your strategy.
						</p>
						<p className="text-xs text-blue-300/70">
							Keep this tab open while your content is being created. Closing the browser or tab during generation can cause errors or incomplete results.
						</p>
					</div>
				)}

				{/* Usage Summary */}
				{usageData && (
					<div className="card p-4 bg-primary/5 border border-primary/20">
						<div className="flex items-center justify-between">
							<div>
								<p className="text-sm font-medium">Posts Remaining This Month</p>
								<p className="text-2xl font-semibold text-primary">
									{postsRemaining === 999999 ? '∞' : postsRemaining}
								</p>
							</div>
							{totalRequested > 0 && (
								<div className="text-right">
									<p className="text-sm text-text-dim">Requesting</p>
									<p className={`text-2xl font-semibold ${totalRequested > postsRemaining ? 'text-danger' : 'text-text'}`}>
										{totalRequested}
									</p>
								</div>
							)}
						</div>
					</div>
				)}

				{/* Error Message */}
				{error && (
					<div className="card p-4 bg-danger/10 border border-danger/30">
						<p className="text-danger text-sm">{error}</p>
					</div>
				)}

				<form onSubmit={handleSubmit} className="card p-6 space-y-6">
					{/* Brand Selection */}
					<div>
						<label className="block text-sm font-semibold mb-2">
							Select Brand *
						</label>
						<select
							value={selectedBrand}
							onChange={(e) => {
								setSelectedBrand(e.target.value);
								setQuantities({}); // Reset quantities when brand changes
							}}
							className="w-full px-4 py-3 rounded-xl2 border border-edge/60 bg-bg/80 text-text focus:border-primary/60 focus:outline-none focus:ring-1 focus:ring-primary/20"
							required
						>
							{brands.length === 0 && <option value="">No brands available</option>}
							{brands.length > 0 && <option value="">Choose a brand...</option>}
							{brands.map((brand) => (
								<option key={brand.id} value={brand.id}>
									{brand.client_name}
								</option>
							))}
						</select>
					</div>

					{/* Channel Quantities */}
					{selectedBrand && selectedBrandData && (
						<div>
							{isStarterPlan ? (
								<>
									<label className="block text-sm font-semibold mb-3">
										Your Starter content pack
									</label>
									<p className="text-sm text-text-dim mb-2">
										When you click Generate, we create up to:
									</p>
									<ul className="list-disc pl-5 text-sm text-text-dim">
										<li>4 LinkedIn posts (export-only)</li>
										<li>4 𝕏 posts (export-only)</li>
										<li>1 blog article (export-only)</li>
									</ul>
									{totalRequested > postsRemaining && (
										<p className="mt-3 text-sm text-danger flex items-center gap-2">
											<AlertCircle className="w-4 h-4" />
											Exceeds monthly limit by {totalRequested - postsRemaining} posts
										</p>
									)}
								</>
							) : (
								<>
									<label className="block text-sm font-semibold mb-3">
										How many posts per channel? *
									</label>
									<p className="text-sm text-text-dim mb-2">
										Select the channels and specify how many posts to create for each.
									</p>
									<div className="space-y-3">
										{availablePlatforms.map((platform) => {
											const cap = PER_CHANNEL_REQUEST_CAPS[platform.value.toLowerCase()] ?? 50;
											return (
												<div
													key={platform.value}
													className="flex items-center gap-4 p-3 rounded-xl2 border border-edge/60 bg-surface/30"
												>
													<div className="flex items-center gap-3 flex-1">
														<span className="text-2xl">{platform.icon}</span>
														<span className="font-medium">{platform.label}</span>
														<span className="text-xs text-text-dim">(max {cap} per request)</span>
													</div>
													<input
														type="number"
														min="0"
														max={cap}
														value={quantities[platform.value] || 0}
														onChange={(e) => {
															const val = parseInt(e.target.value) || 0;
															setQuantities((prev) => ({
																...prev,
																[platform.value]: Math.max(0, Math.min(cap, val)),
															}));
														}}
														className="w-20 px-3 py-2 rounded-lg border border-edge/60 bg-bg/80 text-text text-center focus:border-primary/60 focus:outline-none focus:ring-1 focus:ring-primary/20"
														placeholder="0"
													/>
												</div>
											);
										})}
									</div>

									{totalRequested > postsRemaining && (
										<p className="mt-3 text-sm text-danger flex items-center gap-2">
											<AlertCircle className="w-4 h-4" />
											Exceeds monthly limit by {totalRequested - postsRemaining} posts
										</p>
									)}
								</>
							)}
						</div>
					)}

					{/* Submit Button */}
					<div className="flex items-center justify-between pt-4 border-t border-edge/60">
						<button
							type="button"
							onClick={() => router.back()}
							className="px-4 py-2 rounded-xl2 border border-edge/60 hover:bg-surface/30 transition"
						>
							Cancel
						</button>
						<button
							type="submit"
							disabled={!canSubmit || submitting}
							className="px-6 py-3 rounded-xl2 bg-primary hover:bg-primary/90 text-white font-semibold disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
						>
							{submitting ? (
								<>
									<Loader2 className="w-5 h-5 animate-spin" />
									Generating...
								</>
							) : (
								<>
									<Sparkles className="w-5 h-5" />
									Generate Content
									<ArrowRight className="w-4 h-4" />
								</>
							)}
						</button>
					</div>
				</form>
			</div>
		</main>
	);
}
