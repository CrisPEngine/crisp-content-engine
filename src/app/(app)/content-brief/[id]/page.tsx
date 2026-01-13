'use client';

/**
 * Content Brief Review Page
 * 
 * Displays a content brief for review and approval
 * Users can view, edit, and approve briefs which will trigger content generation
 */

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useSupabase } from '@/components/SupabaseProvider';
import { motion } from 'framer-motion';
import { Check, Edit, AlertCircle, Loader2, Calendar, ArrowLeft, FileText, X, Save } from 'lucide-react';
import { ContentGenerationLoading } from '@/components/ContentGenerationLoading';
import { Skeleton } from '@/components/skeletons/Skeleton';

type ContentBrief = {
	id: string;
	brand_profile_id: string | null;
	brief_mode: string;
	cycle_start_date: string;
	cycle_label: string;
	objective: string;
	themes_focus: string;
	key_dates: string;
	feedback_notes: string;
	content_preferences: string;
	primary_goal: string;
	success_metric: string;
	cta: string;
	cta_link: string;
	offers_to_push: string;
	topics_to_avoid_this_month: string;
	competitor_or_inspo_links: string;
	status: string;
	submitted_at: string | null;
	approved_at: string | null;
	result_payload_formatted: string | null;
	result_payload_display: string | null;
};

