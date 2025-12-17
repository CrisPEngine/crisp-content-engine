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

export async function GET(req: Request, { params }: { params: Promise<{ userId: string }> }) {
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
		const { userId } = await params;

		// Get auth user info (even if no profile exists)
		let authUser: any = null;
		try {
			const authResult = await admin.auth.admin.getUserById(userId);
			authUser = authResult.data;
		} catch (error) {
			// User might not exist in auth
			console.warn(`User ${userId} not found in auth.users:`, error);
		}

		// Get user profile (may not exist)
		const { data: profile, error: profileError } = await admin
			.from('profiles')
			.select('*')
			.eq('id', userId)
			.maybeSingle();

		// If no profile exists, return auth user info with diagnostic data
		if (!profile) {
			return NextResponse.json({
				profile: null,
				auth_user: authUser?.user ? {
					id: authUser.user.id,
					email: authUser.user.email,
					created_at: authUser.user.created_at,
					last_sign_in_at: authUser.user.last_sign_in_at,
					email_confirmed_at: authUser.user.email_confirmed_at,
				} : null,
				subscription: null,
				entitlements: null,
				has_profile: false,
				diagnostic: {
					exists_in_auth: !!authUser?.user,
					email_confirmed: !!authUser?.user?.email_confirmed_at,
					last_sign_in: authUser?.user?.last_sign_in_at || null,
				},
			});
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

export async function PATCH(req: Request, { params }: { params: Promise<{ userId: string }> }) {
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
		const { userId } = await params;
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
		// Only use columns that exist in schema: user_id, plan, cycle
		await admin.from('subscriptions').upsert({
			user_id: userId,
			plan,
			cycle,
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

