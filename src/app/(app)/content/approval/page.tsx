'use client';

import { useState, useEffect, useMemo } from 'react';
import { useSupabase } from '@/components/SupabaseProvider';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, X, Eye, Calendar, Loader2, Edit2, Save, Clock } from 'lucide-react';
import { Skeleton, ContentItemSkeleton } from '@/components/skeletons/Skeleton';

type ContentItem = {
	id: string;
	title: string;
	platform: string;
	content: string;
	status: string;
	content_type?: string;
	scheduled_date?: string | null;
	published_at?: string | null;
	created_time: string;
	brand_name: string;
	summary?: string;
	call_to_action?: string;
	hashtags?: string;
	image_prompt?: string;
	image_generation_source?: string;
};

export default function ContentApprovalPage() {
	const supabase = useSupabase();
	const router = useRouter();
	const [loading, setLoading] = useState(true);
	const [contentItems, setContentItems] = useState<ContentItem[]>([]);
	const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
	const [editingItem, setEditingItem] = useState<string | null>(null);
	const [editingTitle, setEditingTitle] = useState<string>('');
	const [editingContent, setEditingContent] = useState<string>('');
	const [editingHashtags, setEditingHashtags] = useState<string>('');
	const [editingScheduledTimeId, setEditingScheduledTimeId] = useState<string | null>(null);
	const [editingScheduledTime, setEditingScheduledTime] = useState<string>('');
	const [approving, setApproving] = useState<string | null>(null);
	const [rejecting, setRejecting] = useState<string | null>(null);
	const [saving, setSaving] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [isGenerating, setIsGenerating] = useState(false);
	const [bulkApproving, setBulkApproving] = useState(false);

	useEffect(() => {
		if (!supabase) return;
		loadContent();
	}, [supabase]);

	// Poll for content if generating
	useEffect(() => {
		if (!isGenerating || !supabase) return;
		
		const pollInterval = setInterval(() => {
			loadContent();
		}, 5000); // Poll every 5 seconds

		return () => clearInterval(pollInterval);
	}, [isGenerating, supabase]);

	async function loadContent() {
		if (!supabase) return;
		setLoading(true);
		setError(null);
		try {
			const {
				data: { user },
				error: userErr,
			} = await supabase.auth.getUser();
			if (userErr || !user) {
				router.push('/login');
				return;
			}

			const res = await fetch('/api/content/queue?stage=approval', { cache: 'no-store' });
			if (!res.ok) {
				const data = await res.json().catch(() => ({}));
				throw new Error(data?.error || 'Failed to load content queue');
			}
			const data = await res.json();
			const items = Array.isArray(data.items) ? data.items : [];
			setContentItems(items);
			
			// If no items and we just approved a strategy, show loading state
			if (items.length === 0) {
				const urlParams = new URLSearchParams(window.location.search);
				if (urlParams.get('generating') === 'true') {
					setIsGenerating(true);
				}
			} else {
				setIsGenerating(false);
			}
		} catch (err: any) {
			console.error('Failed to load content:', err);
			setError(err.message || 'Failed to load content');
		} finally {
			setLoading(false);
		}
	}

	async function approveContent(id: string) {
		setApproving(id);
		setError(null);
		try {
			const res = await fetch(`/api/content/queue/${id}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ action: 'approve' }),
			});
			if (!res.ok) {
				const data = await res.json().catch(() => ({}));
				throw new Error(data?.error || 'Failed to approve content');
			}
			// Update item status to show approved state instead of removing
			setContentItems((items) =>
				items.map((item) =>
					item.id === id ? { ...item, status: 'Ready To Publish' } : item
				)
			);
			setSelectedItems((prev) => {
				const next = new Set(prev);
				next.delete(id);
				return next;
			});
		} catch (err: any) {
			console.error('Failed to approve content:', err);
			setError(err.message || 'Failed to approve content');
		} finally {
			setApproving(null);
		}
	}

	async function rejectContent(id: string) {
		const feedback = window.prompt('Share optional feedback for the rewrite (optional):') || '';
		setRejecting(id);
		setError(null);
		try {
			const res = await fetch(`/api/content/queue/${id}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ action: 'reject', feedback }),
			});
			if (!res.ok) {
				const data = await res.json().catch(() => ({}));
				throw new Error(data?.error || 'Failed to reject content');
			}
			// Update item status to show rejected state instead of removing
			setContentItems((items) =>
				items.map((item) =>
					item.id === id ? { ...item, status: 'Needs Review' } : item
				)
			);
			setSelectedItems((prev) => {
				const next = new Set(prev);
				next.delete(id);
				return next;
			});
		} catch (err: any) {
			console.error('Failed to reject content:', err);
			setError(err.message || 'Failed to reject content');
		} finally {
			setRejecting(null);
		}
	}

	async function bulkApprove() {
		if (selectedItems.size === 0) return;
		setBulkApproving(true);
		setError(null);
		try {
			const promises = Array.from(selectedItems).map((id) =>
				fetch(`/api/content/queue/${id}`, {
					method: 'PATCH',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ action: 'approve' }),
				})
			);
			const results = await Promise.all(promises);
			const failed = results.filter((r) => !r.ok);
			if (failed.length > 0) {
				throw new Error(`Failed to approve ${failed.length} item(s)`);
			}
			setContentItems((items) => items.filter((item) => !selectedItems.has(item.id)));
			setSelectedItems(new Set());
		} catch (err: any) {
			console.error('Failed to bulk approve:', err);
			setError(err.message || 'Failed to approve content');
		} finally {
			setBulkApproving(false);
		}
	}

	async function saveContentEdit(id: string) {
		setSaving(id);
		setError(null);
		try {
			const payload: any = {
				content: editingContent,
				title: editingTitle,
				hashtags: editingHashtags,
			};

			const res = await fetch(`/api/content/queue/${id}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(payload),
			});
			if (!res.ok) {
				const data = await res.json().catch(() => ({}));
				throw new Error(data?.error || 'Failed to save content');
			}
			setContentItems((items) =>
				items.map((item) =>
					item.id === id
						? {
								...item,
								content: editingContent,
								title: editingTitle,
								hashtags: editingHashtags,
							}
						: item
				)
			);
			setEditingItem(null);
			setEditingContent('');
			setEditingTitle('');
			setEditingHashtags('');
		} catch (err: any) {
			console.error('Failed to save content:', err);
			setError(err.message || 'Failed to save content');
		} finally {
			setSaving(null);
		}
	}

	async function saveScheduledTime(id: string) {
		setSaving(id);
		setError(null);
		try {
			// Convert datetime-local to ISO string for Airtable
			const isoString = editingScheduledTime 
				? new Date(editingScheduledTime).toISOString()
				: null;
			
			const res = await fetch(`/api/content/queue/${id}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ scheduled_time: isoString }),
			});
			if (!res.ok) {
				const data = await res.json().catch(() => ({}));
				throw new Error(data?.error || 'Failed to save scheduled time');
			}
			setContentItems((items) =>
				items.map((item) =>
					item.id === id ? { ...item, scheduled_date: isoString } : item
				)
			);
			setEditingScheduledTimeId(null);
			setEditingScheduledTime('');
		} catch (err: any) {
			console.error('Failed to save scheduled time:', err);
			setError(err.message || 'Failed to save scheduled time');
		} finally {
			setSaving(null);
		}
	}

	function startEdit(item: ContentItem) {
		setEditingItem(item.id);
		setEditingTitle(item.title);
		setEditingContent(item.content);
		setEditingHashtags(item.hashtags || '');
	}

	function startEditScheduledTime(item: ContentItem) {
		setEditingScheduledTimeId(item.id);
		if (item.scheduled_date) {
			// Convert to local datetime-local format (YYYY-MM-DDTHH:mm)
			const date = new Date(item.scheduled_date);
			const year = date.getFullYear();
			const month = String(date.getMonth() + 1).padStart(2, '0');
			const day = String(date.getDate()).padStart(2, '0');
			const hours = String(date.getHours()).padStart(2, '0');
			const minutes = String(date.getMinutes()).padStart(2, '0');
			setEditingScheduledTime(`${year}-${month}-${day}T${hours}:${minutes}`);
		} else {
			// Set to current date/time as default
			const now = new Date();
			const year = now.getFullYear();
			const month = String(now.getMonth() + 1).padStart(2, '0');
			const day = String(now.getDate()).padStart(2, '0');
			const hours = String(now.getHours()).padStart(2, '0');
			const minutes = String(now.getMinutes()).padStart(2, '0');
			setEditingScheduledTime(`${year}-${month}-${day}T${hours}:${minutes}`);
		}
	}

	function formatScheduledDate(dateString: string | null | undefined): string {
		if (!dateString) return 'Not scheduled';
		const date = new Date(dateString);
		return date.toLocaleString('en-US', {
			month: 'short',
			day: 'numeric',
			year: 'numeric',
			hour: '2-digit',
			minute: '2-digit',
		});
	}

	function getContentPreview(content: string, maxLines: number = 3): string {
		const lines = content.split('\n').filter((line) => line.trim());
		return lines.slice(0, maxLines).join('\n');
	}

	function toggleSelect(id: string) {
		setSelectedItems((prev) => {
			const next = new Set(prev);
			if (next.has(id)) {
				next.delete(id);
			} else {
				next.add(id);
			}
			return next;
		});
	}

	const allSelected = useMemo(
		() => contentItems.length > 0 && selectedItems.size === contentItems.length,
		[contentItems.length, selectedItems.size]
	);

	function toggleSelectAll() {
		if (allSelected) {
			setSelectedItems(new Set());
		} else {
			setSelectedItems(new Set(contentItems.map((item) => item.id)));
		}
	}

	if (loading) {
		return (
			<div className="mx-auto max-w-7xl space-y-4">
				<div className="mb-6 space-y-3">
					<Skeleton height="32px" width="250px" />
					<Skeleton height="16px" width="300px" />
				</div>
				{Array.from({ length: 3 }).map((_, i) => (
					<ContentItemSkeleton key={i} />
				))}
			</div>
		);
	}

	return (
		<div className="mx-auto max-w-7xl">
			<div className="mb-6">
				<button
					onClick={() => router.back()}
					className="text-text-soft hover:text-text text-sm inline-flex items-center gap-1"
				>
					← Back
				</button>
			</div>

			<div className="mb-6 space-y-3">
				<h1 className="text-3xl font-semibold mb-2">Content Approval Queue</h1>
				<p className="text-text-dim">
					Review and approve content before it's published. Approved content will be published automatically at the scheduled time.
				</p>
				{error && (
					<div className="border border-danger/30 bg-danger/10 text-danger text-sm rounded-xl2 p-3">
						{error}
					</div>
				)}
			</div>

			{/* Status Summary */}
			{contentItems.length > 0 && (
				<div className="card p-4 mb-4 grid grid-cols-2 md:grid-cols-4 gap-4">
					<div>
						<div className="text-2xl font-bold text-text">{contentItems.length}</div>
						<div className="text-xs text-text-dim">Total Items</div>
					</div>
					<div>
						<div className="text-2xl font-bold text-accent">
							{contentItems.filter((item) => item.status === 'Ready To Publish').length}
						</div>
						<div className="text-xs text-text-dim">Ready To Publish</div>
					</div>
					<div>
						<div className="text-2xl font-bold text-primary">
							{contentItems.filter((item) => item.status === 'Published').length}
						</div>
						<div className="text-xs text-text-dim">Published</div>
					</div>
					<div>
						<div className="text-2xl font-bold text-warning">
							{contentItems.filter((item) => item.scheduled_date && new Date(item.scheduled_date) > new Date()).length}
						</div>
						<div className="text-xs text-text-dim">Scheduled</div>
					</div>
				</div>
			)}

			{contentItems.length === 0 ? (
				isGenerating ? (
					<div className="space-y-4">
						<div className="card p-6 text-center">
							<Loader2 className="w-8 h-8 animate-spin text-primary mx-auto mb-4" />
							<p className="text-text-soft mb-2">Generating content...</p>
							<p className="text-sm text-text-dim">This may take a few moments</p>
						</div>
						{Array.from({ length: 3 }).map((_, i) => (
							<ContentItemSkeleton key={i} />
						))}
					</div>
				) : (
					<div className="card p-8 text-center">
						<p className="text-text-soft">No content pending approval</p>
					</div>
				)
			) : (
				<>
					{/* Bulk Actions Bar */}
					<motion.div
						initial={{ opacity: 0, y: -10 }}
						animate={{ opacity: 1, y: 0 }}
						className="card p-4 mb-4 flex items-center justify-between"
					>
						<div className="flex items-center gap-3">
							<input
								type="checkbox"
								checked={allSelected}
								onChange={toggleSelectAll}
								className="w-4 h-4 rounded border-edge/60 bg-surface/30 text-primary focus:ring-primary/20"
							/>
							<span className="text-sm text-text-soft">
								{selectedItems.size > 0 
									? `${selectedItems.size} item${selectedItems.size !== 1 ? 's' : ''} selected`
									: 'Select all'}
							</span>
						</div>
						{selectedItems.size > 0 && (
							<button
								onClick={bulkApprove}
								disabled={bulkApproving}
								className="px-4 py-2 rounded-xl2 bg-gradient-to-r from-accent/90 to-accent/70 hover:from-accent hover:to-accent/90 text-white font-medium shadow-lg shadow-accent/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
							>
								{bulkApproving ? (
									<Loader2 className="w-4 h-4 animate-spin" />
								) : (
									<Check className="w-4 h-4" />
								)}
								Approve Selected
							</button>
						)}
					</motion.div>

					<div className="space-y-4">
						{contentItems.map((item) => (
							<motion.div
								key={item.id}
								initial={{ opacity: 0, y: 20 }}
								animate={{ opacity: 1, y: 0 }}
								className="card p-6"
							>
								<div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
									{/* Left Column - Content Summary */}
									<div className="lg:col-span-2 space-y-4">
										{/* Title with Checkbox */}
										<div className="flex items-start gap-3">
											<input
												type="checkbox"
												checked={selectedItems.has(item.id)}
												onChange={() => toggleSelect(item.id)}
												className="w-4 h-4 rounded border-edge/60 bg-surface/30 text-primary focus:ring-primary/20 mt-1 flex-shrink-0"
											/>
											<h3 className="text-xl font-bold text-text leading-tight flex-1">
												{item.title}
											</h3>
										</div>

										{/* Platform + Brand + Content Type - Inline badges */}
										<div className="flex items-center gap-2 flex-wrap">
											<span className="px-2.5 py-1 rounded-full text-xs font-medium bg-primary/15 border border-primary/30 text-primary">
												{item.platform}
											</span>
											{item.content_type && (
												<span className="px-2.5 py-1 rounded-full text-xs font-medium bg-surface/50 border border-edge/60 text-text-soft">
													{item.content_type}
												</span>
											)}
											<span className="text-sm text-text-dim">
												{item.brand_name}
											</span>
										</div>

										{/* Status Badge - Show prominently if Ready To Publish or Published */}
										{item.status === 'Ready To Publish' && (
											<div className="flex items-center gap-2">
												<span className="px-3 py-1.5 rounded-full text-xs font-semibold bg-accent/20 border border-accent/40 text-accent flex items-center gap-1.5">
													<Check className="w-3 h-3" />
													Approved
												</span>
												{item.scheduled_date ? (
													<span className="px-3 py-1.5 rounded-full text-xs font-medium bg-primary/10 border border-primary/30 text-primary flex items-center gap-1.5">
														<Clock className="w-3 h-3" />
														Scheduled: {formatScheduledDate(item.scheduled_date)}
													</span>
												) : (
													<span className="px-3 py-1.5 rounded-full text-xs font-medium bg-warning/10 border border-warning/30 text-warning flex items-center gap-1.5">
														<Clock className="w-3 h-3" />
														Publishing soon
													</span>
												)}
											</div>
										)}
										{item.status === 'Published' && item.published_at && (
											<div className="flex items-center gap-2">
												<span className="px-3 py-1.5 rounded-full text-xs font-semibold bg-primary/20 border border-primary/40 text-primary flex items-center gap-1.5">
													<Check className="w-3 h-3" />
													Published
												</span>
												<span className="text-xs text-text-dim">
													{new Date(item.published_at).toLocaleString()}
												</span>
											</div>
										)}

										{/* Body Preview - 3 lines with fade - Clickable */}
										<div 
											className="relative cursor-pointer hover:opacity-80 transition-opacity"
											onClick={() => {
												if (editingItem !== item.id) {
													startEdit(item);
												}
											}}
										>
											<div 
												className="text-sm text-text-soft leading-relaxed"
												style={{
													display: '-webkit-box',
													WebkitLineClamp: 3,
													WebkitBoxOrient: 'vertical',
													overflow: 'hidden',
													maxHeight: '4.5rem',
												}}
											>
												{getContentPreview(item.content)}
											</div>
											<div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-bg to-transparent pointer-events-none" />
										</div>

										{/* Hashtags */}
										{item.hashtags && (
											<div className="text-xs text-text-dim">
												<span className="font-medium">Hashtags:</span> {item.hashtags}
											</div>
										)}
									</div>

									{/* Right Column - Actions + Metadata */}
									<div className="lg:col-span-1 space-y-4 flex flex-col">
										{/* Scheduled Time - Editable */}
										<div className="flex items-center justify-end gap-2">
											<Calendar className="w-4 h-4 text-text-dim flex-shrink-0" />
											{editingScheduledTimeId === item.id ? (
												<div className="flex items-center gap-2 flex-1">
													<input
														type="datetime-local"
														value={editingScheduledTime}
														onChange={(e) => setEditingScheduledTime(e.target.value)}
														className="flex-1 px-2 py-1 text-sm rounded-lg border border-edge/60 bg-surface/30 text-text focus:border-primary/60 focus:outline-none focus:ring-1 focus:ring-primary/20"
													/>
													<button
														onClick={() => saveScheduledTime(item.id)}
														disabled={saving === item.id}
														className="p-1.5 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary disabled:opacity-50"
													>
														{saving === item.id ? (
															<Loader2 className="w-4 h-4 animate-spin" />
														) : (
															<Save className="w-4 h-4" />
														)}
													</button>
													<button
														onClick={() => {
															setEditingScheduledTimeId(null);
															setEditingScheduledTime('');
														}}
														className="p-1.5 rounded-lg hover:bg-surface/50 text-text-dim"
													>
														<X className="w-4 h-4" />
													</button>
												</div>
											) : (
												<div className="flex items-center gap-2 flex-1 justify-end">
													<span className="text-sm text-text-dim text-right">
														{formatScheduledDate(item.scheduled_date)}
													</span>
													<button
														onClick={() => startEditScheduledTime(item)}
														className="p-1.5 rounded-lg hover:bg-surface/50 text-text-dim"
														title="Edit scheduled time"
													>
														<Edit2 className="w-3.5 h-3.5" />
													</button>
												</div>
											)}
										</div>

										{/* Actions */}
										<div className="flex flex-col gap-2 mt-auto">
											{/* View/Edit Button - Right Aligned */}
											<div className="flex justify-end">
												<button
													onClick={() => {
														if (editingItem === item.id) {
															setEditingItem(null);
															setEditingContent('');
															setEditingTitle('');
															setEditingHashtags('');
														} else {
															startEdit(item);
														}
													}}
													className="px-3 py-2 rounded-xl2 border border-edge/60 bg-surface/30 hover:bg-surface/50 flex items-center gap-2 text-sm"
												>
													{editingItem === item.id ? (
														<>
															<Eye className="w-4 h-4" />
															Close
														</>
													) : (
														<>
															<Edit2 className="w-4 h-4" />
															View/Edit
														</>
													)}
												</button>
											</div>

											{/* Approve/Reject Buttons */}
											{item.status === 'Ready To Publish' ? (
												<div className="flex-1 px-3 py-2 rounded-xl2 bg-gradient-to-r from-accent/90 to-accent/70 text-white text-sm font-medium shadow-lg shadow-accent/20 flex items-center justify-center gap-2">
													<Check className="w-3.5 h-3.5" />
													Approved
												</div>
											) : (
												<div className="flex gap-2">
													<button
														onClick={() => approveContent(item.id)}
														disabled={approving === item.id || rejecting === item.id || saving === item.id}
														className="flex-1 px-3 py-2 rounded-xl2 bg-gradient-to-r from-accent/90 to-accent/70 hover:from-accent hover:to-accent/90 text-white text-sm font-medium shadow-lg shadow-accent/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-all"
													>
														{approving === item.id ? (
															<Loader2 className="w-3.5 h-3.5 animate-spin" />
														) : (
															<Check className="w-3.5 h-3.5" />
														)}
														Approve
													</button>
													<button
														onClick={() => rejectContent(item.id)}
														disabled={approving === item.id || rejecting === item.id || saving === item.id}
														className="px-3 py-2 rounded-xl2 border border-danger/40 bg-transparent hover:bg-danger/10 text-danger text-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
													>
														{rejecting === item.id ? (
															<Loader2 className="w-3.5 h-3.5 animate-spin" />
														) : (
															<X className="w-3.5 h-3.5" />
														)}
														Reject
													</button>
												</div>
											)}
										</div>
									</div>
								</div>

								{/* Expanded Content Editor */}
								{editingItem === item.id && editingScheduledTimeId !== item.id && (
									<AnimatePresence>
										<motion.div
											initial={{ opacity: 0, height: 0 }}
											animate={{ opacity: 1, height: 'auto' }}
											exit={{ opacity: 0, height: 0 }}
											className="mt-6 pt-6 border-t border-edge/60"
										>
											<div className="space-y-4">
												{/* Title Editor */}
												<div>
													<label className="block text-sm font-medium text-text-soft mb-2">
														Title (hook)
													</label>
													<input
														type="text"
														value={editingTitle}
														onChange={(e) => setEditingTitle(e.target.value)}
														className="w-full rounded-xl2 border border-edge/60 bg-bg/80 px-4 py-3 text-text focus:border-primary/60 focus:outline-none focus:ring-1 focus:ring-primary/20"
														placeholder="Enter post title..."
													/>
												</div>

												{/* Content Editor */}
												<div>
													<label className="block text-sm font-medium text-text-soft mb-2">
														Content
													</label>
													<textarea
														value={editingContent}
														onChange={(e) => setEditingContent(e.target.value)}
														rows={12}
														className="w-full rounded-xl2 border border-edge/60 bg-bg/80 px-4 py-3 text-text focus:border-primary/60 focus:outline-none focus:ring-1 focus:ring-primary/20 resize-none"
														placeholder="Enter post content..."
													/>
												</div>

												{/* Hashtags Editor */}
												<div>
													<label className="block text-sm font-medium text-text-soft mb-2">
														Hashtags
													</label>
													<input
														type="text"
														value={editingHashtags}
														onChange={(e) => setEditingHashtags(e.target.value)}
														className="w-full rounded-xl2 border border-edge/60 bg-bg/80 px-4 py-3 text-text focus:border-primary/60 focus:outline-none focus:ring-1 focus:ring-primary/20"
														placeholder="Enter hashtags (comma-separated)..."
													/>
												</div>

												<div className="flex gap-2">
													<button
														onClick={() => saveContentEdit(item.id)}
														disabled={saving === item.id}
														className="px-4 py-2 rounded-xl2 bg-gradient-to-r from-primary/90 to-primary/70 hover:from-primary hover:to-primary/90 text-white font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
													>
														{saving === item.id ? (
															<Loader2 className="w-4 h-4 animate-spin" />
														) : (
															<Save className="w-4 h-4" />
														)}
														Save Changes
													</button>
													<button
														onClick={() => {
															setEditingItem(null);
															setEditingContent('');
															setEditingTitle('');
															setEditingHashtags('');
														}}
														className="px-4 py-2 rounded-xl2 border border-edge/60 bg-surface/30 hover:bg-surface/50"
													>
														Cancel
													</button>
												</div>
											</div>
										</motion.div>
									</AnimatePresence>
								)}
							</motion.div>
						))}
					</div>
				</>
			)}
		</div>
	);
}
