'use client';

import { useState, useEffect } from 'react';
import { useSupabase } from '@/components/SupabaseProvider';
import { PRICING, type PlanId } from '@/config/pricing';
import Link from 'next/link';

type User = {
	id: string;
	email: string;
	full_name: string | null;
	is_admin: boolean;
	created_at: string;
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

	async function loadUsers() {
		setLoading(true);
		try {
			const res = await fetch(`/api/admin/users?q=${encodeURIComponent(searchQuery)}`);
			if (!res.ok) throw new Error('Failed to load users');
			const data = await res.json();
			setUsers(data.users || []);
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
			const res = await fetch('/api/admin/stripe/refresh', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ userId, stripeCustomerId }),
			});
			if (!res.ok) {
				const error = await res.json();
				throw new Error(error.error || 'Failed to refresh Stripe');
			}
			alert('Stripe data refreshed successfully');
			loadUserDetails(userId);
		} catch (error: any) {
			console.error('Error refreshing Stripe:', error);
			alert(error.message || 'Failed to refresh Stripe');
		} finally {
			setRefreshLoading(false);
		}
	}

	if (!isAdmin) {
		return (
			<div className="mx-auto max-w-2xl p-6">
				<div className="card p-8 text-center">
					<div className="text-text-soft">Loading...</div>
				</div>
			</div>
		);
	}

	return (
		<div className="mx-auto max-w-6xl p-6 space-y-6">
			<div className="flex items-center justify-between">
				<h1 className="text-3xl font-semibold">Admin Dashboard</h1>
				<Link href="/dashboard" className="text-text-soft hover:text-text text-sm">
					← Back to Dashboard
				</Link>
			</div>

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

				{/* User List */}
				<div className="space-y-2 max-h-96 overflow-y-auto">
					{users.map((user) => (
						<div
							key={user.id}
							className="flex items-center justify-between p-3 rounded-lg border border-edge/60 hover:bg-surface/50 cursor-pointer"
							onClick={() => loadUserDetails(user.id)}
						>
							<div>
								<div className="font-medium">{user.email}</div>
								{user.full_name && <div className="text-sm text-text-dim">{user.full_name}</div>}
								{user.is_admin && (
									<span className="text-xs px-2 py-0.5 rounded-full bg-accent/15 border border-accent/30 mt-1 inline-block">
										Admin
									</span>
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
					<h2 className="text-xl font-medium">User Details</h2>

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
