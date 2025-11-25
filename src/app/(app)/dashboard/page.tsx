import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { PlanUsageCard } from '@/components/PlanUsageCard';
import { BrandProfilesList } from '@/components/BrandProfilesList';
import { DashboardTabs } from '@/components/DashboardTabs';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const runtime = 'nodejs';

type Tab = 'overview' | 'content';

async function getContentItems(userId: string) {
	try {
		const res = await fetch(`${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/api/content/queue?stage=all`, {
			cache: 'no-store',
			headers: {
				// We need to pass auth somehow - for now, this will be handled client-side
			},
		});
		if (res.ok) {
			const data = await res.json();
			return data.items || [];
		}
		return [];
	} catch (error) {
		console.error('Failed to fetch content:', error);
		return [];
	}
}

export default async function Dashboard({
	searchParams,
}: {
	searchParams: Promise<{ tab?: string }>;
}) {
	const supabase = await createClient();
	const { data: { user } } = await supabase.auth.getUser();

	if (!user) redirect('/login');

	// Get user profile to check admin status
	const { data: profile } = await supabase
		.from('profiles')
		.select('is_admin')
		.eq('id', user.id)
		.single();

	// Check if user has a subscription - admins can bypass
	const { data: sub } = await supabase
		.from('subscriptions')
		.select('plan')
		.eq('user_id', user.id)
		.maybeSingle();

	// Always allow access to dashboard - show "Select Your Plan" button if no subscription
	// Admins can bypass subscription requirement
	// Also allow access if coming from Stripe success (subscription might not be processed yet)
	const params = await searchParams;
	const fromStripe = (params as any).sub === 'success';
	const hasSubscription = !!sub || profile?.is_admin || fromStripe;

	const activeTab: Tab = (params.tab === 'content' ? 'content' : 'overview') as Tab;
	const subSuccess = (params as any).sub === 'success';
	const error = (params as any).error;
	const disconnected = (params as any).disconnected;

	// Check onboarding progress
	let hasBrandProfiles = false;
	let hasApprovedStrategies = false;
	let brandProfiles: any[] = [];
	let isLinkedInConnected = false;
	let hasContentToReview = false;
	
	// Check social connections first (for Step 1)
	const { data: connections } = await supabase
		.from('social_connections')
		.select('provider')
		.eq('user_id', user.id);
	
	const connectedPlatforms = (connections || []).map((c: any) => c.provider?.toLowerCase() || '');
	isLinkedInConnected = connectedPlatforms.includes('linkedin');
	
	try {
		const brandsRes = await fetch(`${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/api/brands`, {
			cache: 'no-store',
			headers: {
				// Auth handled by API
			},
		});
		if (brandsRes.ok) {
			const brandsData = await brandsRes.json();
			brandProfiles = brandsData.profiles || [];
			hasBrandProfiles = brandProfiles.length > 0;
			
			// Check if any brand has an approved strategy
			// Strategy is approved if status is "Strategy Approved" or if it has strategy_summary and status indicates approval
			hasApprovedStrategies = brandProfiles.some((p: any) => {
				const status = p.status || p.original_status || '';
				return status === 'Strategy Approved' || 
				       (p.strategy_summary && p.strategy_summary.trim() && status.includes('Approved'));
			});
		}
		
		// Check if there's content to review (Step 4)
		if (hasApprovedStrategies) {
			try {
				const contentRes = await fetch(`${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/api/content/queue?stage=approval`, {
					cache: 'no-store',
				});
				if (contentRes.ok) {
					const contentData = await contentRes.json();
					hasContentToReview = Array.isArray(contentData.items) && contentData.items.length > 0;
				}
			} catch (error) {
				console.error('Failed to check content queue:', error);
			}
		}
	} catch (error) {
		console.error('Failed to check brand profiles:', error);
	}
	
	// Determine current step (1-4)
	// Step 1: Connect LinkedIn (if not connected)
	// Step 2: Complete questionnaire (if LinkedIn connected but no brand profiles)
	// Step 3: Approve strategy (if has brand profiles but no approved strategies)
	// Step 4: Review content (if has approved strategies but has content to review)
	let currentStep = 1;
	if (isLinkedInConnected && !hasBrandProfiles) {
		currentStep = 2;
	} else if (isLinkedInConnected && hasBrandProfiles && !hasApprovedStrategies) {
		currentStep = 3;
	} else if (isLinkedInConnected && hasBrandProfiles && hasApprovedStrategies && hasContentToReview) {
		currentStep = 4;
	} else if (isLinkedInConnected && hasBrandProfiles && hasApprovedStrategies && !hasContentToReview) {
		// All steps complete - don't show onboarding
		currentStep = 0;
	}
	
	// Get user's plan and brand limit
	let maxBrands = 999; // Default to high number for admins or no subscription
	let currentBrandCount = brandProfiles.length;
	try {
		if (sub) {
			const { data: entitlements } = await supabase
				.from('entitlements')
				.select('max_brands')
				.eq('user_id', user.id)
				.single();
			if (entitlements?.max_brands) {
				maxBrands = entitlements.max_brands;
			}
		}
	} catch (error) {
		console.error('Failed to get entitlements:', error);
	}

	// For content tab, we'll fetch on client side since we need auth
	// Server-side fetch would require passing cookies which is complex

	return (
		<main className="p-4 md:p-6 space-y-4 md:space-y-6">
			<div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
				<h1 className="text-2xl md:text-3xl font-semibold">Welcome 👋</h1>
				{profile?.is_admin && (
					<a
						href="/admin"
						className="px-4 py-2 rounded-xl2 border border-accent/40 bg-accent/10 hover:bg-accent/20 text-sm whitespace-nowrap"
					>
						Admin Dashboard
					</a>
				)}
			</div>
			<p className="text-sm md:text-base text-text-dim">
				You're signed in as <span className="font-medium">{user.email}</span>.
			</p>

			{/* Prominent "Select Your Plan" button for users without subscription */}
			{!hasSubscription && (
				<div className="card p-4 md:p-6 bg-gradient-to-br from-primary/20 to-primary/5 border-2 border-primary/40 shadow-lg">
					<div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
						<div className="flex-1">
							<h2 className="text-lg md:text-xl font-semibold mb-2">Select Your Plan to Continue</h2>
							<p className="text-sm md:text-base text-text-dim">
								Choose a plan to unlock AI-powered content generation, scheduling, and publishing for your brand.
							</p>
						</div>
						<a
							href="/billing"
							className="w-full sm:w-auto px-6 md:px-8 py-3 rounded-xl2 bg-primary hover:bg-primary/90 text-white font-semibold whitespace-nowrap shadow-lg hover:shadow-xl transition-all transform hover:scale-105 text-center"
						>
							Select Your Plan
						</a>
					</div>
				</div>
			)}

			{/* Success message after payment */}
			{subSuccess && (
				<div className="card p-4 bg-accent/10 border border-accent/30">
					<p className="text-accent font-medium text-sm md:text-base">Payment successful! Welcome to CRISP Content Engine.</p>
				</div>
			)}

			{/* Success message after disconnection */}
			{disconnected && (
				<div className="card p-4 bg-accent/10 border border-accent/30">
					<p className="text-accent font-medium text-sm md:text-base">
						{disconnected === 'linkedin' 
							? 'LinkedIn account disconnected successfully. Please connect your accounts to enable publishing.'
							: 'Account disconnected successfully.'}
					</p>
				</div>
			)}

			{/* Error message */}
			{error && (
				<div className="card p-4 bg-warning/10 border border-warning/30">
					<p className="text-warning font-medium text-sm md:text-base">An error was encountered during strategy or content development. Please try again or contact support.</p>
				</div>
			)}

			{/* Progressive Onboarding Steps */}
			{currentStep > 0 && activeTab === 'overview' && (
				<div className="card p-4 md:p-6 bg-primary/5 border border-primary/20">
					<h3 className="font-semibold mb-4 text-base md:text-lg">Get Started</h3>
					<div className="space-y-3">
						{/* Step 1: Connect LinkedIn */}
						<div className={`flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-3 rounded-xl2 ${currentStep === 1 ? 'bg-primary/10 border border-primary/30' : 'opacity-60'}`}>
							<div className="flex-1">
								<h4 className="font-medium text-sm md:text-base mb-1">Step 1. Connect your social media account(s)</h4>
							</div>
							{currentStep === 1 && (
								<a
									href="/connections"
									className="w-full sm:w-auto px-4 md:px-6 py-2 rounded-xl2 bg-primary/10 hover:bg-primary/20 border border-primary/30 text-primary font-medium whitespace-nowrap text-center text-sm md:text-base"
								>
									Connect Accounts Now
								</a>
							)}
							{currentStep > 1 && (
								<span className="text-xs text-accent font-medium">✓ Complete</span>
							)}
						</div>

						{/* Step 2: Complete Questionnaire */}
						<div className={`flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-3 rounded-xl2 ${currentStep === 2 ? 'bg-primary/10 border border-primary/30' : currentStep < 2 ? 'opacity-40' : 'opacity-60'}`}>
							<div className="flex-1">
								<h4 className="font-medium text-sm md:text-base mb-1">Step 2. Complete your brand questionnaire to generate your content strategy</h4>
							</div>
							{currentStep === 2 && (
								<a
									href="/onboarding"
									className="w-full sm:w-auto px-4 md:px-6 py-2 rounded-xl2 bg-primary/10 hover:bg-primary/20 border border-primary/30 text-primary font-medium whitespace-nowrap text-center text-sm md:text-base"
								>
									Complete Questionnaire Now
								</a>
							)}
							{currentStep > 2 && (
								<span className="text-xs text-accent font-medium">✓ Complete</span>
							)}
							{currentStep < 2 && (
								<span className="text-xs text-text-dim">Locked</span>
							)}
						</div>

						{/* Step 3: Approve Strategy */}
						<div className={`flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-3 rounded-xl2 ${currentStep === 3 ? 'bg-primary/10 border border-primary/30' : currentStep < 3 ? 'opacity-40' : 'opacity-60'}`}>
							<div className="flex-1">
								<h4 className="font-medium text-sm md:text-base mb-1">Step 3. Approve your bespoke content strategy</h4>
							</div>
							{currentStep === 3 && brandProfiles.length > 0 && (
								<a
									href={`/strategy/${brandProfiles[0].id}`}
									className="w-full sm:w-auto px-4 md:px-6 py-2 rounded-xl2 bg-primary/10 hover:bg-primary/20 border border-primary/30 text-primary font-medium whitespace-nowrap text-center text-sm md:text-base"
								>
									Approve Strategy
								</a>
							)}
							{currentStep > 3 && (
								<span className="text-xs text-accent font-medium">✓ Complete</span>
							)}
							{currentStep < 3 && (
								<span className="text-xs text-text-dim">Locked</span>
							)}
						</div>

						{/* Step 4: Review Content */}
						<div className={`flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-3 rounded-xl2 ${currentStep === 4 ? 'bg-primary/10 border border-primary/30' : currentStep < 4 ? 'opacity-40' : 'opacity-60'}`}>
							<div className="flex-1">
								<h4 className="font-medium text-sm md:text-base mb-1">Step 4. Human Oversight - Review, Approve/Edit and Auto Schedule your Content</h4>
							</div>
							{currentStep === 4 && (
								<a
									href="/content/approval"
									className="w-full sm:w-auto px-4 md:px-6 py-2 rounded-xl2 bg-primary/10 hover:bg-primary/20 border border-primary/30 text-primary font-medium whitespace-nowrap text-center text-sm md:text-base"
								>
									Review Content
								</a>
							)}
							{currentStep > 4 && (
								<span className="text-xs text-accent font-medium">✓ Complete</span>
							)}
							{currentStep < 4 && (
								<span className="text-xs text-text-dim">Locked</span>
							)}
						</div>
					</div>
				</div>
			)}

			<DashboardTabs activeTab={activeTab} />

			{activeTab === 'overview' && (
				<>
					<PlanUsageCard />

					<BrandProfilesList 
						maxBrands={maxBrands}
						currentBrandCount={currentBrandCount}
					/>

					{/* Quick Actions */}
					<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
						<a
							href="/onboarding"
							className="card p-4 md:p-6 hover:bg-surface/50 transition cursor-pointer border-2 border-dashed border-edge/60"
						>
							<h3 className="font-semibold mb-2 text-sm md:text-base">Create New Brand</h3>
							<p className="text-xs md:text-sm text-text-dim">
								Add a new brand profile to start generating content
							</p>
						</a>
						<a
							href="/connections"
							className="card p-4 md:p-6 hover:bg-surface/50 transition cursor-pointer border-2 border-dashed border-edge/60"
						>
							<h3 className="font-semibold mb-2 text-sm md:text-base">Connect Accounts</h3>
							<p className="text-xs md:text-sm text-text-dim">
								Connect your social media accounts for publishing
							</p>
						</a>
						<a
							href="/strategy/monthly-update"
							className="card p-4 md:p-6 hover:bg-surface/50 transition cursor-pointer border-2 border-dashed border-edge/60"
						>
							<h3 className="font-semibold mb-2 text-sm md:text-base">Monthly Strategy Update</h3>
							<p className="text-xs md:text-sm text-text-dim">
								Share fresh objectives & themes so we can evolve next month's plan
							</p>
						</a>
					</div>
				</>
			)}
		</main>
	);
}