export default function ContentBriefReviewPage() {
	const params = useParams();
	const router = useRouter();
	const supabase = useSupabase();
	const [loading, setLoading] = useState(true);
	const [brief, setBrief] = useState<ContentBrief | null>(null);
	const [approving, setApproving] = useState(false);
	const [editing, setEditing] = useState(false);
	const [editedFields, setEditedFields] = useState<Partial<ContentBrief>>({});
	const [saving, setSaving] = useState(false);
	const [showLoading, setShowLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const briefId = typeof params.id === 'string' ? params.id : String(params.id);
	
	const loadBrief = useCallback(async () => {
		if (!supabase || !briefId) return;
		setLoading(true);
		setError(null);
		try {
			const { data: { user } } = await supabase.auth.getUser();
			if (!user) {
				window.location.href = '/login';
				return;
			}

			const res = await fetch(`/api/content-brief/${briefId}`, { cache: 'no-store' });
			if (!res.ok) {
				const data = await res.json().catch(() => ({}));
				throw new Error(data?.error || 'Failed to load content brief');
			}
			const data = await res.json();
			setBrief(data);
			setEditedFields({});
		} catch (err: any) {
			console.error('Failed to load content brief:', err);
			setError(err.message || 'Failed to load content brief');
		} finally {
			setLoading(false);
		}
	}, [supabase, briefId]);

	useEffect(() => {
		if (!supabase) return;
		loadBrief();
	}, [supabase, loadBrief]);

	async function approveBrief() {
		if (!supabase || !brief) return;
		setApproving(true);
		setError(null);
		try {
			const res = await fetch(`/api/content-brief/${brief.id}/approve`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
			});

			const data = await res.json();

			if (!res.ok) {
				throw new Error(data?.error || 'Failed to approve content brief');
			}

			// Show loading animation
			setShowLoading(true);
			// Redirect to content approval with generating flag after loading completes
			setTimeout(() => {
				router.push(`/content/approval?brand_profile_id=${brief.brand_profile_id}&generating=true`);
			}, 6000); // After loading animation completes
		} catch (err: any) {
			console.error('Failed to approve content brief:', err);
			setError(err.message || 'Failed to approve content brief. Please try again.');
			setApproving(false);
		}
	}

	async function saveEdit() {
		if (!brief || !supabase) return;
		setSaving(true);
		setError(null);
		try {
			const res = await fetch(`/api/content-brief/${brief.id}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(editedFields),
			});

			const data = await res.json();

			if (!res.ok) {
				throw new Error(data?.error || 'Failed to save content brief');
			}

			// Update local state
			setBrief({ ...brief, ...editedFields });
			setEditing(false);
			setEditedFields({});
		} catch (error: any) {
			console.error('Failed to save edit:', error);
			setError(error.message || 'Failed to save changes. Please try again.');
		} finally {
			setSaving(false);
		}
	}

	function startEditing() {
		if (!brief) return;
		setEditedFields({
			objective: brief.objective,
			themes_focus: brief.themes_focus,
			key_dates: brief.key_dates,
			feedback_notes: brief.feedback_notes,
			content_preferences: brief.content_preferences,
			primary_goal: brief.primary_goal,
			success_metric: brief.success_metric,
			cta: brief.cta,
			cta_link: brief.cta_link,
			offers_to_push: brief.offers_to_push,
			topics_to_avoid_this_month: brief.topics_to_avoid_this_month,
			competitor_or_inspo_links: brief.competitor_or_inspo_links,
		});
		setEditing(true);
	}

	function cancelEditing() {
		setEditing(false);
		setEditedFields({});
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

	function getStatusColor(status: string) {
		if (status === 'Approved' || status === 'Generation Completed') return 'text-accent';
		if (status === 'Pending Approval') return 'text-primary';
		if (status === 'Sent to Make') return 'text-primary/70';
		if (status === 'Failed') return 'text-danger';
		return 'text-text-dim';
	}

	if (showLoading) {
		return <ContentGenerationLoading onComplete={() => router.push(`/content/approval?brand_profile_id=${brief?.brand_profile_id}`)} />;
	}

	if (loading) {
		return (
			<div className="min-h-screen bg-bg p-4 md:p-8">
				<div className="max-w-4xl mx-auto">
					<Skeleton className="h-12 w-64 mb-6" />
					<Skeleton className="h-96 w-full" />
				</div>
			</div>
		);
	}

	if (!brief) {
		return (
			<div className="min-h-screen bg-bg p-4 md:p-8">
				<div className="max-w-4xl mx-auto">
					<div className="card p-6 text-center">
						<AlertCircle className="w-12 h-12 text-danger mx-auto mb-4" />
						<h2 className="text-xl font-semibold mb-2">Content Brief Not Found</h2>
						<p className="text-text-dim mb-4">The content brief you're looking for doesn't exist or you don't have permission to view it.</p>
						<button
							onClick={() => router.back()}
							className="px-4 py-2 rounded-xl2 border border-primary/40 bg-primary/10 hover:bg-primary/20 text-sm"
						>
							Go Back
						</button>
					</div>
				</div>
			</div>
		);
	}

	return (
		<div className="min-h-screen bg-bg p-4 md:p-8">
			<div className="max-w-4xl mx-auto space-y-6">
				{/* Header */}
				<div className="flex items-center gap-4">
					<button
						onClick={() => router.back()}
						className="p-2 rounded-lg hover:bg-surface/50 transition-colors"
					>
						<ArrowLeft className="w-5 h-5" />
					</button>
					<div className="flex-1">
						<h1 className="text-2xl font-bold">Content Brief Review</h1>
						<div className="flex items-center gap-3 mt-2">
							<span className={`text-sm font-medium ${getStatusColor(brief.status)}`}>
								{brief.status}
							</span>
							{brief.cycle_label && (
								<span className="text-sm text-text-dim">· {brief.cycle_label}</span>
							)}
							{brief.submitted_at && (
								<span className="text-sm text-text-dim">
									· Submitted {formatDate(brief.submitted_at)}
								</span>
							)}
						</div>
					</div>
				</div>

				{error && (
					<div className="card p-4 border border-danger/40 bg-danger/10 text-danger">
						<div className="flex items-start gap-3">
							<AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
							<div className="flex-1">
								<p className="text-sm whitespace-pre-line">{error}</p>
							</div>
						</div>
					</div>
				)}

				{/* Action Buttons */}
				<div className="card p-4 flex items-center justify-between gap-4">
					<div className="flex items-center gap-3">
						{!editing && brief.status === 'Pending Approval' && (
							<>
								<button
									onClick={startEditing}
									className="px-4 py-2 rounded-xl2 border border-primary/40 bg-primary/10 hover:bg-primary/20 text-sm flex items-center gap-2"
								>
									<Edit className="w-4 h-4" />
									Edit Brief
								</button>
								<button
									onClick={approveBrief}
									disabled={approving}
									className="px-6 py-2 rounded-xl2 bg-gradient-to-r from-accent/90 to-accent/70 hover:from-accent hover:to-accent/90 text-white font-medium shadow-lg shadow-accent/20 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
								>
									{approving ? (
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
							</>
						)}
						{editing && (
							<>
								<button
									onClick={saveEdit}
									disabled={saving}
									className="px-4 py-2 rounded-xl2 border border-accent/40 bg-accent/10 hover:bg-accent/20 text-sm flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
								>
									{saving ? (
										<>
											<Loader2 className="w-4 h-4 animate-spin" />
											Saving...
										</>
									) : (
										<>
											<Save className="w-4 h-4" />
											Save Changes
										</>
									)}
								</button>
								<button
									onClick={cancelEditing}
									disabled={saving}
									className="px-4 py-2 rounded-xl2 border border-edge/60 hover:bg-surface/50 text-sm flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
								>
									<X className="w-4 h-4" />
									Cancel
								</button>
							</>
						)}
					</div>
					{brief.status === 'Generation Completed' && (
						<a
							href={`/content/approval?brand_profile_id=${brief.brand_profile_id}&content_brief_id=${brief.id}`}
							className="px-4 py-2 rounded-xl2 border border-accent/40 bg-accent/10 hover:bg-accent/20 text-sm flex items-center gap-2"
						>
							<FileText className="w-4 h-4" />
							Review Content
						</a>
					)}
				</div>

				{/* Brief Content */}
				<div className="card p-6 space-y-6">
					{/* Objective */}
					<div>
						<label className="block text-sm font-medium text-text-soft mb-2">
							Objective
						</label>
						{editing ? (
							<textarea
								value={editedFields.objective || ''}
								onChange={(e) => setEditedFields({ ...editedFields, objective: e.target.value })}
								className="w-full px-4 py-2 rounded-xl2 border border-edge/60 bg-surface/30 text-text focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-transparent min-h-[100px]"
								placeholder="What do you want to achieve this month?"
							/>
						) : (
							<p className="text-text-soft whitespace-pre-wrap">
								{brief.objective || <span className="text-text-dim italic">Not specified</span>}
							</p>
						)}
					</div>

					{/* Themes & Focus */}
					<div>
						<label className="block text-sm font-medium text-text-soft mb-2">
							Themes & Focus
						</label>
						{editing ? (
							<textarea
								value={editedFields.themes_focus || ''}
								onChange={(e) => setEditedFields({ ...editedFields, themes_focus: e.target.value })}
								className="w-full px-4 py-2 rounded-xl2 border border-edge/60 bg-surface/30 text-text focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-transparent min-h-[100px]"
								placeholder="What themes should content focus on this month?"
							/>
						) : (
							<p className="text-text-soft whitespace-pre-wrap">
								{brief.themes_focus || <span className="text-text-dim italic">Not specified</span>}
							</p>
						)}
					</div>

					{/* Key Dates */}
					<div>
						<label className="block text-sm font-medium text-text-soft mb-2">
							Key Dates
						</label>
						{editing ? (
							<textarea
								value={editedFields.key_dates || ''}
								onChange={(e) => setEditedFields({ ...editedFields, key_dates: e.target.value })}
								className="w-full px-4 py-2 rounded-xl2 border border-edge/60 bg-surface/30 text-text focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-transparent min-h-[80px]"
								placeholder="Any important dates or events this month?"
							/>
						) : (
							<p className="text-text-soft whitespace-pre-wrap">
								{brief.key_dates || <span className="text-text-dim italic">Not specified</span>}
							</p>
						)}
					</div>

					{/* Feedback Notes */}
					{brief.brief_mode === 'feedback' && (
						<div>
							<label className="block text-sm font-medium text-text-soft mb-2">
								Feedback Notes
							</label>
							{editing ? (
								<textarea
									value={editedFields.feedback_notes || ''}
									onChange={(e) => setEditedFields({ ...editedFields, feedback_notes: e.target.value })}
									className="w-full px-4 py-2 rounded-xl2 border border-edge/60 bg-surface/30 text-text focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-transparent min-h-[100px]"
									placeholder="Feedback on what worked and what didn't"
								/>
							) : (
								<p className="text-text-soft whitespace-pre-wrap">
									{brief.feedback_notes || <span className="text-text-dim italic">Not specified</span>}
								</p>
							)}
						</div>
					)}

					{/* Content Preferences */}
					<div>
						<label className="block text-sm font-medium text-text-soft mb-2">
							Content Preferences
						</label>
						{editing ? (
							<textarea
								value={editedFields.content_preferences || ''}
								onChange={(e) => setEditedFields({ ...editedFields, content_preferences: e.target.value })}
								className="w-full px-4 py-2 rounded-xl2 border border-edge/60 bg-surface/30 text-text focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-transparent min-h-[100px]"
								placeholder="Any specific content preferences or requirements?"
							/>
						) : (
							<p className="text-text-soft whitespace-pre-wrap">
								{brief.content_preferences || <span className="text-text-dim italic">Not specified</span>}
							</p>
						)}
					</div>

					{/* Primary Goal */}
					{brief.primary_goal && (
						<div>
							<label className="block text-sm font-medium text-text-soft mb-2">
								Primary Goal
							</label>
							{editing ? (
								<select
									value={editedFields.primary_goal || ''}
									onChange={(e) => setEditedFields({ ...editedFields, primary_goal: e.target.value })}
									className="w-full px-4 py-2 rounded-xl2 border border-edge/60 bg-surface/30 text-text focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-transparent"
								>
									<option value="">Select a goal</option>
									<option value="Awareness">Awareness</option>
									<option value="Engagement">Engagement</option>
									<option value="Traffic">Traffic</option>
									<option value="Leads">Leads</option>
								</select>
							) : (
								<p className="text-text-soft">{brief.primary_goal}</p>
							)}
						</div>
					)}

					{/* Success Metric */}
					{brief.success_metric && (
						<div>
							<label className="block text-sm font-medium text-text-soft mb-2">
								Success Metric
							</label>
							{editing ? (
								<select
									value={editedFields.success_metric || ''}
									onChange={(e) => setEditedFields({ ...editedFields, success_metric: e.target.value })}
									className="w-full px-4 py-2 rounded-xl2 border border-edge/60 bg-surface/30 text-text focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-transparent"
								>
									<option value="">Select a metric</option>
									<option value="CTR">CTR</option>
									<option value="comments">Comments</option>
									<option value="followers">Followers</option>
									<option value="leads">Leads</option>
								</select>
							) : (
								<p className="text-text-soft">{brief.success_metric}</p>
							)}
						</div>
					)}

					{/* CTA */}
					{brief.cta && (
						<div>
							<label className="block text-sm font-medium text-text-soft mb-2">
								Call to Action
							</label>
							{editing ? (
								<div className="space-y-2">
									<input
										type="text"
										value={editedFields.cta || ''}
										onChange={(e) => setEditedFields({ ...editedFields, cta: e.target.value })}
										className="w-full px-4 py-2 rounded-xl2 border border-edge/60 bg-surface/30 text-text focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-transparent"
										placeholder="CTA text"
									/>
									<input
										type="url"
										value={editedFields.cta_link || ''}
										onChange={(e) => setEditedFields({ ...editedFields, cta_link: e.target.value })}
										className="w-full px-4 py-2 rounded-xl2 border border-edge/60 bg-surface/30 text-text focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-transparent"
										placeholder="CTA link URL"
									/>
								</div>
							) : (
								<div className="text-text-soft">
									<p>{brief.cta}</p>
									{brief.cta_link && (
										<a href={brief.cta_link} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline text-sm mt-1 block">
											{brief.cta_link}
										</a>
									)}
								</div>
							)}
						</div>
					)}

					{/* Offers to Push */}
					{brief.offers_to_push && (
						<div>
							<label className="block text-sm font-medium text-text-soft mb-2">
								Offers to Push
							</label>
							{editing ? (
								<textarea
									value={editedFields.offers_to_push || ''}
									onChange={(e) => setEditedFields({ ...editedFields, offers_to_push: e.target.value })}
									className="w-full px-4 py-2 rounded-xl2 border border-edge/60 bg-surface/30 text-text focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-transparent min-h-[80px]"
									placeholder="Any offers or promotions to highlight?"
								/>
							) : (
								<p className="text-text-soft whitespace-pre-wrap">{brief.offers_to_push}</p>
							)}
						</div>
					)}

					{/* Topics to Avoid */}
					{brief.topics_to_avoid_this_month && (
						<div>
							<label className="block text-sm font-medium text-text-soft mb-2">
								Topics to Avoid
							</label>
							{editing ? (
								<textarea
									value={editedFields.topics_to_avoid_this_month || ''}
									onChange={(e) => setEditedFields({ ...editedFields, topics_to_avoid_this_month: e.target.value })}
									className="w-full px-4 py-2 rounded-xl2 border border-edge/60 bg-surface/30 text-text focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-transparent min-h-[80px]"
									placeholder="Topics to avoid this month"
								/>
							) : (
								<p className="text-text-soft whitespace-pre-wrap">{brief.topics_to_avoid_this_month}</p>
							)}
						</div>
					)}

					{/* Competitor/Inspo Links */}
					{brief.competitor_or_inspo_links && (
						<div>
							<label className="block text-sm font-medium text-text-soft mb-2">
								Competitor or Inspiration Links
							</label>
							{editing ? (
								<textarea
									value={editedFields.competitor_or_inspo_links || ''}
									onChange={(e) => setEditedFields({ ...editedFields, competitor_or_inspo_links: e.target.value })}
									className="w-full px-4 py-2 rounded-xl2 border border-edge/60 bg-surface/30 text-text focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-transparent min-h-[80px]"
									placeholder="Links to competitor content or inspiration"
								/>
							) : (
								<p className="text-text-soft whitespace-pre-wrap">{brief.competitor_or_inspo_links}</p>
							)}
						</div>
					)}

					{/* Generated Strategy (if available) */}
					{(brief.result_payload_formatted || brief.result_payload_display) && (
						<div>
							<label className="block text-sm font-medium text-text-soft mb-2">
								Generated Strategy
							</label>
							<div className="p-4 rounded-xl2 border border-edge/60 bg-surface/30">
								<pre className="text-sm text-text-soft whitespace-pre-wrap font-sans">
									{brief.result_payload_display || brief.result_payload_formatted}
								</pre>
							</div>
						</div>
					)}
				</div>
			</div>
		</div>
	);
}

