import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { PlanUsageCard } from '@/components/PlanUsageCard';
import { BrandProfilesList } from '@/components/BrandProfilesList';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const runtime = 'nodejs';

export default async function Dashboard() {
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

			<PlanUsageCard />

			<BrandProfilesList />

			{/* Quick Actions */}
			<div className="grid gap-4 md:grid-cols-2">
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
			</div>
		</main>
	);
}


