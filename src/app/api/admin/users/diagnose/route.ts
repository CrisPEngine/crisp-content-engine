/**
 * GET /api/admin/users/diagnose?user_id=...
 * 
 * Diagnostic endpoint to check user status across all tables
 * Shows what data exists for a user even if they don't have a profile
 */

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

export async function GET(req: Request) {
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
		const { searchParams } = new URL(req.url);
		const userId = searchParams.get('user_id');

		if (!userId) {
			return NextResponse.json({ error: 'Missing user_id parameter' }, { status: 400 });
		}

		// Get auth user info
		let authUser: any = null;
		try {
			const authResult = await admin.auth.admin.getUserById(userId);
			authUser = authResult.data;
		} catch (error) {
			// User might not exist in auth
			console.warn(`User ${userId} not found in auth.users:`, error);
		}
		
		// Get profile
		const { data: profile } = await admin
			.from('profiles')
			.select('*')
			.eq('id', userId)
			.maybeSingle();

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

		// Get social connections
		const { data: connections } = await admin
			.from('social_connections')
			.select('*')
			.eq('user_id', userId);

		// Get strategy notifications
		const { data: strategyNotifications } = await admin
			.from('strategy_notifications')
			.select('*')
			.eq('user_id', userId)
			.order('created_at', { ascending: false })
			.limit(10);

		// Check Airtable for brand profiles (if we have brand_profile_id from connections)
		let brandProfiles: any[] = [];
		if (connections && connections.length > 0) {
			const brandProfileIds = connections
				.map(c => c.brand_profile_id)
				.filter(Boolean)
				.flat();
			
			if (brandProfileIds.length > 0) {
				// Note: This would require Airtable API call, but for now just note it
				brandProfiles = [];
			}
		}

		// Determine user status
		let status = 'unknown';
		let issues: string[] = [];

		if (!authUser?.user) {
			status = 'not_found';
			issues.push('User does not exist in auth.users');
		} else {
			if (!profile) {
				status = 'no_profile';
				issues.push('User exists in auth.users but has no profile record');
			} else {
				status = 'has_profile';
			}

			if (!subscription) {
				issues.push('No subscription record found');
			}

			if (!entitlements) {
				issues.push('No entitlements record found');
			}

			if (!connections || connections.length === 0) {
				issues.push('No social connections found');
			}
		}

		return NextResponse.json({
			user_id: userId,
			status,
			issues,
			auth_user: authUser?.user ? {
				id: authUser.user.id,
				email: authUser.user.email,
				created_at: authUser.user.created_at,
				last_sign_in_at: authUser.user.last_sign_in_at,
				email_confirmed_at: authUser.user.email_confirmed_at,
				confirmed: !!authUser.user.email_confirmed_at,
			} : null,
			profile: profile || null,
			subscription: subscription || null,
			entitlements: entitlements || null,
			social_connections: connections || [],
			strategy_notifications: strategyNotifications || [],
			has_profile: !!profile,
			has_subscription: !!subscription,
			has_entitlements: !!entitlements,
			has_connections: (connections?.length || 0) > 0,
		});
	} catch (e: any) {
		console.error('Diagnose user error:', e);
		return NextResponse.json({ error: e?.message ?? 'Server error' }, { status: 500 });
	}
}
