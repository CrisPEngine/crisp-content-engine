'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Calendar, FileText, Clock, Check, X, Loader2 } from 'lucide-react';
import Link from 'next/link';

type ContentItem = {
	id: string;
	title: string;
	platform: string;
	status: string;
	content_type?: string;
	scheduled_date?: string | null;
	published_at?: string | null;
	brand_name: string;
};

type Tab = 'overview' | 'content';

interface DashboardTabsProps {
	activeTab: Tab;
	contentItems?: ContentItem[];
	loading?: boolean;
}

function formatScheduledDate(dateString: string | null | undefined): string {
	if (!dateString) return 'Not scheduled';
	try {
		const date = new Date(dateString);
		const now = new Date();
		const diffMs = date.getTime() - now.getTime();
		const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
		const diffDays = Math.floor(diffHours / 24);

		if (diffMs < 0) {
			return 'Past due';
		} else if (diffHours < 1) {
			return 'Within 1 hour';
		} else if (diffHours < 24) {
			return `In ${diffHours} hour${diffHours !== 1 ? 's' : ''}`;
		} else if (diffDays < 7) {
			return `In ${diffDays} day${diffDays !== 1 ? 's' : ''}`;
		} else {
			return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
		}
	} catch {
		return 'Invalid date';
	}
}

export function DashboardTabs({ activeTab, contentItems: initialContentItems = [], loading: initialLoading = false }: DashboardTabsProps) {
	const router = useRouter();
	const [contentItems, setContentItems] = useState<ContentItem[]>(initialContentItems);
	const [loading, setLoading] = useState(initialLoading);

	// Fetch content when Content tab is active
	useEffect(() => {
		if (activeTab === 'content' && contentItems.length === 0 && !loading) {
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
	}, [activeTab, contentItems.length, loading]);

	const readyToPublish = contentItems.filter((item) => item.status === 'Ready To Publish');
	const published = contentItems.filter((item) => item.status === 'Published');
	const scheduled = contentItems.filter(
		(item) => item.scheduled_date && new Date(item.scheduled_date) > new Date()
	);

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
																<span className="flex items-center gap-1">
																	<Clock className="w-3 h-3" />
																	{formatScheduledDate(item.scheduled_date)}
																</span>
															) : (
																<span className="text-warning">Publishing soon</span>
															)}
														</div>
													</div>
													<Link
														href="/content/approval"
														className="px-3 py-1.5 rounded-xl2 border border-edge/60 bg-surface/30 hover:bg-surface/50 text-sm whitespace-nowrap"
													>
														View
													</Link>
												</div>
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
										{published.slice(0, 5).map((item) => (
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
													<Link
														href="/content/approval"
														className="px-3 py-1.5 rounded-xl2 border border-edge/60 bg-surface/30 hover:bg-surface/50 text-sm whitespace-nowrap"
													>
														View
													</Link>
												</div>
											</div>
										))}
										{published.length > 5 && (
											<Link
												href="/content/approval"
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
		</div>
	);
}

