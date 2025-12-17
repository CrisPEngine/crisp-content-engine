/**
 * POST /api/admin/users/batch-diagnose
 * 
 * Diagnostic endpoint to check multiple users at once
 * Body: { user_ids: string[] }
 * 
 * Returns diagnostic info for each user including:
 * - Auth status
 * - Profile existence
 * - Subscription status
 * - Social connections
 * - Last activity
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

export async function POST(req: Request) {
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

		const body = await req.json();
		const { user_ids } = body;

		if (!Array.isArray(user_ids) || user_ids.length === 0) {
			return NextResponse.json({ error: 'Missing or empty user_ids array' }, { status: 400 });
		}

		const admin = getSupabaseService();
		const results = [];

		for (const userId of user_ids) {
			try {
				// Get auth user info
				let authUser: any = null;
				try {
					const authResult = await admin.auth.admin.getUserById(userId);
					authUser = authResult.data;
				} catch (error) {
					// User might not exist in auth
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
					.limit(5);

				// Determine status
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

					if (!connections || connections.length === 0) {
						issues.push('No social connections found');
					}
				}

				results.push({
					user_id: userId,
					email: authUser?.user?.email || 'unknown',
					status,
					issues,
					has_profile: !!profile,
					has_subscription: !!subscription,
					has_connections: (connections?.length || 0) > 0,
					connection_count: connections?.length || 0,
					email_confirmed: !!authUser?.user?.email_confirmed_at,
					created_at: authUser?.user?.created_at || null,
					last_sign_in_at: authUser?.user?.last_sign_in_at || null,
					subscription_plan: subscription?.plan || null,
					strategy_notifications_count: strategyNotifications?.length || 0,
				});
			} catch (error: any) {
				results.push({
					user_id: userId,
					email: 'error',
					status: 'error',
					issues: [error?.message || 'Unknown error'],
					error: error?.message,
				});
			}
		}

		return NextResponse.json({ results });
	} catch (e: any) {
		console.error('Batch diagnose error:', e);
		return NextResponse.json({ error: e?.message ?? 'Server error' }, { status: 500 });
	}
}
