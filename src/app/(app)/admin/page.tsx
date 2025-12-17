'use client';

import { useState, useEffect } from 'react';
import { useSupabase } from '@/components/SupabaseProvider';
import { PRICING, type PlanId } from '@/config/pricing';
import Link from 'next/link';
import { Skeleton } from '@/components/skeletons/Skeleton';
import { LoadingButton } from '@/components/LoadingButton';

type User = {
	id: string;
	email: string;
	full_name: string | null;
	is_admin: boolean;
	created_at: string;
	has_profile?: boolean;
	email_confirmed?: boolean;
	last_sign_in?: string | null;
	subscription?: {
		plan: string;
		cycle: string;
		status?: string;
	} | null;
};

type UserDetails = {
	profile: any;
	subscription: any;
	entitlements: any;
	social_connections?: any[];
	usage?: any[];
	airtable?: {
		brand_profiles: any[];
		content_count: number;
		pending_content_count: number;
		content_briefs: any[];
		has_onboarding: boolean;
	};
	user_journey?: {
		has_auth: boolean;
		has_profile: boolean;
		has_subscription: boolean;
		has_brand: boolean;
		has_connections: boolean;
		has_content: boolean;
		email_confirmed: boolean;
		last_sign_in: string | null;
	};
	has_profile?: boolean;
	diagnostic?: any;
};

