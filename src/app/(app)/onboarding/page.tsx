import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import Link from 'next/link';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const runtime = 'nodejs';

export default async function OnboardingPage() {
	const supabase = await createClient();
	const { data: { user } } = await supabase.auth.getUser();
	
	if (!user) redirect('/login');
	
	// Check if user already has a subscription
	const { data: sub } = await supabase.from('subscriptions').select('plan').eq('user_id', user.id).maybeSingle();
	if (sub) redirect('/dashboard');
	
	return (
		<div className="mx-auto max-w-2xl">
			<div className="card p-8 space-y-6">
				<h1 className="text-2xl font-semibold">Welcome! Let's get started</h1>
				<p className="text-text-dim">Choose a plan to unlock your content engine.</p>
				<Link href="/billing" className="inline-block rounded-xl2 border border-primary/40 bg-primary/10 px-6 py-3 hover:bg-primary/20">
					View Plans →
				</Link>
			</div>
		</div>
	);
}

