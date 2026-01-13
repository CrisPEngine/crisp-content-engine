'use client';

/**
 * Content Briefs Section Component
 * 
 * Displays pending content briefs for approval
 * Shows status and appropriate CTAs based on brief status
 */

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSupabase } from '@/components/SupabaseProvider';
import { ClipboardList, Check, Loader2, AlertCircle, Calendar, ArrowRight, RotateCw, FileText } from 'lucide-react';

type ContentBrief = {
	id: string;
	brand_profile_id: string | null;
	brief_mode: string;
	cycle_start_date: string;
	cycle_label: string;
	objective: string;
	themes_focus: string;
	status: string;
	submitted_at: string | null;
	approved_at: string | null;
	sent_to_make_at: string | null;
	generation_completed_at: string | null;
	last_error: string | null;
	result_payload_display?: string | null;
};

type ContentBriefsSectionProps = {
	brandProfileId: string;
};

export function ContentBriefsSection({ brandProfileId }: ContentBriefsSectionProps) {
	const router = useRouter();
	const supabase = useSupabase();
	const [briefs, setBriefs] = useState<ContentBrief[]>([]);
	const [loading, setLoading] = useState(true);
	const [approving, setApproving] = useState<string | null>(null);
	const [retrying, setRetrying] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		if (!supabase || !brandProfileId) return;
		loadBriefs();
	}, [supabase, brandProfileId]);

	async function loadBriefs() {
		if (!supabase) return;
		setLoading(true);
		setError(null);
		try {
			const res = await fetch(`/api/content-briefs?brand_profile_id=${brandProfileId}`, {
				cache: 'no-store',
			});
			if (!res.ok) {
				throw new Error('Failed to load content briefs');
			}
			const data = await res.json();
			setBriefs(data.briefs || []);
		} catch (err: any) {
			console.error('Failed to load content briefs:', err);
			setError(err.message || 'Failed to load content briefs');
		} finally {
			setLoading(false);
		}
	}

	async function approveBrief(briefId: string) {
		if (!supabase) return;
		setApproving(briefId);
		setError(null);
		try {
			const res = await fetch(`/api/content-brief/${briefId}/approve`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				credentials: 'include',
			});

			if (!res.ok) {
				const data = await res.json().catch(() => ({}));
				throw new Error(data?.error || 'Failed to approve brief');
			}

			// Reload briefs to show updated status
			await loadBriefs();
		} catch (err: any) {
			console.error('Failed to approve brief:', err);
			setError(err.message || 'Failed to approve brief');
			setApproving(null);
		}
	}

	async function retryBrief(briefId: string) {
		if (!supabase) return;
		setRetrying(briefId);
		setError(null);
		try {
			const res = await fetch(`/api/content-brief/${briefId}/retry`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				credentials: 'include',
			});

			if (!res.ok) {
				const data = await res.json().catch(() => ({}));
				throw new Error(data?.error || 'Failed to retry brief');
			}

			// Reload briefs to show updated status
			await loadBriefs();
		} catch (err: any) {
			console.error('Failed to retry brief:', err);
			setError(err.message || 'Failed to retry brief');
			setRetrying(null);
		}
	}

	function getStatusColor(status: string) {
		if (status === 'Approved' || status === 'Generation Completed') return 'text-accent';
		if (status === 'Pending Approval') return 'text-primary';
		if (status === 'Sent to Make') return 'text-primary/70';
		if (status === 'Failed') return 'text-danger';
		return 'text-text-dim';
	}

	function getStatusDotColor(status: string) {
		if (status === 'Approved' || status === 'Generation Completed') return 'bg-accent';
		if (status === 'Pending Approval') return 'bg-primary';
		if (status === 'Sent to Make') return 'bg-primary/70';
		if (status === 'Failed') return 'bg-danger';
		return 'bg-text-dim';
	}

	function formatDate(dateString: string | null) {
		if (!dateString) return null;
		try {
			const date = new Date(dateString);
			return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
		} catch {
			return dateString;
		}
	}

	const pendingBrief = briefs.find((b) => b.status === 'Pending Approval');
	const latestBrief = briefs[0]; // Briefs are sorted by submitted_at desc

	if (loading) {
		return (
			<div className="card p-6">
				<div className="flex items-center gap-2 text-text-dim">
					<Loader2 className="w-4 h-4 animate-spin" />
					<span className="text-sm">Loading content briefs...</span>
				</div>
			</div>
		);
	}

	return (
		<div className="card p-6 space-y-4">
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-2">
					<ClipboardList className="w-5 h-5 text-primary" />
					<h2 className="text-xl font-semibold">Monthly Content Briefs</h2>
				</div>
				<a
					href="/content-brief"
					className="px-4 py-2 rounded-xl2 border border-primary/40 bg-primary/10 hover:bg-primary/20 text-sm flex items-center gap-2"
				>
					Create Brief
				</a>
			</div>

			{error && (
				<div className="p-3 rounded-xl2 border border-danger/40 bg-danger/10 text-sm text-danger">
					{error}
				</div>
			)}

			{briefs.length === 0 ? (
				<div className="text-center py-8 text-text-dim">
					<p className="text-sm mb-2">No content briefs yet</p>
					<p className="text-xs">Create your first monthly content brief to get started</p>
				</div>
			) : (
				<div className="space-y-4">
					{/* Show pending brief prominently */}
					{pendingBrief && (
						<div className="p-4 rounded-xl2 border-2 border-primary/50 bg-primary/5 space-y-3">
							<div className="flex items-center justify-between">
								<div className="flex items-center gap-2">
									<div className={`w-2 h-2 rounded-full ${getStatusDotColor(pendingBrief.status)}`} />
									<span className={`text-sm font-medium ${getStatusColor(pendingBrief.status)}`}>
										Pending Approval
									</span>
									{pendingBrief.cycle_label && (
										<span className="text-xs text-text-dim">· {pendingBrief.cycle_label}</span>
									)}
								</div>
								<div className="flex items-center gap-2">
									<button
										onClick={() => router.push(`/content-brief/${pendingBrief.id}`)}
										className="px-4 py-2 rounded-xl2 border border-primary/40 bg-primary/10 hover:bg-primary/20 flex items-center gap-2 text-sm"
									>
										<FileText className="w-4 h-4" />
										Review & Edit
									</button>
									<button
										onClick={() => approveBrief(pendingBrief.id)}
										disabled={approving === pendingBrief.id}
										className="px-4 py-2 rounded-xl2 border border-accent/40 bg-accent/10 hover:bg-accent/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 text-sm"
									>
										{approving === pendingBrief.id ? (
											<>
												<Loader2 className="w-4 h-4 animate-spin" />
												Approving...
											</>
										) : (
											<>
												<Check className="w-4 h-4" />
												Approve & Generate
											</>
										)}
									</button>
								</div>
							</div>
							<button
								onClick={() => router.push(`/content-brief/${pendingBrief.id}`)}
								className="text-left w-full hover:opacity-80 transition-opacity"
							>
								{pendingBrief.objective && (
									<div className="text-sm text-text-soft">
										<strong>Objective:</strong> {pendingBrief.objective.substring(0, 100)}
										{pendingBrief.objective.length > 100 && '...'}
									</div>
								)}
								{!pendingBrief.objective && (
									<div className="text-sm text-text-dim italic">
										Click to review and edit this brief
									</div>
								)}
							</button>
						</div>
					)}

					{/* Show latest brief status if no pending */}
					{!pendingBrief && latestBrief && (
						<div className="p-4 rounded-xl2 border border-edge/60 bg-surface/30 space-y-2">
							<div className="flex items-center justify-between">
								<div className="flex items-center gap-2">
									<div className={`w-2 h-2 rounded-full ${getStatusDotColor(latestBrief.status)}`} />
									<span className={`text-sm font-medium ${getStatusColor(latestBrief.status)}`}>
										{latestBrief.status}
									</span>
									{latestBrief.cycle_label && (
										<span className="text-xs text-text-dim">· {latestBrief.cycle_label}</span>
									)}
								</div>
							</div>
							{latestBrief.status === 'Generation Completed' && (
								<a
									href={`/content/approval?brand_profile_id=${brandProfileId}${latestBrief.id ? `&content_brief_id=${latestBrief.id}` : ''}`}
									className="inline-flex items-center gap-2 text-sm text-primary hover:text-primary/80"
								>
									Review Content
									<ArrowRight className="w-4 h-4" />
								</a>
							)}
							{latestBrief.status === 'Sent to Make' && (
								<div className="flex items-center justify-between">
									<div className="text-xs text-text-dim">
										Content generation in progress...
									</div>
									<button
										onClick={() => retryBrief(latestBrief.id)}
										disabled={retrying === latestBrief.id}
										className="px-3 py-1.5 rounded-xl2 border border-primary/40 bg-primary/10 hover:bg-primary/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 text-xs"
									>
										{retrying === latestBrief.id ? (
											<>
												<Loader2 className="w-3 h-3 animate-spin" />
												Retrying...
											</>
										) : (
											<>
												<RotateCw className="w-3 h-3" />
												Retry
											</>
										)}
									</button>
								</div>
							)}
							{latestBrief.status === 'Failed' && (
								<div className="space-y-2">
									{latestBrief.last_error && (
										<div className="text-xs text-danger">
											Error: {latestBrief.last_error}
										</div>
									)}
									<button
										onClick={() => retryBrief(latestBrief.id)}
										disabled={retrying === latestBrief.id}
										className="px-3 py-1.5 rounded-xl2 border border-primary/40 bg-primary/10 hover:bg-primary/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 text-xs"
									>
										{retrying === latestBrief.id ? (
											<>
												<Loader2 className="w-3 h-3 animate-spin" />
												Retrying...
											</>
										) : (
											<>
												<RotateCw className="w-3 h-3" />
												Retry
											</>
										)}
									</button>
								</div>
							)}
						</div>
					)}

					{/* Show all briefs list */}
					{briefs.length > 1 && (
						<div className="pt-4 border-t border-edge/60">
							<div className="text-xs text-text-dim mb-2">All Briefs</div>
							<div className="space-y-2">
								{briefs.slice(1).map((brief) => (
									<div
										key={brief.id}
										className="flex items-center justify-between p-2 rounded-lg hover:bg-surface/30"
									>
										<div className="flex items-center gap-2">
											<div className={`w-1.5 h-1.5 rounded-full ${getStatusDotColor(brief.status)}`} />
											<span className="text-xs text-text-soft">
												{brief.cycle_label || formatDate(brief.submitted_at) || 'Brief'}
											</span>
										</div>
										<span className={`text-xs ${getStatusColor(brief.status)}`}>
											{brief.status}
										</span>
									</div>
								))}
							</div>
						</div>
					)}
				</div>
			)}
		</div>
	);
}
