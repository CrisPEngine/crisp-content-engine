'use client';

/**
 * Monthly Strategy Updates Review Page
 * 
 * Displays monthly strategy updates that are ready for review and approval.
 * Users can review, edit, and approve updates which will then be incorporated
 * into the next round of content generation.
 */

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSupabase } from '@/components/SupabaseProvider';
import { motion } from 'framer-motion';
import { Check, Edit, AlertCircle, Loader2, Calendar, ArrowLeft, FileText, ChevronDown, ChevronUp } from 'lucide-react';
import { Skeleton } from '@/components/skeletons/Skeleton';
import { MonthlyStrategyDisplay } from '@/components/MonthlyStrategyDisplay';

type StrategyUpdate = {
	id: string;
	brand_profile_id: string | null;
	user_id: string;
	cycle_label: string;
	monthly_cycle_start: string;
	objective: string;
	themes_focus: string;
	key_dates: string;
	feedback_notes: string;
	content_preferences: string;
	status: string;
	error_message: string | null;
	updated_strategy_json: any;
	created_time: string;
	updated_time: string | null;
};

export default function MonthlyStrategyUpdatesPage() {
	const router = useRouter();
	const supabase = useSupabase();
	const [loading, setLoading] = useState(true);
	const [updates, setUpdates] = useState<StrategyUpdate[]>([]);
	const [approving, setApproving] = useState<string | null>(null);
	const [editing, setEditing] = useState<string | null>(null);
	const [editedStrategyJson, setEditedStrategyJson] = useState<string>('');
	const [error, setError] = useState<string | null>(null);
	const [expandedPayloads, setExpandedPayloads] = useState<Set<string>>(new Set());

	useEffect(() => {
		if (!supabase) return;
		loadUpdates();
	}, [supabase]);

	async function loadUpdates() {
		if (!supabase) return;
		setLoading(true);
		setError(null);
		try {
			const { data: { user } } = await supabase.auth.getUser();
			if (!user) {
				window.location.href = '/sign-in';
				return;
			}

			const res = await fetch('/api/strategy/monthly-updates', { cache: 'no-store' });
			if (!res.ok) {
				const data = await res.json().catch(() => ({}));
				throw new Error(data?.error || 'Failed to load strategy updates');
			}
			const data = await res.json();
			setUpdates(data.updates || []);
		} catch (err: any) {
			console.error('Failed to load strategy updates:', err);
			setError(err.message || 'Failed to load strategy updates');
		} finally {
			setLoading(false);
		}
	}

	async function approveUpdate(updateId: string) {
		if (!supabase) return;
		setApproving(updateId);
		setError(null);
		try {
			const payload: any = {};
			if (editing === updateId && editedStrategyJson) {
				payload.strategy_json = editedStrategyJson;
			}

			const res = await fetch(`/api/strategy/monthly-update/${updateId}/approve`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(payload),
			});

			const data = await res.json();

			if (!res.ok) {
				throw new Error(data?.error || 'Failed to approve strategy update');
			}

			// Reload updates
			await loadUpdates();
			setEditing(null);
			setEditedStrategyJson('');
			
			// Redirect to content approval
			setTimeout(() => {
				router.push('/content/approval?generating=true');
			}, 1000);
		} catch (err: any) {
			console.error('Failed to approve strategy update:', err);
			setError(err.message || 'Failed to approve strategy update. Please try again.');
			setApproving(null);
		}
	}

	function startEditing(update: StrategyUpdate) {
		const strategyJson = update.updated_strategy_json || {};
		setEditedStrategyJson(JSON.stringify(strategyJson, null, 2));
		setEditing(update.id);
	}

	function cancelEditing() {
		setEditing(null);
		setEditedStrategyJson('');
	}

	function togglePayload(id: string) {
		setExpandedPayloads((prev) => {
			const next = new Set(prev);
			next.has(id) ? next.delete(id) : next.add(id);
			return next;
		});
	}

	function formatDate(dateString: string) {
		try {
			const date = new Date(dateString);
			return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
		} catch {
			return dateString;
		}
	}

	function getStatusColor(status: string) {
		if (status === 'Approved') return 'text-accent';
		if (status === 'Completed') return 'text-primary';
		if (status === 'Processing') return 'text-primary/70';
		if (status === 'Failed') return 'text-danger';
		return 'text-text-dim';
	}

	function getStatusDotColor(status: string) {
		if (status === 'Approved') return 'bg-accent';
		if (status === 'Completed') return 'bg-primary';
		if (status === 'Processing') return 'bg-primary/70';
		if (status === 'Failed') return 'bg-danger';
		return 'bg-text-dim';
	}

	if (loading) {
		return (
			<div className="mx-auto max-w-4xl">
				<div className="mb-6">
					<Skeleton height="20px" width="80px" />
				</div>
				<div className="card p-8 space-y-6">
					<Skeleton height="32px" width="250px" />
					<Skeleton height="400px" width="100%" />
				</div>
			</div>
		);
	}

	return (
		<div className="mx-auto max-w-4xl">
			<div className="mb-6">
				<button
					onClick={() => router.back()}
					className="text-text-soft hover:text-text text-sm inline-flex items-center gap-1"
				>
					<ArrowLeft className="w-4 h-4" />
					Back
				</button>
			</div>

			{error && (
				<div className="mb-6 card p-4 border-danger/40 bg-danger/10 flex items-start gap-3">
					<AlertCircle className="w-5 h-5 text-danger flex-shrink-0 mt-0.5" />
					<div className="flex-1">
						<div className="font-medium text-danger mb-1">Error</div>
						<div className="text-sm text-text-dim">{error}</div>
					</div>
				</div>
			)}

			{/* Header */}
			<motion.div
				initial={{ opacity: 0, y: 20 }}
				animate={{ opacity: 1, y: 0 }}
				className="mb-6"
			>
				<h1 className="text-3xl font-semibold mb-2">Monthly Strategy Updates</h1>
				<p className="text-text-soft">
					Review and approve monthly strategy updates. Once approved, they will be incorporated into the next round of content generation.
				</p>
			</motion.div>

			{/* Updates List */}
			{updates.length === 0 ? (
				<div className="card p-8 text-center">
					<FileText className="w-12 h-12 text-text-dim mx-auto mb-4" />
					<p className="text-text-soft mb-2">No strategy updates available</p>
					<p className="text-sm text-text-dim">
						Monthly strategy updates will appear here once they're generated by Make.com.
					</p>
				</div>
			) : (
				<div className="space-y-6">
					{updates.map((update) => (
						<motion.div
							key={update.id}
							initial={{ opacity: 0, y: 10 }}
							animate={{ opacity: 1, y: 0 }}
							className="card p-6 space-y-4"
						>
							{/* Header */}
							<div className="flex flex-col md:flex-row items-start justify-between gap-4">
								<div className="flex-1">
									<div className="flex items-center gap-3 mb-2">
										<div className={`w-2 h-2 rounded-full ${getStatusDotColor(update.status)}`} />
										<span className={`text-sm font-medium ${getStatusColor(update.status)}`}>
											{update.status}
										</span>
										{update.cycle_label && (
											<span className="text-sm text-text-soft">
												{update.cycle_label}
											</span>
										)}
									</div>
									{update.monthly_cycle_start && (
										<div className="text-xs text-text-dim flex items-center gap-1">
											<Calendar className="w-3 h-3" />
											Cycle starts: {formatDate(update.monthly_cycle_start)}
										</div>
									)}
								</div>
								{update.status === 'Completed' && (
									<div className="flex gap-2">
										{editing !== update.id ? (
											<>
												<button
													onClick={() => startEditing(update)}
													className="px-4 py-2 rounded-xl2 border border-edge/60 bg-surface/30 hover:bg-surface/50 flex items-center gap-2"
												>
													<Edit className="w-4 h-4" />
													Edit
												</button>
												<button
													onClick={() => approveUpdate(update.id)}
													disabled={approving === update.id}
													className="px-6 py-2 rounded-xl2 border border-accent/40 bg-accent/10 hover:bg-accent/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
												>
													{approving === update.id ? (
														<Loader2 className="w-4 h-4 animate-spin" />
													) : (
														<Check className="w-4 h-4" />
													)}
													Approve & Generate Content
												</button>
											</>
										) : (
											<>
												<button
													onClick={() => approveUpdate(update.id)}
													disabled={approving === update.id}
													className="px-6 py-2 rounded-xl2 border border-accent/40 bg-accent/10 hover:bg-accent/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
												>
													{approving === update.id ? (
														<Loader2 className="w-4 h-4 animate-spin" />
													) : (
														<Check className="w-4 h-4" />
													)}
													Save & Approve
												</button>
												<button
													onClick={cancelEditing}
													className="px-4 py-2 rounded-xl2 border border-edge/60 bg-surface/30 hover:bg-surface/50"
												>
													Cancel
												</button>
											</>
										)}
									</div>
								)}
							</div>

							{/* Error Message */}
							{update.status === 'Failed' && update.error_message && (
								<div className="p-3 rounded-xl2 border border-danger/40 bg-danger/10 text-sm text-danger">
									{update.error_message}
								</div>
							)}

						{/* Update Details (brief inputs) */}
						<div className="space-y-3 pt-4 border-t border-edge/60">
							{update.objective && (
								<div>
									<div className="text-xs text-text-dim mb-1">Objective</div>
									<div className="text-sm text-text">{update.objective}</div>
								</div>
							)}
							{update.themes_focus && (
								<div>
									<div className="text-xs text-text-dim mb-1">Themes & Focus</div>
									<div className="text-sm text-text">{update.themes_focus}</div>
								</div>
							)}
							{update.content_preferences && (
								<div>
									<div className="text-xs text-text-dim mb-1">Content Preferences</div>
									<div className="text-sm text-text">{update.content_preferences}</div>
								</div>
							)}
							{update.key_dates && (
								<div>
									<div className="text-xs text-text-dim mb-1">Key Dates</div>
									<div className="text-sm text-text">{update.key_dates}</div>
								</div>
							)}
							{update.feedback_notes && (
								<div>
									<div className="text-xs text-text-dim mb-1">Feedback Notes</div>
									<div className="text-sm text-text">{update.feedback_notes}</div>
								</div>
							)}
						</div>

						{/* Generated monthly strategy — toggle */}
						{update.updated_strategy_json && (
							<div className="pt-2">
								<button
									onClick={() => togglePayload(update.id)}
									className="flex items-center gap-2 text-sm text-primary hover:text-primary/80 font-medium"
								>
									{expandedPayloads.has(update.id) ? (
										<><ChevronUp className="w-4 h-4" />Hide Generated Strategy</>
									) : (
										<><ChevronDown className="w-4 h-4" />View Generated Strategy</>
									)}
								</button>
								{expandedPayloads.has(update.id) && (
									<div className="mt-4 p-4 rounded-xl2 border border-edge/60 bg-surface/20">
										<MonthlyStrategyDisplay resultPayload={update.updated_strategy_json} />
									</div>
								)}
							</div>
						)}

						{/* Strategy JSON Editor (when editing) */}
						{editing === update.id && (
							<div className="pt-4 border-t border-edge/60">
								<div className="text-xs text-text-dim mb-2">Updated Strategy JSON</div>
								<textarea
									value={editedStrategyJson}
									onChange={(e) => setEditedStrategyJson(e.target.value)}
									rows={15}
									className="w-full rounded-xl2 border border-edge/60 bg-bg/80 px-4 py-3 text-text font-mono text-xs focus:border-primary/60 focus:outline-none focus:ring-1 focus:ring-primary/20 resize-none"
								/>
								<div className="text-xs text-text-dim mt-2">
									Edit the strategy JSON if needed before approving.
								</div>
							</div>
						)}
						</motion.div>
					))}
				</div>
			)}
		</div>
	);
}
