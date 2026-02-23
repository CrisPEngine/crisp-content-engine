import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { PlanUsageCard } from '@/components/PlanUsageCard';
import { BrandProfilesList } from '@/components/BrandProfilesList';
import { DashboardTabs } from '@/components/DashboardTabs';
import { OnboardingDebug } from '@/components/OnboardingDebug';
import { GenerateContentActions } from '@/components/GenerateContentActions';
import { StrategyCard } from '@/components/StrategyCard';
import { CardSkeleton, UsageCardSkeleton } from '@/components/skeletons/Skeleton';
import { AuthLoadingHandler } from '@/components/AuthLoadingHandler';
import { NewBrandCallout } from '@/components/NewBrandCallout';
import { Suspense } from 'react';

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
	searchParams: Promise<{ tab?: string; auth?: string }>;
}) {
	// Check authentication first - redirects must happen outside try-catch
	const supabase = await createClient();
	const params = await searchParams;
	const isAuthLoading = params.auth === 'loading';
	
	const { data: { user }, error: authError } = await supabase.auth.getUser();

	if (authError) {
		console.error('Auth error in dashboard:', authError);
		redirect('/sign-in');
	}

	if (!user) {
		// If we're in auth loading state, show dashboard loading interstitial (not auth page)
		// So user sees "Loading your dashboard" immediately after OAuth, not a confusing auth screen
		if (isAuthLoading) {
			return (
				<>
					<AuthLoadingHandler />
					<main className="flex flex-col items-center justify-center min-h-[70vh] p-6">
						<div className="text-center space-y-4 max-w-sm">
							<div className="inline-block h-10 w-10 animate-spin rounded-full border-4 border-primary/30 border-t-primary" />
							<h2 className="text-lg font-semibold text-text">Loading your dashboard</h2>
							<p className="text-sm text-text-dim">Preparing your workspace...</p>
						</div>
						<div className="mt-10 w-full max-w-2xl space-y-4 opacity-60">
							<div className="h-24 rounded-xl2 bg-surface/50 border border-edge/60 animate-pulse" />
							<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
								<div className="h-32 rounded-xl2 bg-surface/50 border border-edge/60 animate-pulse" />
								<div className="h-32 rounded-xl2 bg-surface/50 border border-edge/60 animate-pulse" />
							</div>
							<div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
								<div className="h-28 rounded-xl2 bg-surface/50 border border-edge/60 animate-pulse" />
								<div className="h-28 rounded-xl2 bg-surface/50 border border-edge/60 animate-pulse" />
								<div className="h-28 rounded-xl2 bg-surface/50 border border-edge/60 animate-pulse" />
							</div>
						</div>
					</main>
				</>
			);
		}
		redirect('/sign-in');
	}

	try {
		// Get user profile to check admin status
		const { data: profile, error: profileError } = await supabase
			.from('profiles')
			.select('is_admin')
			.eq('id', user.id)
			.maybeSingle();
		
		// Log profile error but don't fail - profile might not exist yet
		if (profileError) {
			console.error('Failed to fetch profile:', profileError);
		}

		// Check if user has a subscription - admins can bypass
		const { data: sub } = await supabase
			.from('subscriptions')
			.select('plan')
			.eq('user_id', user.id)
			.maybeSingle();

		// Entitlements: admin-set plan writes here; treat as having a plan so "Select Your Plan" doesn't show
		const { data: entitlementsRow } = await supabase
			.from('entitlements')
			.select('max_brands')
			.eq('user_id', user.id)
			.maybeSingle();

		// Always allow access to dashboard - show "Select Your Plan" button if no subscription
		// Admins can bypass; also if admin set plan (entitlements row exists with plan caps), treat as having a plan
		const fromStripe = (params as any).sub === 'success';
		const hasSubscription =
			!!sub ||
			(entitlementsRow != null && entitlementsRow.max_brands != null) ||
			profile?.is_admin ||
			fromStripe;

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
		// Use API endpoint instead of direct Airtable call (uses new client with caching)
		// This ensures consistency and benefits from the optimized /api/brands endpoint
		const cookieStore = await import('next/headers').then(m => m.cookies());
		const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
		
		// Build cookie header properly
		const cookieHeader: string[] = [];
		cookieStore.getAll().forEach(cookie => {
			cookieHeader.push(`${cookie.name}=${cookie.value}`);
		});
		
		const brandsRes = await fetch(`${siteUrl}/api/brands`, {
			headers: cookieHeader.length > 0 ? { Cookie: cookieHeader.join('; ') } : {},
			cache: 'no-store',
		});

		if (brandsRes.ok) {
			const brandsData = await brandsRes.json();
			brandProfiles = (brandsData.profiles || []).map((profile: any) => ({
				id: profile.id,
				client_name: profile.client_name || '',
				status: profile.status || 'New Brief',
				original_status: profile.original_status || profile.status || 'New Brief',
				has_pending_content: profile.has_pending_content || false,
				created_time: profile.created_time || '',
				platforms_requested: profile.platforms_requested || [],
				strategy_summary: profile.strategy_summary || '',
				strategy_payload: profile.strategy_payload || null,
				strategy_meta: profile.strategy_meta || null,
				brand_type: profile.brand_type || 'company',
			}));

			hasBrandProfiles = brandProfiles.length > 0;
			
			// Check if any brand has an approved strategy
			hasApprovedStrategies = brandProfiles.some((p: any) => {
				const status = (p.status || p.original_status || '').toString();
				return status === 'Strategy Approved' || 
				       status.toLowerCase().includes('approved');
			});
		} else {
			console.error('[Dashboard] Failed to fetch brand profiles from API:', brandsRes.status);
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
	
		// Determine current step (1-5). Order: 1 Questionnaire → 2 Approve → 3 Generate content → 4 Connect social → 5 Review/schedule
		// Step 0 = all done (don't show Get Started box)
		let currentStep = 1;
		
		// Check if any brand has "Strategy Ready" status (means questionnaire is complete, strategy generated)
		const hasStrategyReady = brandProfiles.some((p: any) => {
			const status = (p.status || p.original_status || '').toString();
			if (status === 'Strategy Approved') return false;
			return status === 'Strategy Ready' || 
			       status === 'Strategy Ready (Awaiting Approval)' ||
			       status === 'Strategy Ready For Approval' ||
			       (status.toLowerCase().includes('strategy ready') && !status.toLowerCase().includes('approved'));
		});
		
		if (hasContentToReview) {
			currentStep = 5; // Review, Edit/Approve and Schedule content
		} else if (hasApprovedStrategies && isLinkedInConnected && !hasContentToReview) {
			currentStep = 0; // All done
		} else if (hasApprovedStrategies && !isLinkedInConnected) {
			currentStep = 4; // Connect social media (steps 1-3 done)
		} else if (hasApprovedStrategies && !hasContentToReview) {
			currentStep = 3; // Generate content for brand and channels
		} else if (hasStrategyReady && !hasApprovedStrategies) {
			currentStep = 2; // Approve strategy
		} else {
			currentStep = 1; // Complete questionnaire
		}
		
		// Get user's plan and brand limit (entitlementsRow already fetched above)
		let maxBrands = 999; // Default to high number for admins or no subscription
		let currentBrandCount = brandProfiles.length;
		if (entitlementsRow?.max_brands != null) {
			maxBrands = entitlementsRow.max_brands;
		}

		// For content tab, we'll fetch on client side since we need auth
		// Server-side fetch would require passing cookies which is complex

		return (
			<main className="p-4 md:p-6 space-y-4 md:space-y-6">
			<OnboardingDebug
				isLinkedInConnected={isLinkedInConnected}
				hasBrandProfiles={hasBrandProfiles}
				hasStrategyReady={hasStrategyReady}
				hasApprovedStrategies={hasApprovedStrategies}
				hasContentToReview={hasContentToReview}
				brandProfiles={brandProfiles}
				currentStep={currentStep}
			/>
			<div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
				<div className="flex-1">
					<h1 className="text-2xl md:text-3xl font-semibold">Welcome 👋</h1>
					<p className="text-sm md:text-base text-text-dim mt-1">
						You're signed in as <span className="font-medium">{user.email}</span>.
					</p>
				</div>
				<div className="flex items-center gap-3">
					{profile?.is_admin && (
						<a
							href="/admin"
							className="px-4 py-2 rounded-xl2 border border-accent/40 bg-accent/10 hover:bg-accent/20 text-sm whitespace-nowrap"
						>
							Admin Dashboard
						</a>
					)}
				</div>
			</div>

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

			{/* New brand callout: refresh hint when landing from onboarding */}
			<Suspense fallback={null}>
				<NewBrandCallout />
			</Suspense>

			<DashboardTabs activeTab={activeTab} />

			{activeTab === 'overview' && (
				<>
					{/* Plan and Get Started/Content Actions boxes side by side */}
					<div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
						{/* Your Plan box - Left side */}
						<div className="flex">
							<PlanUsageCard />
						</div>

						{/* Get Started box - Right side (during onboarding) */}
						{currentStep > 0 && (
							<div className="flex">
								<div className="w-full card p-3 md:p-4 bg-primary/5 border border-primary/20 flex flex-col">
									<h3 className="font-semibold mb-3 text-sm md:text-base">Get Started</h3>
									<div className="space-y-2 flex-1">
										{/* Step 1: Complete questionnaire */}
										<div className={`flex flex-col gap-2 p-2 rounded-lg text-xs ${currentStep === 1 ? 'bg-primary/10 border border-primary/30' : currentStep < 1 ? 'opacity-40' : 'opacity-60'}`}>
											<div className="font-medium">Step 1. Complete your brand questionnaire to generate your content strategy</div>
											{currentStep === 1 && (
												<a
													href="/onboarding"
													className="px-3 py-1.5 rounded-lg bg-primary/10 hover:bg-primary/20 border border-primary/30 text-primary font-medium text-center text-xs"
												>
													Complete Questionnaire Now
												</a>
											)}
											{currentStep > 1 && <span className="text-xs text-accent font-medium">✓ Complete</span>}
											{currentStep < 1 && <span className="text-xs text-text-dim">Locked</span>}
										</div>

										{/* Step 2: Approve strategy */}
										<div className={`flex flex-col gap-2 p-2 rounded-lg text-xs ${currentStep === 2 ? 'bg-primary/10 border border-primary/30' : currentStep < 2 ? 'opacity-40' : 'opacity-60'}`}>
											<div className="font-medium">Step 2. Approve your bespoke content strategy</div>
											{currentStep === 2 && brandProfiles.length > 0 && (
												<a
													href={`/strategy/${brandProfiles[0].id}`}
													className="px-3 py-1.5 rounded-lg bg-primary/10 hover:bg-primary/20 border border-primary/30 text-primary font-medium text-center text-xs"
												>
													Approve Strategy
												</a>
											)}
											{currentStep > 2 && <span className="text-xs text-accent font-medium">✓ Complete</span>}
											{currentStep < 2 && <span className="text-xs text-text-dim">Locked</span>}
										</div>

										{/* Step 3: Generate content */}
										<div className={`flex flex-col gap-2 p-2 rounded-lg text-xs ${currentStep === 3 ? 'bg-primary/10 border border-primary/30' : currentStep < 3 ? 'opacity-40' : 'opacity-60'}`}>
											<div className="font-medium">Step 3. Generate content for your brand and channels</div>
											{currentStep === 3 && brandProfiles.length > 0 && (
												<a
													href={`/content/generate?brand=${brandProfiles[0].id}`}
													className="px-3 py-1.5 rounded-lg bg-primary/10 hover:bg-primary/20 border border-primary/30 text-primary font-medium text-center text-xs"
												>
													Generate Content
												</a>
											)}
											{currentStep > 3 && <span className="text-xs text-accent font-medium">✓ Complete</span>}
											{currentStep < 3 && <span className="text-xs text-text-dim">Locked</span>}
										</div>

										{/* Step 4: Connect social */}
										<div className={`flex flex-col gap-2 p-2 rounded-lg text-xs ${currentStep === 4 ? 'bg-primary/10 border border-primary/30' : currentStep < 4 ? 'opacity-40' : 'opacity-60'}`}>
											<div className="font-medium">Step 4. Connect your social media account(s)</div>
											{currentStep === 4 && (
												<a
													href="/connections"
													className="px-3 py-1.5 rounded-lg bg-primary/10 hover:bg-primary/20 border border-primary/30 text-primary font-medium text-center text-xs"
												>
													Connect Accounts Now
												</a>
											)}
											{currentStep > 4 && <span className="text-xs text-accent font-medium">✓ Complete</span>}
											{currentStep < 4 && <span className="text-xs text-text-dim">Locked</span>}
										</div>

										{/* Step 5: Review/schedule content */}
										<div className={`flex flex-col gap-2 p-2 rounded-lg text-xs ${currentStep === 5 ? 'bg-primary/10 border border-primary/30' : currentStep < 5 ? 'opacity-40' : 'opacity-60'}`}>
											<div className="font-medium">Step 5. Human Oversight - Review, Edit/Approve and Schedule your Content</div>
											{currentStep === 5 && (
												<a
													href="/content/approval"
													className="px-3 py-1.5 rounded-lg bg-primary/10 hover:bg-primary/20 border border-primary/30 text-primary font-medium text-center text-xs"
												>
													Review Content
												</a>
											)}
											{currentStep > 5 && <span className="text-xs text-accent font-medium">✓ Complete</span>}
											{currentStep < 5 && <span className="text-xs text-text-dim">Locked</span>}
										</div>
									</div>
								</div>
							</div>
						)}

						{/* Generate Content Actions - Right side (after onboarding complete) */}
						{currentStep === 0 && hasApprovedStrategies && brandProfiles.length > 0 && (
							<div className="flex">
								<GenerateContentActions brandProfiles={brandProfiles} />
							</div>
						)}
					</div>

					<BrandProfilesList 
						maxBrands={maxBrands}
						currentBrandCount={currentBrandCount}
					/>

					{/* Strategy Card - Only show if user has approved strategies */}
					{hasApprovedStrategies && brandProfiles.length > 0 && (
						<StrategyCard brandProfileId={brandProfiles[0].id} />
					)}

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
							href="/content-brief"
							className="card p-4 md:p-6 hover:bg-surface/50 transition cursor-pointer border-2 border-dashed border-edge/60"
						>
							<h3 className="font-semibold mb-2 text-sm md:text-base">Monthly Content Brief</h3>
							<p className="text-xs md:text-sm text-text-dim">
								Submit a brief to guide next month's content generation
							</p>
						</a>
					</div>
				</>
			)}
			</main>
		);
	} catch (error: any) {
		console.error('Dashboard error:', error);
		// Return a minimal error page instead of crashing
		return (
			<main className="p-4 md:p-6 space-y-4 md:space-y-6">
				<div className="card p-6 bg-danger/10 border border-danger/30">
					<h1 className="text-xl font-semibold mb-2">Error Loading Dashboard</h1>
					<p className="text-text-dim mb-4">
						We encountered an error while loading your dashboard. Please try refreshing the page.
					</p>
					<p className="text-xs text-text-soft">
						Error: {error?.message || 'Unknown error'}
					</p>
					<a
						href="/dashboard"
						className="mt-4 inline-block px-4 py-2 rounded-xl2 bg-primary/10 hover:bg-primary/20 border border-primary/30 text-primary font-medium text-sm"
					>
						Refresh Dashboard
					</a>
				</div>
			</main>
		);
	}
}
