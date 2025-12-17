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

		// Get social connections
		const { data: connections } = await admin
			.from('social_connections')
			.select('*')
			.eq('user_id', userId);

		// Get usage stats
		const { data: usage } = await admin
			.from('usage_posts')
			.select('*')
			.eq('user_id', userId)
			.order('year_month', { ascending: false })
			.limit(12);

		// Get Airtable data (brand profiles, content, briefs)
		let airtableData: any = {
			brand_profiles: [],
			content_count: 0,
			pending_content_count: 0,
			content_briefs: [],
			has_onboarding: false,
		};

		try {
			const AIRTABLE_TOKEN = process.env.AIRTABLE_PAT;
			const BASE_ID = process.env.AIRTABLE_BASE_ID;
			const BRANDPROFILES_TABLE = process.env.AIRTABLE_BRANDPROFILES_TABLE;
			const CONTENTQUEUE_TABLE = process.env.AIRTABLE_CONTENTQUEUE_TABLE;
			const CONTENTBRIEFS_TABLE = process.env.AIRTABLE_STRATEGYUPDATES_TABLE;

			if (AIRTABLE_TOKEN && BASE_ID && BRANDPROFILES_TABLE) {
				// Get brand profiles
				const brandsUrl = new URL(`https://api.airtable.com/v0/${BASE_ID}/${BRANDPROFILES_TABLE}`);
				brandsUrl.searchParams.set('filterByFormula', `{user_id} = "${userId}"`);
				brandsUrl.searchParams.set('maxRecords', '10');

				const brandsRes = await fetch(brandsUrl.toString(), {
					headers: {
						Authorization: `Bearer ${AIRTABLE_TOKEN}`,
						'Content-Type': 'application/json',
					},
				});

				if (brandsRes.ok) {
					const brandsData = await brandsRes.json();
					airtableData.brand_profiles = (brandsData.records || []).map((r: any) => ({
						id: r.id,
						client_name: r.fields?.client_name || r.fields?.brand_name || 'Unnamed',
						brand_type: r.fields?.brand_type || 'unknown',
						status: r.fields?.status || 'unknown',
						created_time: r.fields?.created_time || r.createdTime,
					}));
					airtableData.has_onboarding = airtableData.brand_profiles.length > 0;
				}

				// Get content count (fetch all to get accurate count)
				if (CONTENTQUEUE_TABLE) {
					const contentUrl = new URL(`https://api.airtable.com/v0/${BASE_ID}/${CONTENTQUEUE_TABLE}`);
					contentUrl.searchParams.set('filterByFormula', `{user_id} = "${userId}"`);
					contentUrl.searchParams.set('maxRecords', '100'); // Get up to 100 to count

					const contentRes = await fetch(contentUrl.toString(), {
						headers: {
							Authorization: `Bearer ${AIRTABLE_TOKEN}`,
							'Content-Type': 'application/json',
						},
					});

					if (contentRes.ok) {
						const contentData = await contentRes.json();
						const allContent = contentData.records || [];
						airtableData.content_count = allContent.length;

						// Count pending content
						airtableData.pending_content_count = allContent.filter((r: any) => {
							const status = r.fields?.status || '';
							return status === 'Needs Approval' || status === 'Ready To Publish';
						}).length;
					}
				}

				// Get content briefs
				if (CONTENTBRIEFS_TABLE) {
					const briefsUrl = new URL(`https://api.airtable.com/v0/${BASE_ID}/${CONTENTBRIEFS_TABLE}`);
					briefsUrl.searchParams.set('filterByFormula', `{user_id} = "${userId}"`);
					briefsUrl.searchParams.set('sort[0][field]', 'submitted_at');
					briefsUrl.searchParams.set('sort[0][direction]', 'desc');
					briefsUrl.searchParams.set('maxRecords', '5');

					const briefsRes = await fetch(briefsUrl.toString(), {
						headers: {
							Authorization: `Bearer ${AIRTABLE_TOKEN}`,
							'Content-Type': 'application/json',
						},
					});

					if (briefsRes.ok) {
						const briefsData = await briefsRes.json();
						airtableData.content_briefs = (briefsData.records || []).map((r: any) => ({
							id: r.id,
							status: r.fields?.status || 'unknown',
							cycle_label: r.fields?.cycle_label || '',
							submitted_at: r.fields?.submitted_at || null,
						}));
					}
				}
			}
		} catch (error) {
			console.error('Failed to fetch Airtable data:', error);
			// Don't fail the request if Airtable fails
		}

		return NextResponse.json({
			profile,
			subscription,
			entitlements,
			social_connections: connections || [],
			usage: usage || [],
			airtable: airtableData,
			has_profile: !!profile,
			user_journey: {
				has_auth: !!authUser?.user,
				has_profile: !!profile,
				has_subscription: !!subscription,
				has_brand: airtableData.brand_profiles.length > 0,
				has_connections: (connections?.length || 0) > 0,
				has_content: airtableData.content_count > 0,
				email_confirmed: !!authUser?.user?.email_confirmed_at,
				last_sign_in: authUser?.user?.last_sign_in_at || null,
			},
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

