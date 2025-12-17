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
};

type UserDetails = {
	profile: any;
	subscription: any;
	entitlements: any;
};

export default function AdminPage() {
	const supabase = useSupabase();
	const [loading, setLoading] = useState(true);
	const [isAdmin, setIsAdmin] = useState(false);
	const [users, setUsers] = useState<User[]>([]);
	const [searchQuery, setSearchQuery] = useState('');
	const [selectedUser, setSelectedUser] = useState<UserDetails | null>(null);
	const [selectedPlan, setSelectedPlan] = useState<PlanId>('creator');
	const [selectedCycle, setSelectedCycle] = useState<'monthly' | 'annual'>('monthly');
	const [refreshLoading, setRefreshLoading] = useState(false);
	const [showCreateUser, setShowCreateUser] = useState(false);
	const [createUserEmail, setCreateUserEmail] = useState('');
	const [createUserPlan, setCreateUserPlan] = useState<PlanId>('creator');
	const [createUserCycle, setCreateUserCycle] = useState<'monthly' | 'annual'>('monthly');
	const [createUserTrialDays, setCreateUserTrialDays] = useState(7);
	const [creatingUser, setCreatingUser] = useState(false);

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

	async function loadUsers() {
		setLoading(true);
		try {
			const url = `/api/admin/users?q=${encodeURIComponent(searchQuery)}${includeAuthOnly ? '&include_auth_only=true' : ''}`;
			const res = await fetch(url);
			if (!res.ok) throw new Error('Failed to load users');
			const data = await res.json();
			setUsers(data.users || []);
			
			// Show info about users without profiles if included
			if (includeAuthOnly && data.users_without_profiles > 0) {
				console.log(`Found ${data.users_without_profiles} users without profiles`);
			}
		} catch (error) {
			console.error('Error loading users:', error);
		} finally {
			setLoading(false);
		}
	}

	async function loadUserDetails(userId: string) {
		try {
			const res = await fetch(`/api/admin/users/${userId}`);
			if (!res.ok) throw new Error('Failed to load user details');
			const data = await res.json();
			setSelectedUser(data);
		} catch (error) {
			console.error('Error loading user details:', error);
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
						onClick={loadUsers}
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
							setIncludeAuthOnly(e.target.checked);
							loadUsers();
						}}
						className="rounded border-edge/60"
					/>
					<label htmlFor="include-auth-only" className="text-sm text-text-soft cursor-pointer">
						Include users without profiles (auth-only users)
					</label>
				</div>

				{/* User List */}
				<div className="space-y-2 max-h-96 overflow-y-auto">
					{users.map((user) => (
						<div
							key={user.id}
							className={`flex items-center justify-between p-3 rounded-lg border ${
								user.has_profile === false 
									? 'border-warning/50 bg-warning/5' 
									: 'border-edge/60'
							} hover:bg-surface/50 cursor-pointer`}
							onClick={() => loadUserDetails(user.id)}
						>
							<div className="flex-1">
								<div className="flex items-center gap-2">
									<span className="font-medium">{user.email}</span>
									{user.has_profile === false && (
										<span className="text-xs px-2 py-0.5 rounded-full bg-warning/15 border border-warning/30 text-warning">
											No Profile
										</span>
									)}
									{user.is_admin && (
										<span className="text-xs px-2 py-0.5 rounded-full bg-accent/15 border border-accent/30">
											Admin
										</span>
									)}
								</div>
								{user.full_name && <div className="text-sm text-text-dim">{user.full_name}</div>}
								{user.has_profile === false && (
									<div className="text-xs text-text-dim mt-1">
										Auth user only • {user.email_confirmed ? 'Email confirmed' : 'Email not confirmed'} 
										{user.last_sign_in && ` • Last sign in: ${new Date(user.last_sign_in).toLocaleDateString()}`}
									</div>
								)}
							</div>
							<span className="text-text-soft text-sm">→</span>
						</div>
					))}
				</div>
			</div>

			{/* User Details */}
			{selectedUser && (
				<div className="card p-6 space-y-6">
					<div className="flex items-center justify-between">
						<h2 className="text-xl font-medium">User Details</h2>
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
					</div>

					{/* Profile Info */}
					<div>
						<h3 className="font-medium mb-2">Profile</h3>
						<div className="space-y-1 text-sm">
							<div>Email: {selectedUser.profile?.email}</div>
							<div>Name: {selectedUser.profile?.full_name || 'N/A'}</div>
							<div>User ID: {selectedUser.profile?.id}</div>
						</div>
					</div>

					{/* Subscription */}
					<div>
						<h3 className="font-medium mb-2">Subscription</h3>
						{selectedUser.subscription ? (
							<div className="space-y-1 text-sm">
								<div>Plan: {selectedUser.subscription.plan}</div>
								<div>Cycle: {selectedUser.subscription.cycle || 'N/A'}</div>
								<div>Status: {selectedUser.subscription.status}</div>
								{selectedUser.subscription.stripe_customer_id && (
									<div>Stripe Customer: {selectedUser.subscription.stripe_customer_id}</div>
								)}
							</div>
						) : (
							<div className="text-text-dim text-sm">No subscription</div>
						)}
						<button
							onClick={() => refreshStripe(selectedUser.profile.id, selectedUser.subscription?.stripe_customer_id)}
							disabled={refreshLoading}
							className="mt-2 px-3 py-1.5 rounded-lg border border-primary/40 bg-primary/10 hover:bg-primary/20 text-sm disabled:opacity-50"
						>
							{refreshLoading ? 'Refreshing...' : 'Refresh Stripe Data'}
						</button>
					</div>

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
								onClick={() => setPlan(selectedUser.profile.id)}
								className="px-4 py-2 rounded-xl2 border border-primary/40 bg-primary/10 hover:bg-primary/20"
							>
								Set Plan
							</button>
						</div>
					</div>
				</div>
			)}
		</div>
	);
}
