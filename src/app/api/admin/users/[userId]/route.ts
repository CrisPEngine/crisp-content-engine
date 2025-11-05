import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getSupabaseService } from '@/lib/supabaseService';

export const runtime = 'nodejs';

async function checkAdmin(userId: string) {
	const admin = getSupabaseService();
	const { data: profile } = await admin
		.from('profiles')
		.select('is_admin')
		.eq('id', userId)
		.single();
	return profile?.is_admin === true;
}

export async function GET(req: Request, { params }: { params: { userId: string } }) {
	try {
		const supabase = await createClient();
		const { data: { user } } = await supabase.auth.getUser();
		
		if (!user) {
			return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
		}

		const isAdmin = await checkAdmin(user.id);
		if (!isAdmin) {
			return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
		}

		const admin = getSupabaseService();
		const { userId } = params;

		// Get user profile
		const { data: profile, error: profileError } = await admin
			.from('profiles')
			.select('*')
			.eq('id', userId)
			.single();

		if (profileError) {
			return NextResponse.json({ error: profileError.message }, { status: 404 });
		}

		// Get subscription
		const { data: subscription } = await admin
			.from('subscriptions')
			.select('*')
			.eq('user_id', userId)
			.maybeSingle();

		// Get entitlements
		const { data: entitlements } = await admin
			.from('entitlements')
			.select('*')
			.eq('user_id', userId)
			.maybeSingle();

		return NextResponse.json({
			profile,
			subscription,
			entitlements,
		});
	} catch (e: any) {
		return NextResponse.json({ error: e?.message ?? 'Server error' }, { status: 500 });
	}
}

export async function PATCH(req: Request, { params }: { params: { userId: string } }) {
	try {
		const supabase = await createClient();
		const { data: { user } } = await supabase.auth.getUser();
		
		if (!user) {
			return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
		}

		const isAdmin = await checkAdmin(user.id);
		if (!isAdmin) {
			return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
		}

		const admin = getSupabaseService();
		const { userId } = params;
		const body = await req.json();
		const { plan, cycle } = body;

		if (!plan || !cycle) {
			return NextResponse.json({ error: 'Missing plan or cycle' }, { status: 400 });
		}

		const validPlans = ['creator', 'growth', 'pro', 'scale'];
		const validCycles = ['monthly', 'annual'];

		if (!validPlans.includes(plan) || !validCycles.includes(cycle)) {
			return NextResponse.json({ error: 'Invalid plan or cycle' }, { status: 400 });
		}

		// Import billing functions
		const { upsertSubscriptionAndEntitlements, capsFor } = await import('@/lib/billing');
		const caps = capsFor(plan);

		// Update subscription
		await admin.from('subscriptions').upsert({
			user_id: userId,
			provider: 'stripe',
			plan,
			cycle,
			status: 'active',
			updated_at: new Date().toISOString(),
		});

		// Update entitlements
		await admin.from('entitlements').upsert({
			user_id: userId,
			...caps,
			updated_at: new Date().toISOString(),
		});

		return NextResponse.json({ success: true });
	} catch (e: any) {
		return NextResponse.json({ error: e?.message ?? 'Server error' }, { status: 500 });
	}
}

