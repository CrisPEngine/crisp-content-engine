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

	// Check if user has brand profiles and strategies (using Airtable via API)
	let hasBrandProfiles = false;
	let hasStrategies = false;
	let brandProfiles: any[] = [];
	let needsConnection = false;
	let connectedPlatforms: string[] = [];
	
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
			// Check if any brand has a strategy (strategy_summary exists)
			hasStrategies = brandProfiles.some((p: any) => p.strategy_summary && p.strategy_summary.trim());
			
			// Check which platforms are requested across all brands
			const requestedPlatforms = new Set<string>();
			brandProfiles.forEach((p: any) => {
				if (p.platforms_requested && Array.isArray(p.platforms_requested)) {
					p.platforms_requested.forEach((platform: string) => {
						// Map to lowercase for comparison
						const normalized = platform.toLowerCase();
						if (normalized === 'linkedin') requestedPlatforms.add('linkedin');
						if (normalized === 'x' || normalized === 'twitter') requestedPlatforms.add('x');
						if (normalized === 'instagram') requestedPlatforms.add('instagram');
						if (normalized === 'facebook') requestedPlatforms.add('facebook');
					});
				}
			});
			
			// Check social connections
			const { data: connections } = await supabase
				.from('social_connections')
				.select('provider')
				.eq('user_id', user.id);
			
			connectedPlatforms = (connections || []).map((c: any) => c.provider?.toLowerCase() || '');
			
			// Check if any requested platform is not connected
			if (requestedPlatforms.size > 0) {
				const missingPlatforms = Array.from(requestedPlatforms).filter(
					platform => !connectedPlatforms.includes(platform)
				);
				needsConnection = missingPlatforms.length > 0;
			}
		}
	} catch (error) {
		console.error('Failed to check brand profiles:', error);
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

			{/* Prominent Connect Accounts section - show at top if accounts not connected */}
			{hasBrandProfiles && needsConnection && activeTab === 'overview' && (
				<div className="card p-4 md:p-6 bg-gradient-to-br from-accent/20 to-accent/5 border-2 border-accent/40 shadow-lg">
					<div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
						<div className="flex-1">
							<h2 className="text-lg md:text-xl font-semibold mb-2">Connect Your Accounts</h2>
							<p className="text-sm md:text-base text-text-dim">
								Connect your social media accounts to enable automatic publishing. This is required before content can be published.
							</p>
						</div>
						<a
							href="/connections"
							className="w-full sm:w-auto px-6 md:px-8 py-3 rounded-xl2 bg-accent hover:bg-accent/90 text-white font-semibold whitespace-nowrap shadow-lg hover:shadow-xl transition-all transform hover:scale-105 text-center"
						>
							Connect Accounts
						</a>
					</div>
				</div>
			)}

			{/* Show onboarding button if user has no brand profiles OR no strategies */}
			{(!hasBrandProfiles || !hasStrategies) && activeTab === 'overview' && (
				<div className="card p-4 md:p-6 bg-primary/5 border border-primary/20">
					<div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
						<div className="flex-1">
							<h3 className="font-semibold mb-1 text-base md:text-lg">Get Started</h3>
							<p className="text-sm text-text-dim">Complete your brand questionnaire to generate your content strategy</p>
						</div>
						<a
							href="/onboarding"
							className="w-full sm:w-auto px-4 md:px-6 py-2 md:py-3 rounded-xl2 bg-primary/10 hover:bg-primary/20 border border-primary/30 text-primary font-medium whitespace-nowrap text-center text-sm md:text-base"
						>
							Complete Your Brand Questionnaire
						</a>
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
