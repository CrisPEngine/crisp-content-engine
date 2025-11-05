import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { PlanUsageCard } from '@/components/PlanUsageCard';

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
		.eq('user_id', user.id)
		.single();

	// Check if user has a subscription - if not, redirect to billing
	const { data: sub } = await supabase
		.from('subscriptions')
		.select('plan')
		.eq('user_id', user.id)
		.maybeSingle();

	if (!sub) {
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

			{/* Replace this with your onboarding / plan selection / connections */}
			<div className="card p-4">
				<h2 className="text-xl font-medium mb-2">Next steps</h2>
				<ol className="list-decimal ml-5 space-y-1">
					<li>Connect Airtable / Buffer (or native LI/X) accounts</li>
					<li>Create your Brand Profile</li>
					<li>Generate your first content calendar</li>
				</ol>
			</div>
		</main>
	);
}


