import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { PlanUsageCard } from '@/components/PlanUsageCard';
import { BrandProfilesList } from '@/components/BrandProfilesList';
import { DashboardTabs } from '@/components/DashboardTabs';
import { OnboardingDebug } from '@/components/OnboardingDebug';
import { GenerateContentActions } from '@/components/GenerateContentActions';

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
	try {
		const supabase = await createClient();
		const { data: { user }, error: authError } = await supabase.auth.getUser();

		if (authError) {
			console.error('Auth error in dashboard:', authError);
			redirect('/login');
		}

		if (!user) redirect('/login');

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
		// Fetch brands directly from Airtable (same logic as API but server-side)
		const AIRTABLE_TOKEN = process.env.AIRTABLE_PAT;
		const BASE_ID = process.env.AIRTABLE_BASE_ID;
		const TABLE_ID = process.env.AIRTABLE_BRANDPROFILES_TABLE;

		if (AIRTABLE_TOKEN && BASE_ID && TABLE_ID) {
			try {
				const airtableRes = await fetch(
					`https://api.airtable.com/v0/${BASE_ID}/${TABLE_ID}?filterByFormula={user_id}="${user.id}"&sort[0][field]=created_time&sort[0][direction]=desc`,
					{
						headers: {
							Authorization: `Bearer ${AIRTABLE_TOKEN}`,
						},
						cache: 'no-store',
					}
				);

				if (!airtableRes.ok) {
					const errorText = await airtableRes.text();
					console.error('Airtable API error:', airtableRes.status, errorText);
				} else {
					const airtableData = await airtableRes.json();
					const records = airtableData?.records || [];

					// Transform records to match API format
					brandProfiles = records.map((record: any) => {
					try {
						const fields = record.fields || {};
						const status = fields.status || '';
						const normalisedStatus = status === 'Strategy Ready (Awaiting Approval)' ? 'Strategy Ready' : status;
						
						return {
							id: record.id,
							client_name: fields.client_name || '',
							status: normalisedStatus,
							original_status: normalisedStatus,
							has_pending_content: false, // We'll check this separately if needed
							created_time: fields.created_time || record.createdTime || '',
							platforms_requested: Array.isArray(fields.platforms_requested) ? fields.platforms_requested : [],
							strategy_summary: fields.strategy_summary || '',
							strategy_payload: fields.strategy_payload || fields.strategy_json || null,
							strategy_meta: fields.strategy_meta || null,
							brand_type: fields.brand_type || 'company', // Add brand_type for filtering
						};
					} catch (recordError) {
						console.error('Error processing brand profile record:', recordError, record);
						// Return a minimal valid record to prevent crashes
						return {
							id: record.id || '',
							client_name: 'Unknown Brand',
							status: '',
							original_status: '',
							has_pending_content: false,
							created_time: '',
							platforms_requested: [],
							strategy_summary: '',
							strategy_payload: null,
							strategy_meta: null,
							brand_type: 'company',
						};
					}
				});

				hasBrandProfiles = brandProfiles.length > 0;
				
				// Check if any brand has an approved strategy
					hasApprovedStrategies = brandProfiles.some((p: any) => {
						const status = (p.status || p.original_status || '').toString();
						return status === 'Strategy Approved' || 
						       status.toLowerCase().includes('approved');
					});
				}
			} catch (airtableError) {
				console.error('Error fetching from Airtable:', airtableError);
				// Continue with empty brandProfiles array
				brandProfiles = [];
			}
		} else {
			console.warn('Missing Airtable configuration:', {
				hasToken: !!AIRTABLE_TOKEN,
				hasBaseId: !!BASE_ID,
				hasTableId: !!TABLE_ID,
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
	// Step 2: Complete questionnaire (if LinkedIn connected but no brand profiles OR has brand profiles but no strategy ready/approved)
	// Step 3: Approve strategy (if has brand profiles with strategy ready but not approved)
	// Step 4: Review content (if has approved strategies but has content to review)
	let currentStep = 1;
	
	// Check if any brand has "Strategy Ready" status (means questionnaire is complete, strategy generated)
	const hasStrategyReady = brandProfiles.some((p: any) => {
		const status = (p.status || p.original_status || '').toString();
		return status === 'Strategy Ready' || 
		       status === 'Strategy Ready (Awaiting Approval)' ||
		       status === 'Strategy Ready For Approval' ||
		       status.toLowerCase().includes('strategy ready');
	});
	
	if (isLinkedInConnected && !hasBrandProfiles) {
		currentStep = 2;
	} else if (isLinkedInConnected && hasBrandProfiles && !hasStrategyReady && !hasApprovedStrategies) {
		currentStep = 2; // Still need to complete questionnaire (brand created but no strategy yet)
	} else if (isLinkedInConnected && hasBrandProfiles && hasStrategyReady && !hasApprovedStrategies) {
		currentStep = 3; // Strategy ready, needs approval
	} else if (isLinkedInConnected && hasBrandProfiles && hasApprovedStrategies && hasContentToReview) {
		currentStep = 4; // Approved, has content to review
	} else if (isLinkedInConnected && hasBrandProfiles && hasApprovedStrategies && !hasContentToReview) {
		// All steps complete - don't show onboarding
		currentStep = 0;
	}
	
	// Get user's plan and brand limit
	let maxBrands = 999; // Default to high number for admins or no subscription
	let currentBrandCount = brandProfiles.length;
	try {
		if (sub) {
			const { data: entitlements, error: entitlementsError } = await supabase
				.from('entitlements')
				.select('max_brands')
				.eq('user_id', user.id)
				.maybeSingle();
			
			if (entitlementsError) {
				console.error('Failed to get entitlements:', entitlementsError);
			} else if (entitlements?.max_brands) {
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
										{/* Step 1: Connect LinkedIn */}
										<div className={`flex flex-col gap-2 p-2 rounded-lg text-xs ${currentStep === 1 ? 'bg-primary/10 border border-primary/30' : 'opacity-60'}`}>
											<div className="font-medium">Step 1. Connect your social media account(s)</div>
											{currentStep === 1 && (
												<a
													href="/connections"
													className="px-3 py-1.5 rounded-lg bg-primary/10 hover:bg-primary/20 border border-primary/30 text-primary font-medium text-center text-xs"
												>
													Connect Accounts Now
												</a>
											)}
											{currentStep > 1 && (
												<span className="text-xs text-accent font-medium">✓ Complete</span>
											)}
										</div>

										{/* Step 2: Complete Questionnaire */}
										<div className={`flex flex-col gap-2 p-2 rounded-lg text-xs ${currentStep === 2 ? 'bg-primary/10 border border-primary/30' : currentStep < 2 ? 'opacity-40' : 'opacity-60'}`}>
											<div className="font-medium">Step 2. Complete your brand questionnaire to generate your content strategy</div>
											{currentStep === 2 && (
												<a
													href="/onboarding"
													className="px-3 py-1.5 rounded-lg bg-primary/10 hover:bg-primary/20 border border-primary/30 text-primary font-medium text-center text-xs"
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
										<div className={`flex flex-col gap-2 p-2 rounded-lg text-xs ${currentStep === 3 ? 'bg-primary/10 border border-primary/30' : currentStep < 3 ? 'opacity-40' : 'opacity-60'}`}>
											<div className="font-medium">Step 3. Approve your bespoke content strategy</div>
											{currentStep === 3 && brandProfiles.length > 0 && (
												<a
													href={`/strategy/${brandProfiles[0].id}`}
													className="px-3 py-1.5 rounded-lg bg-primary/10 hover:bg-primary/20 border border-primary/30 text-primary font-medium text-center text-xs"
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
										<div className={`flex flex-col gap-2 p-2 rounded-lg text-xs ${currentStep === 4 ? 'bg-primary/10 border border-primary/30' : currentStep < 4 ? 'opacity-40' : 'opacity-60'}`}>
											<div className="font-medium">Step 4. Human Oversight - Review, Approve/Edit and Auto Schedule your Content</div>
											{currentStep === 4 && (
												<a
													href="/content/approval"
													className="px-3 py-1.5 rounded-lg bg-primary/10 hover:bg-primary/20 border border-primary/30 text-primary font-medium text-center text-xs"
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
