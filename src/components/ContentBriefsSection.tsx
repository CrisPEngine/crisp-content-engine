'use client';

/**
 * ContentBriefsSection
 *
 * Displays monthly content briefs (from StrategyUpdates).
 * When a brief has a completed result_payload (field flddd613pjtMNXs0h),
 * it renders the strategy content via MonthlyStrategyDisplay.
 */

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSupabase } from '@/components/SupabaseProvider';
import { MonthlyStrategyDisplay } from '@/components/MonthlyStrategyDisplay';
import {
	ClipboardList, Check, Loader2, AlertCircle, ArrowRight,
	RotateCw, FileText, ChevronDown, ChevronUp,
} from 'lucide-react';

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
	result_payload: any;
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
	const [expandedBriefs, setExpandedBriefs] = useState<Set<string>>(new Set());

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
			if (!res.ok) throw new Error('Failed to load content briefs');
			const data = await res.json();
			const fetched: ContentBrief[] = data.briefs || [];
			setBriefs(fetched);

			// Auto-expand completed briefs
			const completedIds = new Set(
				fetched.filter((b) => b.status === 'Generation Completed' && b.result_payload).map((b) => b.id)
			);
			setExpandedBriefs(completedIds);
		} catch (err: any) {
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
			await loadBriefs();
		} catch (err: any) {
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
			await loadBriefs();
		} catch (err: any) {
			setError(err.message || 'Failed to retry brief');
			setRetrying(null);
		}
	}

	function toggleExpand(id: string) {
		setExpandedBriefs((prev) => {
			const next = new Set(prev);
			next.has(id) ? next.delete(id) : next.add(id);
			return next;
		});
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
			return new Date(dateString).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
		} catch {
			return dateString;
		}
	}

	if (loading) {
		return (
			<div className="card p-6 flex items-center gap-2 text-text-dim">
				<Loader2 className="w-4 h-4 animate-spin" />
				<span className="text-sm">Loading content briefs...</span>
			</div>
		);
	}

	return (
		<div className="space-y-4">
			{/* Section header */}
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
				<div className="p-3 rounded-xl2 border border-danger/40 bg-danger/10 flex items-start gap-2 text-sm text-danger">
					<AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
					{error}
				</div>
			)}

			{briefs.length === 0 ? (
				<div className="card p-8 text-center text-text-dim">
					<FileText className="w-10 h-10 mx-auto mb-3 opacity-40" />
					<p className="text-sm mb-1">No content briefs yet</p>
					<p className="text-xs">Create your first monthly content brief to get started</p>
				</div>
			) : (
				<div className="space-y-4">
					{briefs.map((brief, idx) => {
						const isPending = brief.status === 'Pending Approval';
						const isCompleted = brief.status === 'Generation Completed';
						const hasPayload = !!brief.result_payload;
						const isExpanded = expandedBriefs.has(brief.id);
						const isFirst = idx === 0;

						return (
							<div
								key={brief.id}
								className={`rounded-xl2 border overflow-hidden ${
									isPending
										? 'border-primary/50 bg-primary/5'
										: isCompleted
										? 'border-accent/40 bg-accent/5'
										: 'border-edge/60 bg-surface/20'
								}`}
							>
								{/* Brief header row */}
								<div className="p-4 space-y-3">
									<div className="flex items-center justify-between gap-3 flex-wrap">
										<div className="flex items-center gap-2 flex-wrap">
											<div className={`w-2 h-2 rounded-full flex-shrink-0 ${getStatusDotColor(brief.status)}`} />
											<span className={`text-sm font-medium ${getStatusColor(brief.status)}`}>
												{brief.status}
											</span>
											{brief.cycle_label && (
												<span className="text-xs text-text-dim">· {brief.cycle_label}</span>
											)}
											{brief.submitted_at && (
												<span className="text-xs text-text-dim">· {formatDate(brief.submitted_at)}</span>
											)}
										</div>

										<div className="flex items-center gap-2 flex-wrap">
											{isPending && (
												<>
													<button
														onClick={() => router.push(`/content-brief/${brief.id}`)}
														className="px-3 py-1.5 rounded-xl2 border border-primary/40 bg-primary/10 hover:bg-primary/20 flex items-center gap-1.5 text-xs"
													>
														<FileText className="w-3.5 h-3.5" />
														Review & Edit
													</button>
													<button
														onClick={() => approveBrief(brief.id)}
														disabled={approving === brief.id}
														className="px-3 py-1.5 rounded-xl2 border border-accent/40 bg-accent/10 hover:bg-accent/20 disabled:opacity-50 flex items-center gap-1.5 text-xs"
													>
														{approving === brief.id ? (
															<Loader2 className="w-3.5 h-3.5 animate-spin" />
														) : (
															<Check className="w-3.5 h-3.5" />
														)}
														Approve & Generate
													</button>
												</>
											)}

											{isCompleted && (
												<a
													href={`/content/approval?brand_profile_id=${brandProfileId}${brief.id ? `&content_brief_id=${brief.id}` : ''}`}
													className="px-3 py-1.5 rounded-xl2 border border-accent/40 bg-accent/10 hover:bg-accent/20 flex items-center gap-1.5 text-xs text-accent"
												>
													Review Content
													<ArrowRight className="w-3.5 h-3.5" />
												</a>
											)}

											{(brief.status === 'Sent to Make' || brief.status === 'Failed') && (
												<button
													onClick={() => retryBrief(brief.id)}
													disabled={retrying === brief.id}
													className="px-3 py-1.5 rounded-xl2 border border-primary/40 bg-primary/10 hover:bg-primary/20 disabled:opacity-50 flex items-center gap-1.5 text-xs"
												>
													{retrying === brief.id ? (
														<Loader2 className="w-3.5 h-3.5 animate-spin" />
													) : (
														<RotateCw className="w-3.5 h-3.5" />
													)}
													{brief.status === 'Sent to Make' ? 'Retry' : 'Retry'}
												</button>
											)}

											{/* Expand/collapse toggle when there's a payload */}
											{hasPayload && (
												<button
													onClick={() => toggleExpand(brief.id)}
													className="px-3 py-1.5 rounded-xl2 border border-edge/60 bg-surface/30 hover:bg-surface/50 flex items-center gap-1.5 text-xs text-text-soft"
												>
													{isExpanded ? (
														<><ChevronUp className="w-3.5 h-3.5" />Hide Strategy</>
													) : (
														<><ChevronDown className="w-3.5 h-3.5" />View Strategy</>
													)}
												</button>
											)}
										</div>
									</div>

									{/* Brief objective / hint */}
									{brief.objective && !isExpanded && (
										<p className="text-sm text-text-soft leading-relaxed">
											{brief.objective.substring(0, 160)}{brief.objective.length > 160 ? '…' : ''}
										</p>
									)}

									{brief.status === 'Sent to Make' && (
										<p className="text-xs text-text-dim">Content generation in progress…</p>
									)}

									{brief.status === 'Failed' && brief.last_error && (
										<p className="text-xs text-danger">Error: {brief.last_error}</p>
									)}
								</div>

								{/* Expanded monthly strategy display */}
								{isExpanded && hasPayload && (
									<div className="border-t border-edge/60 px-4 pb-4">
										<MonthlyStrategyDisplay resultPayload={brief.result_payload} />
									</div>
								)}
							</div>
						);
					})}
				</div>
			)}
		</div>
	);
}
