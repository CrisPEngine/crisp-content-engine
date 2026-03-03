import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/**
 * /signup is linked from the billing page "Start free" (Starter/Free Forever).
 * - Logged-in users: go to dashboard (they already have an account).
 * - Everyone else: go to sign-in with signup=true for registration.
 */
export default async function SignupPage() {
	const supabase = await createClient();
	const { data: { user } } = await supabase.auth.getUser();
	if (user) redirect('/dashboard');
	redirect('/sign-in?signup=true');
}
