import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { PlanUsageCard } from '@/components/PlanUsageCard';

export default async function AppDashboardPage() {
	const supabase = await createClient();
	const { data: { user } } = await supabase.auth.getUser();
	
	if (!user) redirect('/login');
	
	// Onboarding gate: check for entitlements
	const { data: sub } = await supabase.from('subscriptions').select('plan').eq('user_id', user.id).maybeSingle();
	if (!sub) {
		redirect('/onboarding');
	}
	
	return (
		<div className="p-6 space-y-6">
			<PlanUsageCard />
			<div className="card p-6">Welcome to your app dashboard.</div>
		</div>
	);
}


