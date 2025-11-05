import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { PlanUsageCard } from '@/components/PlanUsageCard';

export default async function Dashboard() {
	const supabase = createClient();
	const { data: { user } } = await supabase.auth.getUser();

	if (!user) redirect('/login');

	return (
		<main className="p-6 space-y-6">
			<h1 className="text-3xl font-semibold">Welcome 👋</h1>
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


