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

	// Admins can bypass subscription requirement
	if (!sub && !profile?.is_admin) {
		redirect('/billing');
	}

	const params = await searchParams;
	const activeTab: Tab = (params.tab === 'content' ? 'content' : 'overview') as Tab;

	// For content tab, we'll fetch on client side since we need auth
	// Server-side fetch would require passing cookies which is complex

	return (
		<main className="p-6 space-y-6">
			<div className="flex items-center justify-between">
				<h1 className="text-3xl font-semibold">Welcome 👋</h1>
				{profile?.is_admin && (
					<a
						href="/admin"
						className="px-4 py-2 rounded-xl2 border border-accent/40 bg-accent/10 hover:bg-accent/20 text-sm"
					>
						Admin Dashboard
					</a>
				)}
			</div>
			<p className="text-text-dim">
				You're signed in as <span className="font-medium">{user.email}</span>.
			</p>

			<DashboardTabs activeTab={activeTab} />

			{activeTab === 'overview' && (
				<>
					<PlanUsageCard />

					<BrandProfilesList />

					{/* Quick Actions */}
					<div className="grid gap-4 md:grid-cols-3">
						<a
							href="/onboarding"
							className="card p-6 hover:bg-surface/50 transition cursor-pointer border-2 border-dashed border-edge/60"
						>
							<h3 className="font-semibold mb-2">Create New Brand</h3>
							<p className="text-sm text-text-dim">
								Add a new brand profile to start generating content
							</p>
						</a>
						<a
							href="/connections"
							className="card p-6 hover:bg-surface/50 transition cursor-pointer border-2 border-dashed border-edge/60"
						>
							<h3 className="font-semibold mb-2">Connect Accounts</h3>
							<p className="text-sm text-text-dim">
								Connect your social media accounts for publishing
							</p>
						</a>
						<a
							href="/strategy/monthly-update"
							className="card p-6 hover:bg-surface/50 transition cursor-pointer border-2 border-dashed border-edge/60"
						>
							<h3 className="font-semibold mb-2">Monthly Strategy Update</h3>
							<p className="text-sm text-text-dim">
								Share fresh objectives & themes so we can evolve next month's plan
							</p>
						</a>
					</div>
				</>
			)}
		</main>
	);
}
