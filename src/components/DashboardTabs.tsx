'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Calendar, FileText, Clock, Check, X, Loader2, Edit2, Trash2, ChevronDown, ChevronUp, Save } from 'lucide-react';
import Link from 'next/link';
import { DeleteConfirmationModal } from './DeleteConfirmationModal';

type ContentItem = {
	id: string;
	title: string;
	platform: string;
	status: string;
	content_type?: string;
	scheduled_date?: string | null;
	published_at?: string | null;
	brand_name: string;
	content?: string;
	hashtags?: string;
};

type Tab = 'overview' | 'content';

interface DashboardTabsProps {
	activeTab: Tab;
	contentItems?: ContentItem[];
	loading?: boolean;
}

function formatScheduledDateTime(dateString: string | null | undefined): string {
	if (!dateString) return 'Not scheduled';
	try {
		const date = new Date(dateString);
		return date.toLocaleString('en-US', {
			month: 'short',
			day: 'numeric',
			year: 'numeric',
			hour: 'numeric',
			minute: '2-digit',
		});
	} catch {
		return 'Invalid date';
	}
}

function formatCountdown(dateString: string | null | undefined): string | null {
	if (!dateString) return null;
	try {
		const date = new Date(dateString);
		const now = new Date();
		const diffMs = date.getTime() - now.getTime();
		const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
		const diffDays = Math.floor(diffHours / 24);

		if (diffMs < 0) {
			return 'Past due';
		}

		// Only show countdown for items within 5 days
		if (diffDays >= 5) {
			return null;
		}

		if (diffHours < 1) {
			return 'Within 1 hour';
		}
		if (diffHours < 24) {
			return `In ${diffHours} hour${diffHours !== 1 ? 's' : ''}`;
		}
		return `In ${diffDays} day${diffDays !== 1 ? 's' : ''}`;
	} catch {
		return null;
	}
}