export default function AdminPage() {
	const supabase = useSupabase();
	const [loading, setLoading] = useState(true);
	const [isAdmin, setIsAdmin] = useState(false);
	const [users, setUsers] = useState<User[]>([]);
	const [searchQuery, setSearchQuery] = useState('');
	const [selectedUser, setSelectedUser] = useState<UserDetails | null>(null);
	const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
	const [selectedPlan, setSelectedPlan] = useState<PlanId>('creator');
	const [selectedCycle, setSelectedCycle] = useState<'monthly' | 'annual'>('monthly');
	const [refreshLoading, setRefreshLoading] = useState(false);
	const [showCreateUser, setShowCreateUser] = useState(false);
	const [createUserEmail, setCreateUserEmail] = useState('');
	const [createUserPlan, setCreateUserPlan] = useState<PlanId>('creator');
	const [createUserCycle, setCreateUserCycle] = useState<'monthly' | 'annual'>('monthly');
	const [createUserTrialDays, setCreateUserTrialDays] = useState(7);
	const [creatingUser, setCreatingUser] = useState(false);
	const [offeringTrial, setOfferingTrial] = useState(false);
	const [trialPlan, setTrialPlan] = useState<PlanId>('creator');
	const [trialCycle, setTrialCycle] = useState<'monthly' | 'annual'>('monthly');
	const [trialDays, setTrialDays] = useState(30);

	useEffect(() => {
		if (!supabase) return;
		checkAdminAndLoadUsers();
	}, [supabase]);

	async function checkAdminAndLoadUsers() {
		if (!supabase) return;
		try {
			const { data: { user } } = await supabase.auth.getUser();
			if (!user) {
				window.location.href = '/login';
				return;
			}

			// Check if user is admin
			const { data: profile } = await supabase
				.from('profiles')
				.select('is_admin')
				.eq('id', user.id)
				.single();

			if (!profile?.is_admin) {
				window.location.href = '/dashboard';
				return;
			}

			setIsAdmin(true);
			loadUsers();
		} catch (error) {
			console.error('Error checking admin:', error);
			window.location.href = '/dashboard';
		}
	}

	const [includeAuthOnly, setIncludeAuthOnly] = useState(false);

	async function loadUsers(forceIncludeAuthOnly?: boolean) {
		setLoading(true);
		try {
			const include = forceIncludeAuthOnly ?? includeAuthOnly;
			const url = `/api/admin/users?q=${encodeURIComponent(searchQuery)}${include ? '&include_auth_only=true' : ''}&limit=100`;
			console.log('[Admin] Loading users from:', url);
			const res = await fetch(url, { cache: 'no-store' });
			if (!res.ok) {
				const errorData = await res.json().catch(() => ({}));
				throw new Error(errorData.error || 'Failed to load users');
			}
			const data = await res.json();
			console.log('[Admin] Users loaded:', {
				total: data.users?.length || 0,
				without_profiles: data.users_without_profiles || 0,
				debug: data.debug,
			});
			setUsers(data.users || []);
			
			// Show info about users without profiles if included
			if (include) {
				const withoutProfiles = data.users_without_profiles || 0;
				if (withoutProfiles > 0) {
					console.log(`✓ Found ${withoutProfiles} users without profiles`);
				} else {
					console.warn('⚠ No users without profiles found. Check if auth.users has users without profiles.');
				}
			}
		} catch (error: any) {
			console.error('Error loading users:', error);
			alert(error.message || 'Failed to load users. Please try again.');
		} finally {
			setLoading(false);
		}
	}

	async function loadUserDetails(userId: string) {
		try {
			console.log('[Admin] Loading user details for:', userId);
			const res = await fetch(`/api/admin/users/${userId}`, { 
				cache: 'no-store',
				headers: {
					'Cache-Control': 'no-cache',
				}
			});
			if (!res.ok) {
				const errorData = await res.json().catch(() => ({}));
				console.error('[Admin] Failed to load user details:', errorData);
				throw new Error(errorData.error || 'Failed to load user details');
			}
			const data = await res.json();
			console.log('[Admin] User details loaded:', {
				has_profile: data.has_profile,
				has_user_journey: !!data.user_journey,
				has_airtable: !!data.airtable,
				airtable_brands: data.airtable?.brand_profiles?.length || 0,
				airtable_content: data.airtable?.content_count || 0,
			});
			setSelectedUser(data);
			setSelectedUserId(userId);
		} catch (error: any) {
			console.error('Error loading user details:', error);
			alert(error.message || 'Failed to load user details');
		}
	}

	async function createUser() {
		if (!createUserEmail.trim()) {
			alert('Please enter an email address');
			return;
		}

		// Prevent duplicate submissions
		if (creatingUser) {
			return;
		}

		setCreatingUser(true);
		try {
			const res = await fetch('/api/admin/users/create', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					email: createUserEmail.trim(),
					plan: createUserPlan,
					cycle: createUserCycle,
					trialDays: createUserTrialDays,
				}),
			});

			const data = await res.json();

			if (!res.ok) {
				// Handle rate limit errors specifically
				if (res.status === 429 || data.rateLimited) {
					const message = data.message || 'Email rate limit exceeded. The user was created successfully, but the password reset email could not be sent. Please wait a few minutes before creating more users.';
					alert(message);
					// Still close the form and refresh since user was created
					setShowCreateUser(false);
					setCreateUserEmail('');
					setCreateUserTrialDays(7);
					loadUsers();
					return;
				}
				throw new Error(data.error || data.message || 'Failed to create user');
			}

			alert(data.message || 'User created successfully!');
			setShowCreateUser(false);
			setCreateUserEmail('');
			setCreateUserTrialDays(7);
			loadUsers(); // Refresh user list
		} catch (error: any) {
			console.error('Error creating user:', error);
			alert(error.message || 'Failed to create user');
		} finally {
			setCreatingUser(false);
		}
	}

	async function setPlan(userId: string) {
		try {
			const res = await fetch(`/api/admin/users/${userId}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ plan: selectedPlan, cycle: selectedCycle }),
			});
			if (!res.ok) throw new Error('Failed to set plan');
			alert('Plan updated successfully');
			loadUserDetails(userId);
			loadUsers();
		} catch (error) {
			console.error('Error setting plan:', error);
			alert('Failed to set plan');
		}
	}

	async function refreshStripe(userId: string, stripeCustomerId?: string) {
		setRefreshLoading(true);
		try {
			// Try the new sync-user endpoint first (more robust)
			let res = await fetch('/api/admin/stripe/sync-user', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ targetUserId: userId }),
			});
			
			// If sync-user fails, fall back to refresh endpoint
			if (!res.ok) {
				const errorData = await res.json();
				console.warn('Sync-user failed, trying refresh endpoint:', errorData);
				
				res = await fetch('/api/admin/stripe/refresh', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ userId, stripeCustomerId }),
				});
			}
			
			if (!res.ok) {
				const error = await res.json();
				throw new Error(error.error || 'Failed to sync Stripe subscription');
			}
			
			const data = await res.json();
			alert('Stripe subscription synced successfully');
			
			// Update UI immediately with the returned data
			if (data.subscription && selectedUser) {
				setSelectedUser({
					...selectedUser,
					subscription: data.subscription,
					entitlements: data.entitlements || selectedUser.entitlements,
				});
			}
			
			// Reload full user details after a delay to ensure DB write is committed
			// But preserve subscription data if the reload doesn't have it
			setTimeout(async () => {
				try {
					const detailsRes = await fetch(`/api/admin/users/${userId}`);
					if (detailsRes.ok) {
						const detailsData = await detailsRes.json();
						// Always preserve subscription if we have it from refresh, even if reload doesn't return it
						setSelectedUser({
							...detailsData,
							subscription: detailsData.subscription || data.subscription || selectedUser?.subscription,
							entitlements: detailsData.entitlements || data.entitlements || selectedUser?.entitlements,
						});
					}
				} catch (err) {
					console.error('Error reloading user details:', err);
					// If reload fails, keep the subscription data we got from refresh
					if (data.subscription && selectedUser) {
						setSelectedUser({
							...selectedUser,
							subscription: data.subscription,
							entitlements: data.entitlements || selectedUser.entitlements,
						});
					}
				}
			}, 1500);
		} catch (error: any) {
			console.error('Error refreshing Stripe:', error);
			alert(error.message || 'Failed to refresh Stripe. Check console for details.');
		} finally {
			setRefreshLoading(false);
		}
	}

	if (loading || !isAdmin) {
		return (
			<div className="mx-auto max-w-6xl p-6 space-y-6">
				<div className="flex items-center justify-between">
					<Skeleton height="32px" width="200px" />
					<Skeleton height="20px" width="80px" />
				</div>
				<div className="card p-6 space-y-4">
					<Skeleton height="24px" width="150px" />
					<div className="space-y-3">
						{Array.from({ length: 5 }).map((_, i) => (
							<div key={i} className="border border-edge/60 rounded-xl2 p-4 space-y-2">
								<Skeleton height="20px" width="200px" />
								<Skeleton height="16px" width="150px" />
								<Skeleton height="16px" width="100px" />
							</div>
						))}
					</div>
				</div>
			</div>
		);
	}

	return (
		<div className="mx-auto max-w-6xl p-6 space-y-6">
			<div className="flex items-center justify-between">
				<h1 className="text-3xl font-semibold">Admin Dashboard</h1>
				<div className="flex items-center gap-3">
					<LoadingButton
						onClick={() => setShowCreateUser(!showCreateUser)}
						variant="primary"
						size="sm"
					>
						{showCreateUser ? 'Cancel' : '+ Create User'}
					</LoadingButton>
					<button
						onClick={() => window.history.back()}
						className="text-text-soft hover:text-text text-sm"
					>
						← Back
					</button>
				</div>
			</div>

			{/* Create User Form */}
			{showCreateUser && (
				<div className="card p-6 space-y-4">
					<h2 className="text-xl font-medium">Create New User</h2>
					<div className="bg-surface/50 border border-edge/60 rounded-xl2 p-3 text-sm text-text-soft">
						<strong className="text-text">Note:</strong> Supabase has a rate limit of 2 emails per hour. 
						If you need to create multiple users, consider spacing them out or using custom SMTP for higher limits.
					</div>
					<div className="grid gap-4 md:grid-cols-2">
						<div>
							<label className="block text-sm font-medium mb-2">Email Address *</label>
							<input
								type="email"
								value={createUserEmail}
								onChange={(e) => setCreateUserEmail(e.target.value)}
								placeholder="user@example.com"
								className="w-full rounded-xl2 border border-edge/60 bg-bg/80 px-4 py-2 text-text focus:border-primary/60 focus:outline-none"
							/>
						</div>
						<div>
							<label className="block text-sm font-medium mb-2">Free Access Period (Days)</label>
							<input
								type="number"
								value={createUserTrialDays}
								onChange={(e) => setCreateUserTrialDays(Math.max(0, Math.min(365, parseInt(e.target.value) || 0)))}
								min="0"
								max="365"
								className="w-full rounded-xl2 border border-edge/60 bg-bg/80 px-4 py-2 text-text focus:border-primary/60 focus:outline-none"
							/>
							<p className="text-xs text-text-dim mt-1">
								Set to 0 for no trial period (immediate paid access)
							</p>
						</div>
						<div>
							<label className="block text-sm font-medium mb-2">Plan Tier *</label>
							<select
								value={createUserPlan}
								onChange={(e) => setCreateUserPlan(e.target.value as PlanId)}
								className="w-full rounded-xl2 border border-edge/60 bg-bg/80 px-4 py-2 text-text focus:border-primary/60 focus:outline-none"
							>
								{PRICING.order.map((planId) => (
									<option key={planId} value={planId}>
										{PRICING.monthly[planId].name}
									</option>
								))}
							</select>
						</div>
						<div>
							<label className="block text-sm font-medium mb-2">Billing Cycle *</label>
							<select
								value={createUserCycle}
								onChange={(e) => setCreateUserCycle(e.target.value as 'monthly' | 'annual')}
								className="w-full rounded-xl2 border border-edge/60 bg-bg/80 px-4 py-2 text-text focus:border-primary/60 focus:outline-none"
							>
								<option value="monthly">Monthly</option>
								<option value="annual">Annual</option>
							</select>
						</div>
					</div>
					<div className="flex gap-3 pt-2">
						<LoadingButton
							onClick={createUser}
							loading={creatingUser}
							loadingText="Creating..."
						>
							Create User
						</LoadingButton>
						<LoadingButton
							onClick={() => {
								setShowCreateUser(false);
								setCreateUserEmail('');
								setCreateUserTrialDays(7);
							}}
							variant="secondary"
							disabled={creatingUser}
						>
							Cancel
						</LoadingButton>
					</div>
				</div>
			)}

			{/* User Search */}
			<div className="card p-6 space-y-4">
				<h2 className="text-xl font-medium">Search Users</h2>
				<div className="flex gap-2">
					<input
						type="text"
						value={searchQuery}
						onChange={(e) => setSearchQuery(e.target.value)}
						onKeyDown={(e) => e.key === 'Enter' && loadUsers()}
						placeholder="Search by email or name..."
						className="flex-1 rounded-xl2 border border-edge/60 bg-bg/80 px-4 py-2 text-text focus:border-primary/60 focus:outline-none"
					/>
					<button
						onClick={() => loadUsers()}
						disabled={loading}
						className="px-4 py-2 rounded-xl2 border border-primary/40 bg-primary/10 hover:bg-primary/20 disabled:opacity-50"
					>
						{loading ? 'Loading...' : 'Search'}
					</button>
				</div>
				<div className="flex items-center gap-2">
					<input
						type="checkbox"
						id="include-auth-only"
						checked={includeAuthOnly}
						onChange={(e) => {
							const next = e.target.checked;
							setIncludeAuthOnly(next);
							loadUsers(next);
						}}
						className="rounded border-edge/60"
					/>
					<label htmlFor="include-auth-only" className="text-sm text-text-soft cursor-pointer">
						Include users without profiles (auth-only users)
					</label>
				</div>

				{/* User List */}
				<div className="space-y-2 max-h-96 overflow-y-auto">
					{users.length === 0 ? (
						<div className="text-center py-8 text-text-dim">
							<p className="text-sm">No users found</p>
							{includeAuthOnly && (
								<p className="text-xs mt-1">Try searching for specific emails or check if users exist in Supabase</p>
							)}
						</div>
					) : (
						users.map((user) => (
							<div
								key={user.id}
								className={`flex items-center justify-between p-3 rounded-lg border ${
									user.has_profile === false 
										? 'border-warning/50 bg-warning/5' 
										: 'border-edge/60'
								} hover:bg-surface/50 cursor-pointer`}
								onClick={() => loadUserDetails(user.id)}
							>
								<div className="flex-1 min-w-0">
									<div className="flex items-center gap-2 flex-wrap mb-1">
										<span className="font-medium truncate">{user.email}</span>
										{user.has_profile === false && (
											<span className="text-xs px-2 py-0.5 rounded-full bg-warning/15 border border-warning/30 text-warning whitespace-nowrap">
												No Profile
											</span>
										)}
										{user.is_admin && (
											<span className="text-xs px-2 py-0.5 rounded-full bg-accent/15 border border-accent/30 whitespace-nowrap">
												Admin
											</span>
										)}
										{user.subscription && (
											<span className="text-xs px-2 py-0.5 rounded-full bg-primary/15 border border-primary/30 text-primary whitespace-nowrap">
												{user.subscription.plan?.toUpperCase() || 'N/A'} {user.subscription.cycle ? `(${user.subscription.cycle})` : ''}
											</span>
										)}
										{!user.subscription && user.has_profile !== false && (
											<span className="text-xs px-2 py-0.5 rounded-full bg-surface/50 border border-edge/30 text-text-dim whitespace-nowrap">
												No Subscription
											</span>
										)}
									</div>
									{user.full_name && <div className="text-sm text-text-dim mb-1">{user.full_name}</div>}
									<div className="flex items-center gap-3 text-xs text-text-dim flex-wrap">
										{user.has_profile === false ? (
											<>
												<span>Auth only</span>
												<span>•</span>
												<span>{user.email_confirmed ? 'Email confirmed' : 'Email not confirmed'}</span>
												{user.last_sign_in && (
													<>
														<span>•</span>
														<span>Last sign in: {new Date(user.last_sign_in).toLocaleDateString()}</span>
													</>
												)}
											</>
										) : (
											<>
												{user.subscription ? (
													<>
														<span>Plan: {user.subscription.plan || 'N/A'}</span>
														{user.subscription.status && (
															<>
																<span>•</span>
																<span>Status: {user.subscription.status}</span>
															</>
														)}
													</>
												) : (
													<span className="text-warning">⚠️ No subscription - may have dropped at Stripe</span>
												)}
												{user.last_sign_in && (
													<>
														<span>•</span>
														<span>Last active: {new Date(user.last_sign_in).toLocaleDateString()}</span>
													</>
												)}
											</>
										)}
									</div>
								</div>
								<span className="text-text-soft text-sm ml-2 flex-shrink-0">→</span>
							</div>
						))
					)}
				</div>
			</div>

			{/* User Details */}
			{selectedUser && (
				<div className="card p-6 space-y-6">
					<div className="flex items-center justify-between">
						<h2 className="text-xl font-medium">User Details</h2>
						<div className="flex items-center gap-2">
							{selectedUser.profile && (
								<a
									href={`/api/admin/users/${selectedUser.profile.id}/questionnaire`}
									download
									className="px-4 py-2 rounded-xl2 border border-accent/40 bg-accent/10 hover:bg-accent/20 text-sm flex items-center gap-2"
								>
									<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
										<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
									</svg>
									Download Questionnaire
								</a>
							)}
						</div>
					</div>

					{/* User Journey Status */}
					{selectedUser.user_journey && (
						<div className="p-4 rounded-xl2 border border-edge/60 bg-surface/30">
							<h3 className="font-medium mb-3">User Journey Status</h3>
							<div className="grid grid-cols-2 md:grid-cols-4 gap-3">
								<div className={`p-2 rounded-lg ${selectedUser.user_journey.has_auth ? 'bg-accent/10 border border-accent/30' : 'bg-surface/50 border border-edge/30'}`}>
									<div className="text-xs text-text-dim">Auth Account</div>
									<div className={`text-sm font-medium ${selectedUser.user_journey.has_auth ? 'text-accent' : 'text-text-dim'}`}>
										{selectedUser.user_journey.has_auth ? '✓ Created' : '✗ Missing'}
									</div>
								</div>
								<div className={`p-2 rounded-lg ${selectedUser.user_journey.has_profile ? 'bg-accent/10 border border-accent/30' : 'bg-surface/50 border border-edge/30'}`}>
									<div className="text-xs text-text-dim">Profile</div>
									<div className={`text-sm font-medium ${selectedUser.user_journey.has_profile ? 'text-accent' : 'text-text-dim'}`}>
										{selectedUser.user_journey.has_profile ? '✓ Created' : '✗ Missing'}
									</div>
								</div>
								<div className={`p-2 rounded-lg ${selectedUser.user_journey.has_subscription ? 'bg-accent/10 border border-accent/30' : 'bg-surface/50 border border-edge/30'}`}>
									<div className="text-xs text-text-dim">Subscription</div>
									<div className={`text-sm font-medium ${selectedUser.user_journey.has_subscription ? 'text-accent' : 'text-text-dim'}`}>
										{selectedUser.user_journey.has_subscription ? '✓ Active' : '✗ None'}
									</div>
								</div>
								<div className={`p-2 rounded-lg ${selectedUser.user_journey.has_brand ? 'bg-accent/10 border border-accent/30' : 'bg-surface/50 border border-edge/30'}`}>
									<div className="text-xs text-text-dim">Onboarding</div>
									<div className={`text-sm font-medium ${selectedUser.user_journey.has_brand ? 'text-accent' : 'text-text-dim'}`}>
										{selectedUser.user_journey.has_brand ? '✓ Complete' : '✗ Not Started'}
									</div>
								</div>
								<div className={`p-2 rounded-lg ${selectedUser.user_journey.has_connections ? 'bg-accent/10 border border-accent/30' : 'bg-surface/50 border border-edge/30'}`}>
									<div className="text-xs text-text-dim">Social Connections</div>
									<div className={`text-sm font-medium ${selectedUser.user_journey.has_connections ? 'text-accent' : 'text-text-dim'}`}>
										{selectedUser.user_journey.has_connections ? '✓ Connected' : '✗ None'}
									</div>
								</div>
								<div className={`p-2 rounded-lg ${selectedUser.user_journey.has_content ? 'bg-accent/10 border border-accent/30' : 'bg-surface/50 border border-edge/30'}`}>
									<div className="text-xs text-text-dim">Content Created</div>
									<div className={`text-sm font-medium ${selectedUser.user_journey.has_content ? 'text-accent' : 'text-text-dim'}`}>
										{selectedUser.user_journey.has_content ? '✓ Yes' : '✗ None'}
									</div>
								</div>
								<div className={`p-2 rounded-lg ${selectedUser.user_journey.email_confirmed ? 'bg-accent/10 border border-accent/30' : 'bg-warning/10 border border-warning/30'}`}>
									<div className="text-xs text-text-dim">Email Confirmed</div>
									<div className={`text-sm font-medium ${selectedUser.user_journey.email_confirmed ? 'text-accent' : 'text-warning'}`}>
										{selectedUser.user_journey.email_confirmed ? '✓ Confirmed' : '✗ Pending'}
									</div>
								</div>
								<div className="p-2 rounded-lg bg-surface/50 border border-edge/30">
									<div className="text-xs text-text-dim">Last Sign In</div>
									<div className="text-sm font-medium text-text-soft">
										{selectedUser.user_journey.last_sign_in 
											? new Date(selectedUser.user_journey.last_sign_in).toLocaleDateString()
											: 'Never'}
									</div>
								</div>
							</div>
						</div>
					)}

					{/* Profile Info */}
					<div>
						<h3 className="font-medium mb-2">Profile</h3>
						<div className="space-y-1 text-sm">
							<div>Email: {selectedUser.profile?.email || selectedUser.diagnostic?.email || 'N/A'}</div>
							<div>Name: {selectedUser.profile?.full_name || 'N/A'}</div>
							<div>User ID: {selectedUser.profile?.id || 'N/A'}</div>
							{selectedUser.has_profile === false && (
								<div className="text-warning text-xs mt-2">
									⚠️ User exists in auth.users but has no profile record
								</div>
							)}
						</div>
					</div>

					{/* Subscription & Plan */}
					<div>
						<h3 className="font-medium mb-2">Subscription & Plan</h3>
						{selectedUser.subscription ? (
							<div className="space-y-1 text-sm">
								<div className="flex items-center gap-2">
									<span>Plan:</span>
									<span className="font-medium capitalize">{selectedUser.subscription.plan || 'N/A'}</span>
									<span className="text-text-dim">({selectedUser.subscription.cycle || 'N/A'})</span>
								</div>
								{selectedUser.subscription.stripe_customer_id && (
									<div>Stripe Customer: {selectedUser.subscription.stripe_customer_id}</div>
								)}
								{selectedUser.subscription.stripe_subscription_id && (
									<div>Stripe Subscription: {selectedUser.subscription.stripe_subscription_id}</div>
								)}
								{selectedUser.subscription.current_period_end && (
									<div>Period Ends: {new Date(selectedUser.subscription.current_period_end).toLocaleDateString()}</div>
								)}
							</div>
						) : (
							<div className="space-y-3">
								<div className="text-text-dim text-sm">No subscription - User may have dropped out at Stripe checkout</div>
								
								{/* Offer Free Trial Section */}
								{(!selectedUser.subscription && (selectedUser.has_profile === false || !selectedUser.profile)) && (
									<div className="p-4 rounded-xl2 border border-accent/40 bg-accent/5">
										<h4 className="font-medium mb-3 text-sm">Offer Free Trial</h4>
										<div className="space-y-3">
											<div className="flex gap-2">
												<select
													value={trialPlan}
													onChange={(e) => setTrialPlan(e.target.value as PlanId)}
													className="flex-1 rounded-xl2 border border-edge/60 bg-bg/80 px-3 py-2 text-sm text-text focus:border-primary/60 focus:outline-none"
												>
													{PRICING.order.map((planId) => (
														<option key={planId} value={planId}>
															{PRICING.monthly[planId].name}
														</option>
													))}
												</select>
												<select
													value={trialCycle}
													onChange={(e) => setTrialCycle(e.target.value as 'monthly' | 'annual')}
													className="rounded-xl2 border border-edge/60 bg-bg/80 px-3 py-2 text-sm text-text focus:border-primary/60 focus:outline-none"
												>
													<option value="monthly">Monthly</option>
													<option value="annual">Annual</option>
												</select>
											</div>
											<div className="flex items-center gap-2">
												<label className="text-sm text-text-dim">Trial Days:</label>
												<input
													type="number"
													min="1"
													max="365"
													value={trialDays}
													onChange={(e) => setTrialDays(parseInt(e.target.value) || 30)}
													className="w-20 rounded-xl2 border border-edge/60 bg-bg/80 px-3 py-1.5 text-sm text-text focus:border-primary/60 focus:outline-none"
												/>
											</div>
											<button
												onClick={() => {
													if (selectedUserId) {
														offerTrial(selectedUserId);
													} else {
														alert('Cannot offer trial: User ID not found. Please click on the user again to refresh details.');
													}
												}}
												disabled={offeringTrial}
												className="w-full px-4 py-2 rounded-xl2 border border-accent/40 bg-accent/10 hover:bg-accent/20 text-sm disabled:opacity-50"
											>
												{offeringTrial ? 'Offering Trial...' : `Offer ${trialDays}-Day Free Trial`}
											</button>
										</div>
									</div>
								)}
							</div>
						)}
						{(selectedUser.profile || selectedUser.diagnostic) && selectedUser.subscription && (
							<button
								onClick={() => {
									const userId = selectedUser.profile?.id || selectedUser.diagnostic?.user_id;
									if (userId) {
										refreshStripe(userId, selectedUser.subscription?.stripe_customer_id);
									}
								}}
								disabled={refreshLoading}
								className="mt-2 px-3 py-1.5 rounded-lg border border-primary/40 bg-primary/10 hover:bg-primary/20 text-sm disabled:opacity-50"
							>
								{refreshLoading ? 'Refreshing...' : 'Refresh Stripe Data'}
							</button>
						)}
					</div>

					{/* Airtable Data */}
					{selectedUser.airtable && (
						<div>
							<h3 className="font-medium mb-2">Airtable Data</h3>
							<div className="space-y-3">
								{/* Brand Profiles / Onboarding */}
								<div>
									<div className="text-sm font-medium mb-1">Brand Profiles (Onboarding)</div>
									{selectedUser.airtable.brand_profiles && selectedUser.airtable.brand_profiles.length > 0 ? (
										<div className="space-y-2">
											{selectedUser.airtable.brand_profiles.map((brand: any, idx: number) => (
												<div key={idx} className="p-2 rounded-lg border border-edge/60 bg-surface/30 text-sm">
													<div className="font-medium">{brand.client_name}</div>
													<div className="text-text-dim text-xs">
														Type: {brand.brand_type} • Status: {brand.status}
													</div>
												</div>
											))}
										</div>
									) : (
										<div className="text-text-dim text-sm">No brand profiles - Onboarding not completed</div>
									)}
								</div>

								{/* Content Stats */}
								<div>
									<div className="text-sm font-medium mb-1">Content Statistics</div>
									<div className="grid grid-cols-2 gap-2 text-sm">
										<div className="p-2 rounded-lg border border-edge/60 bg-surface/30">
											<div className="text-text-dim text-xs">Total Content</div>
											<div className="font-medium">{selectedUser.airtable.content_count || 0}</div>
										</div>
										<div className="p-2 rounded-lg border border-edge/60 bg-surface/30">
											<div className="text-text-dim text-xs">Pending Approval</div>
											<div className="font-medium">{selectedUser.airtable.pending_content_count || 0}</div>
										</div>
									</div>
								</div>

								{/* Content Briefs */}
								<div>
									<div className="text-sm font-medium mb-1">Content Briefs</div>
									{selectedUser.airtable.content_briefs && selectedUser.airtable.content_briefs.length > 0 ? (
										<div className="space-y-2">
											{selectedUser.airtable.content_briefs.map((brief: any) => (
												<div key={brief.id} className="p-2 rounded-lg border border-edge/60 bg-surface/30 text-sm">
													<div className="flex items-center justify-between">
														<span className="font-medium">{brief.cycle_label || 'Brief'}</span>
														<span className={`text-xs px-2 py-0.5 rounded-full ${
															brief.status === 'Generation Completed' ? 'bg-accent/15 text-accent' :
															brief.status === 'Pending Approval' ? 'bg-primary/15 text-primary' :
															brief.status === 'Failed' ? 'bg-danger/15 text-danger' :
															'bg-surface/50 text-text-dim'
														}`}>
															{brief.status}
														</span>
													</div>
													{brief.submitted_at && (
														<div className="text-xs text-text-dim mt-1">
															Submitted: {new Date(brief.submitted_at).toLocaleDateString()}
														</div>
													)}
												</div>
											))}
										</div>
									) : (
										<div className="text-text-dim text-sm">No content briefs submitted</div>
									)}
								</div>
							</div>
						</div>
					)}

					{/* Social Connections */}
					{selectedUser.social_connections && selectedUser.social_connections.length > 0 && (
						<div>
							<h3 className="font-medium mb-2">Social Connections</h3>
							<div className="space-y-2">
								{selectedUser.social_connections.map((conn: any) => (
									<div key={conn.id} className="p-2 rounded-lg border border-edge/60 bg-surface/30 text-sm">
										<div className="font-medium capitalize">{conn.provider}</div>
										<div className="text-text-dim text-xs">
											Type: {conn.connection_type} • Account: {conn.account_name || 'N/A'}
										</div>
									</div>
								))}
							</div>
						</div>
					)}

					{/* Usage Stats */}
					{selectedUser.usage && selectedUser.usage.length > 0 && (
						<div>
							<h3 className="font-medium mb-2">Usage Statistics</h3>
							<div className="space-y-2">
								{selectedUser.usage.slice(0, 6).map((usage: any) => (
									<div key={usage.id} className="p-2 rounded-lg border border-edge/60 bg-surface/30 text-sm">
										<div className="flex items-center justify-between">
											<span>{usage.year_month}</span>
											<span className="font-medium">{usage.posts || 0} posts</span>
										</div>
									</div>
								))}
							</div>
						</div>
					)}

					{/* Entitlements */}
					<div>
						<h3 className="font-medium mb-2">Entitlements</h3>
						{selectedUser.entitlements ? (
							<div className="space-y-1 text-sm">
								<div>Max Brands: {selectedUser.entitlements.max_brands}</div>
								<div>Max Channels: {selectedUser.entitlements.max_channels}</div>
								<div>Posts/Month: {selectedUser.entitlements.posts_per_month === 999999 ? 'Unlimited' : selectedUser.entitlements.posts_per_month}</div>
								<div>Image Gen: {selectedUser.entitlements.image_gen ? 'Yes' : 'No'}</div>
							</div>
						) : (
							<div className="text-text-dim text-sm">No entitlements</div>
						)}
					</div>

					{/* Set Plan */}
					{selectedUser.profile && (
						<div className="border-t border-edge/60 pt-4">
							<h3 className="font-medium mb-3">Set Plan</h3>
							<div className="flex gap-4 mb-4">
								<select
									value={selectedPlan}
									onChange={(e) => setSelectedPlan(e.target.value as PlanId)}
									className="rounded-xl2 border border-edge/60 bg-bg/80 px-3 py-2 text-text focus:border-primary/60 focus:outline-none"
								>
									{PRICING.order.map((planId) => (
										<option key={planId} value={planId}>
											{PRICING.monthly[planId].name}
										</option>
									))}
								</select>
								<select
									value={selectedCycle}
									onChange={(e) => setSelectedCycle(e.target.value as 'monthly' | 'annual')}
									className="rounded-xl2 border border-edge/60 bg-bg/80 px-3 py-2 text-text focus:border-primary/60 focus:outline-none"
								>
									<option value="monthly">Monthly</option>
									<option value="annual">Annual</option>
								</select>
								<button
									onClick={() => {
										if (selectedUser.profile?.id) {
											setPlan(selectedUser.profile.id);
										} else {
											alert('Cannot set plan: User has no profile. Please create profile first.');
										}
									}}
									className="px-4 py-2 rounded-xl2 border border-primary/40 bg-primary/10 hover:bg-primary/20"
								>
									Set Plan
								</button>
							</div>
						</div>
					)}
				</div>
			)}
		</div>
	);
}
