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
		const query = searchParams.get('q') || '';
		const limit = parseInt(searchParams.get('limit') || '50', 10);
		const includeAuthOnly = searchParams.get('include_auth_only') === 'true';

		// If including auth-only users, we need to get all auth users and match with profiles
		if (includeAuthOnly) {
			// Get all auth users (limited)
			const { data: { users: authUsers }, error: authError } = await admin.auth.admin.listUsers({
				page: 1,
				perPage: limit * 2, // Get more to filter
			});

			if (authError) {
				console.error('Failed to list auth users:', authError);
				return NextResponse.json({ error: 'Failed to fetch auth users' }, { status: 500 });
			}

			// Get all profiles
			const { data: profiles } = await admin
				.from('profiles')
				.select('id, email, full_name, is_admin, created_at');

			// Create a map of profile IDs
			const profileMap = new Map((profiles || []).map(p => [p.id, p]));

			// Get subscriptions for all users
			const { data: subscriptions } = await admin
				.from('subscriptions')
				.select('user_id, plan, cycle, status');

			const subscriptionMap = new Map((subscriptions || []).map(s => [s.user_id, s]));

			// Combine auth users with profiles
			const combinedUsers = (authUsers || []).map(authUser => {
				const profile = profileMap.get(authUser.id);
				const subscription = subscriptionMap.get(authUser.id);
				return {
					id: authUser.id,
					email: authUser.email || authUser.user_metadata?.email || 'no-email',
					full_name: profile?.full_name || authUser.user_metadata?.full_name || null,
					is_admin: profile?.is_admin || false,
					created_at: authUser.created_at || profile?.created_at || new Date().toISOString(),
					has_profile: !!profile,
					email_confirmed: !!authUser.email_confirmed_at,
					last_sign_in: authUser.last_sign_in_at || null,
					subscription: subscription ? {
						plan: subscription.plan,
						cycle: subscription.cycle,
						status: subscription.status,
					} : null,
				};
			});

			// Filter by query if provided
			let filteredUsers = combinedUsers;
			if (query) {
				const lowerQuery = query.toLowerCase();
				filteredUsers = combinedUsers.filter(u => 
					u.email.toLowerCase().includes(lowerQuery) ||
					(u.full_name && u.full_name.toLowerCase().includes(lowerQuery))
				);
			}

			// If no query, show users without profiles first
			if (!query) {
				filteredUsers.sort((a, b) => {
					if (a.has_profile !== b.has_profile) {
						return a.has_profile ? 1 : -1; // No profile first
					}
					return new Date(b.created_at).getTime() - new Date(a.created_at).getTime(); // Newest first
				});
			}

			return NextResponse.json({ 
				users: filteredUsers.slice(0, limit),
				total_auth_users: authUsers?.length || 0,
				users_without_profiles: filteredUsers.filter(u => !u.has_profile).length,
			});
		}

		// Original behavior: only users with profiles
		let queryBuilder = admin.from('profiles').select('id, email, full_name, is_admin, created_at');

		if (query) {
			queryBuilder = queryBuilder.or(`email.ilike.%${query}%,full_name.ilike.%${query}%`);
		}

		const { data: users, error } = await queryBuilder.limit(limit);

		if (error) {
			return NextResponse.json({ error: error.message }, { status: 500 });
		}

		// Get subscriptions for users with profiles
		const userIds = (users || []).map(u => u.id);
		const { data: subscriptions } = await admin
			.from('subscriptions')
			.select('user_id, plan, cycle, status')
			.in('user_id', userIds.length > 0 ? userIds : ['']);

		const subscriptionMap = new Map((subscriptions || []).map(s => [s.user_id, s]));

		// Add subscription info to users
		const usersWithSubs = (users || []).map(user => ({
			...user,
			has_profile: true,
			subscription: subscriptionMap.get(user.id) ? {
				plan: subscriptionMap.get(user.id)!.plan,
				cycle: subscriptionMap.get(user.id)!.cycle,
				status: subscriptionMap.get(user.id)!.status,
			} : null,
		}));

		return NextResponse.json({ users: usersWithSubs });
	} catch (e: any) {
		return NextResponse.json({ error: e?.message ?? 'Server error' }, { status: 500 });
	}
}

