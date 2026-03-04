import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { getSupabaseService } from '@/lib/supabaseService';
import { capsFor } from '@/lib/billing';

export const runtime = 'nodejs';

/**
 * Select the Starter (Free Forever) plan for the currently authenticated user.
 * This:
 * - Sets subscriptions.plan = 'starter' and clears any trial dates
 * - Upserts entitlements to Starter caps
 */
export async function POST() {
	try {
		const cookieStore = await cookies();
		const supabase = createServerClient(
			process.env.NEXT_PUBLIC_SUPABASE_URL!,
			process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
			{
				cookies: {
					get(name: string) {
						return cookieStore.get(name)?.value;
					},
					set(name: string, value: string, options: CookieOptions) {
						cookieStore.set({ name, value, ...options });
					},
					remove(name: string, options: CookieOptions) {
						cookieStore.set({ name, value: '', ...options });
					},
				},
			}
		);

		const { data: { user }, error } = await supabase.auth.getUser();
		if (error || !user) {
			return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
		}

		const admin = getSupabaseService();
		const now = new Date().toISOString();
		const caps = capsFor('starter');

		// Ensure subscription row exists and is Starter (clear trial fields so planResolver stops treating as trial)
		const { error: subError } = await admin.from('subscriptions').upsert({
			user_id: user.id,
			plan: 'starter',
			cycle: 'monthly',
			stripe_subscription_id: null,
			current_period_end: null,
			trial_start_at: null,
			trial_end_at: null,
		});
		if (subError) throw subError;

		const { error: entError } = await admin.from('entitlements').upsert({
			user_id: user.id,
			...caps,
			updated_at: now,
		});
		if (entError) throw entError;

		return NextResponse.json({ ok: true, plan: 'starter' });
	} catch (e: any) {
		console.error('[Select Starter] Failed:', e?.message || e);
		return NextResponse.json({ error: e?.message || 'Failed to select Starter' }, { status: 500 });
	}
}