export function DashboardTabs({ activeTab, contentItems: initialContentItems = [], loading: initialLoading = false }: DashboardTabsProps) {
	const router = useRouter();
	const [contentItems, setContentItems] = useState<ContentItem[]>(initialContentItems);
	const [loading, setLoading] = useState(initialLoading);
	const [deleteModalOpen, setDeleteModalOpen] = useState(false);
	const [itemToDelete, setItemToDelete] = useState<ContentItem | null>(null);
	const [isDeleting, setIsDeleting] = useState(false);
	
	// Accordion state for published posts
	const [expandedPublished, setExpandedPublished] = useState<Set<string>>(new Set());
	
	// Inline editing state for Ready To Publish
	const [editingItem, setEditingItem] = useState<string | null>(null);
	const [editingTitle, setEditingTitle] = useState<string>('');
	const [editingContent, setEditingContent] = useState<string>('');
	const [editingHashtags, setEditingHashtags] = useState<string>('');
	const [saving, setSaving] = useState(false);

	// Fetch content when Content tab is active
	useEffect(() => {
		if (activeTab === 'content') {
			setLoading(true);
			fetch('/api/content/queue?stage=all', { cache: 'no-store' })
				.then((res) => res.json())
				.then((data) => {
					setContentItems(data.items || []);
				})
				.catch((err) => {
					console.error('Failed to load content:', err);
				})
				.finally(() => {
					setLoading(false);
				});
		}
	}, [activeTab]);

	// Fix counts: 
	// - Ready To Publish: status === 'Ready To Publish'
	// - Scheduled: Ready To Publish items with scheduled_date in the future
	// - Published: status === 'Published'
	const readyToPublish = contentItems.filter((item) => item.status === 'Ready To Publish');
	const published = contentItems.filter((item) => item.status === 'Published');
	const scheduled = readyToPublish.filter(
		(item) => item.scheduled_date && new Date(item.scheduled_date) > new Date()
	);

	const handleDeleteClick = (item: ContentItem) => {
		setItemToDelete(item);
		setDeleteModalOpen(true);
	};

	const handleDeleteConfirm = async () => {
		if (!itemToDelete) return;

		setIsDeleting(true);
		try {
			const res = await fetch(`/api/content/queue/${itemToDelete.id}`, {
				method: 'DELETE',
			});

			if (!res.ok) {
				const data = await res.json();
				throw new Error(data?.error || 'Failed to delete content');
			}

			// Remove item from local state
			setContentItems((prev) => prev.filter((item) => item.id !== itemToDelete.id));
			setDeleteModalOpen(false);
			setItemToDelete(null);
		} catch (error: any) {
			console.error('Delete error:', error);
			alert(error?.message || 'Failed to delete content. Please try again.');
		} finally {
			setIsDeleting(false);
		}
	};

	const handleDeleteCancel = () => {
		if (isDeleting) return;
		setDeleteModalOpen(false);
		setItemToDelete(null);
	};

	const togglePublishedExpanded = (itemId: string) => {
		setExpandedPublished((prev) => {
			const next = new Set(prev);
			if (next.has(itemId)) {
				next.delete(itemId);
			} else {
				next.add(itemId);
			}
			return next;
		});
	};

	const startEdit = (item: ContentItem) => {
		setEditingItem(item.id);
		setEditingTitle(item.title || '');
		setEditingContent(item.content || '');
		setEditingHashtags(item.hashtags || '');
	};

	const cancelEdit = () => {
		setEditingItem(null);
		setEditingTitle('');
		setEditingContent('');
		setEditingHashtags('');
	};

	const saveEdit = async (itemId: string) => {
		setSaving(true);
		try {
			const res = await fetch(`/api/content/queue/${itemId}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					title: editingTitle,
					content: editingContent,
					hashtags: editingHashtags,
				}),
			});

			if (!res.ok) {
				const data = await res.json();
				throw new Error(data?.error || 'Failed to save changes');
			}

			// Update local state
			setContentItems((prev) =>
				prev.map((item) =>
					item.id === itemId
						? { ...item, title: editingTitle, content: editingContent, hashtags: editingHashtags }
						: item
				)
			);

			cancelEdit();
		} catch (error: any) {
			console.error('Save error:', error);
			alert(error?.message || 'Failed to save changes. Please try again.');
		} finally {
			setSaving(false);
		}
	};

	return (
		<div className="space-y-6">
			{/* Tabs */}
			<div className="border-b border-edge/60">
				<div className="flex gap-1">
					<Link
						href="/dashboard"
						className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
							activeTab === 'overview'
								? 'border-primary text-primary'
								: 'border-transparent text-text-dim hover:text-text hover:border-edge/60'
						}`}
					>
						Overview
					</Link>
					<Link
						href="/dashboard?tab=content"
						className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
							activeTab === 'content'
								? 'border-primary text-primary'
								: 'border-transparent text-text-dim hover:text-text hover:border-edge/60'
						}`}
					>
						Content
						{readyToPublish.length > 0 && (
							<span className="ml-2 px-1.5 py-0.5 rounded-full text-xs bg-accent/20 text-accent">
								{readyToPublish.length}
							</span>
						)}
					</Link>
				</div>
			</div>

			{/* Tab Content */}
			{activeTab === 'content' && (
				<div className="space-y-6">
					<div>
						<h2 className="text-2xl font-semibold mb-2">Content Schedule</h2>
						<p className="text-text-dim">
							View all your approved and scheduled content. Content is automatically published at the scheduled time.
						</p>
					</div>

					{/* Quick Stats */}
					<div className="grid grid-cols-1 md:grid-cols-3 gap-4">
						<div className="card p-4">
							<div className="flex items-center justify-between mb-2">
								<span className="text-sm text-text-dim">Ready To Publish</span>
								<Check className="w-4 h-4 text-accent" />
							</div>
							<div className="text-2xl font-bold text-accent">{readyToPublish.length}</div>
						</div>
						<div className="card p-4">
							<div className="flex items-center justify-between mb-2">
								<span className="text-sm text-text-dim">Scheduled</span>
								<Clock className="w-4 h-4 text-primary" />
							</div>
							<div className="text-2xl font-bold text-primary">{scheduled.length}</div>
						</div>
						<div className="card p-4">
							<div className="flex items-center justify-between mb-2">
								<span className="text-sm text-text-dim">Published</span>
								<FileText className="w-4 h-4 text-primary" />
							</div>
							<div className="text-2xl font-bold text-primary">{published.length}</div>
						</div>
					</div>

					{/* Content List */}
					{loading ? (
						<div className="card p-6 text-center">
							<p className="text-text-dim">Loading content...</p>
						</div>
					) : contentItems.length === 0 ? (
						<div className="card p-8 text-center">
							<FileText className="w-12 h-12 text-text-dim mx-auto mb-4" />
							<p className="text-text-soft mb-2">No content yet</p>
							<p className="text-sm text-text-dim">
								Approve content from the{' '}
								<Link href="/content/approval" className="text-primary hover:underline">
									approval queue
								</Link>{' '}
								to see it here
							</p>
						</div>
					) : (
						<div className="space-y-4">
							{/* Ready To Publish Section */}
							{readyToPublish.length > 0 && (
								<div>
									<h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
										<Check className="w-5 h-5 text-accent" />
										Ready To Publish ({readyToPublish.length})
									</h3>
									<div className="space-y-3">
										{readyToPublish.map((item) => (
											<div key={item.id} className="card p-4 hover:bg-surface/50 transition">
												{editingItem === item.id ? (
													// Edit mode
													<div className="space-y-4">
														<div>
															<label className="block text-sm font-medium text-text-dim mb-1">Title (Hook)</label>
															<input
																type="text"
																value={editingTitle}
																onChange={(e) => setEditingTitle(e.target.value)}
																className="w-full px-3 py-2 rounded-lg border border-edge/60 bg-surface/30 text-text focus:outline-none focus:ring-2 focus:ring-primary/50"
																placeholder="Enter post title..."
															/>
														</div>
														<div>
															<label className="block text-sm font-medium text-text-dim mb-1">Content</label>
															<textarea
																value={editingContent}
																onChange={(e) => setEditingContent(e.target.value)}
																rows={6}
																className="w-full px-3 py-2 rounded-lg border border-edge/60 bg-surface/30 text-text focus:outline-none focus:ring-2 focus:ring-primary/50 resize-y"
																placeholder="Enter post content..."
															/>
														</div>
														<div>
															<label className="block text-sm font-medium text-text-dim mb-1">Hashtags</label>
															<input
																type="text"
																value={editingHashtags}
																onChange={(e) => setEditingHashtags(e.target.value)}
																className="w-full px-3 py-2 rounded-lg border border-edge/60 bg-surface/30 text-text focus:outline-none focus:ring-2 focus:ring-primary/50"
																placeholder="#hashtag1 #hashtag2"
															/>
														</div>
														<div className="flex gap-2 justify-end">
															<button
																onClick={cancelEdit}
																disabled={saving}
																className="px-4 py-2 rounded-lg border border-edge/60 bg-surface/30 hover:bg-surface/50 text-sm disabled:opacity-50"
															>
																Cancel
															</button>
															<button
																onClick={() => saveEdit(item.id)}
																disabled={saving}
																className="px-4 py-2 rounded-lg bg-primary/10 hover:bg-primary/20 border border-primary/30 text-primary text-sm font-medium disabled:opacity-50 flex items-center gap-2"
															>
																{saving ? (
																	<>
																		<Loader2 className="w-4 h-4 animate-spin" />
																		Saving...
																	</>
																) : (
																	<>
																		<Save className="w-4 h-4" />
																		Save
																	</>
																)}
															</button>
														</div>
													</div>
												) : (
													// View mode
													<div className="flex items-start justify-between gap-4">
														<div className="flex-1 min-w-0">
															<div className="flex items-center gap-2 mb-2 flex-wrap">
																<h4 className="font-semibold text-text truncate">{item.title}</h4>
																<span className="px-2 py-0.5 rounded text-xs bg-primary/15 text-primary">
																	{item.platform}
																</span>
																{item.content_type && (
																	<span className="px-2 py-0.5 rounded text-xs bg-surface/50 text-text-soft">
																		{item.content_type}
																	</span>
																)}
															</div>
															<div className="flex items-center gap-3 text-sm text-text-dim">
																<span>{item.brand_name}</span>
																{item.scheduled_date ? (
																	<span className="flex items-center gap-2 flex-wrap">
																		<span className="flex items-center gap-1">
																			<Clock className="w-3 h-3" />
																			{formatScheduledDateTime(item.scheduled_date)}
																		</span>
																		{formatCountdown(item.scheduled_date) && (
																			<span className="px-2 py-0.5 rounded-full text-xs bg-primary/10 border border-primary/30 text-primary">
																				{formatCountdown(item.scheduled_date)}
																			</span>
																		)}
																	</span>
																) : (
																	<span className="text-warning">Publishing soon</span>
																)}
															</div>
														</div>
														<div className="flex items-center gap-2">
															<button
																onClick={() => startEdit(item)}
																className="p-2 rounded-lg border border-edge/60 bg-surface/30 hover:bg-surface/50 transition-colors"
																title="Edit"
															>
																<Edit2 className="w-4 h-4 text-text-dim hover:text-primary" />
															</button>
															<button
																onClick={() => handleDeleteClick(item)}
																className="p-2 rounded-lg border border-edge/60 bg-surface/30 hover:bg-surface/50 hover:border-warning/50 transition-colors"
																title="Delete"
															>
																<Trash2 className="w-4 h-4 text-text-dim hover:text-warning" />
															</button>
														</div>
													</div>
												)}
											</div>
										))}
									</div>
								</div>
							)}

							{/* Published Section */}
							{published.length > 0 && (
								<div>
									<h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
										<FileText className="w-5 h-5 text-primary" />
										Published ({published.length})
									</h3>
									<div className="space-y-3">
										{published.slice(0, 5).map((item) => {
											const isExpanded = expandedPublished.has(item.id);
											return (
												<div key={item.id} className="card p-4 hover:bg-surface/50 transition">
													<div className="flex items-start justify-between gap-4">
														<div className="flex-1 min-w-0">
															<div className="flex items-center gap-2 mb-2 flex-wrap">
																<h4 className="font-semibold text-text truncate">{item.title}</h4>
																<span className="px-2 py-0.5 rounded text-xs bg-primary/15 text-primary">
																	{item.platform}
																</span>
																{item.content_type && (
																	<span className="px-2 py-0.5 rounded text-xs bg-surface/50 text-text-soft">
																		{item.content_type}
																	</span>
																)}
															</div>
															<div className="flex items-center gap-3 text-sm text-text-dim">
																<span>{item.brand_name}</span>
																{item.published_at && (
																	<span>
																		Published {new Date(item.published_at).toLocaleDateString()}
																	</span>
																)}
															</div>
														</div>
														<button
															onClick={() => togglePublishedExpanded(item.id)}
															className="px-3 py-1.5 rounded-xl2 border border-edge/60 bg-surface/30 hover:bg-surface/50 text-sm whitespace-nowrap flex items-center gap-2"
														>
															{isExpanded ? (
																<>
																	<ChevronUp className="w-4 h-4" />
																	Hide
																</>
															) : (
																<>
																	<ChevronDown className="w-4 h-4" />
																	View
																</>
															)}
														</button>
													</div>
													{isExpanded && (
														<div className="mt-4 pt-4 border-t border-edge/30 space-y-3">
															{item.content && (
																<div>
																	<h5 className="text-sm font-medium text-text-dim mb-2">Content</h5>
																	<p className="text-text-soft whitespace-pre-wrap">{item.content}</p>
																</div>
															)}
															{item.hashtags && (
																<div>
																	<h5 className="text-sm font-medium text-text-dim mb-2">Hashtags</h5>
																	<p className="text-text-soft break-words">{item.hashtags}</p>
																</div>
															)}
														</div>
													)}
												</div>
											);
										})}
										{published.length > 5 && (
											<Link
												href="/content/published"
												className="block text-center text-sm text-primary hover:underline py-2"
											>
												View all {published.length} published items →
											</Link>
										)}
									</div>
								</div>
							)}
						</div>
					)}

					{/* Quick Action */}
					<div className="card p-4 bg-primary/5 border border-primary/20">
						<div className="flex items-center justify-between">
							<div>
								<h3 className="font-semibold mb-1">Need to review content?</h3>
								<p className="text-sm text-text-dim">Approve or edit content waiting for review</p>
							</div>
							<Link
								href="/content/approval"
								className="px-4 py-2 rounded-xl2 bg-primary/10 hover:bg-primary/20 border border-primary/30 text-primary font-medium"
							>
								Review Content
							</Link>
						</div>
					</div>
				</div>
			)}

			{/* Delete Confirmation Modal */}
			<DeleteConfirmationModal
				isOpen={deleteModalOpen}
				onClose={handleDeleteCancel}
				onConfirm={handleDeleteConfirm}
				title="Delete Post?"
				itemName={itemToDelete?.title}
				isDeleting={isDeleting}
			/>
		</div>
	);
}
