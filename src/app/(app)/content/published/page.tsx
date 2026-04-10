'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSupabase } from '@/components/SupabaseProvider';
import { useRouter } from 'next/navigation';
import { Calendar, CheckCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { Skeleton, ContentItemSkeleton } from '@/components/skeletons/Skeleton';

type PublishedContent = {
	id: string;
	title: string;
	platform: string;
	published_at?: string | null;
	created_time?: string;
	brand_name: string;
	content_preview: string;
	content: string;
	hashtags?: string;
	image_reference_url?: string;
};

export default function PublishedContentPage() {
	const supabase = useSupabase();
	const router = useRouter();
	const [loading, setLoading] = useState(true);
	const [items, setItems] = useState<PublishedContent[]>([]);
	const [error, setError] = useState<string | null>(null);
	const [expanded, setExpanded] = useState<Set<string>>(new Set());
	const [page, setPage] = useState(1);
	const pageSize = 20;

	useEffect(() => {
		if (!supabase) return;
		loadPublished();
	}, [supabase]);

	async function loadPublished() {
		if (!supabase) return;
		setLoading(true);
		setError(null);
		try {
			const {
				data: { user },
				error: userErr,
			} = await supabase.auth.getUser();
			if (userErr || !user) {
				router.push('/sign-in');
				return;
			}

			const res = await fetch('/api/content/queue?status=Published', { cache: 'no-store' });
			if (!res.ok) {
				const data = await res.json().catch(() => ({}));
				throw new Error(data?.error || 'Failed to load published content');
			}
			const data = await res.json();
			const publishedItems: PublishedContent[] = (data.items || []).map((item: any) => ({
				id: item.id,
				title: item.title,
				platform: item.platform,
				published_at: item.published_at || null,
				created_time: item.created_time,
				brand_name: item.brand_name,
				content_preview: item.summary || item.content || '',
				content: item.content || '',
				hashtags: item.hashtags || '',
				image_reference_url: item.image_reference_url || '',
			}));
			setItems(publishedItems);
		} catch (err: any) {
			console.error('Failed to load published content:', err);
			setError(err.message || 'Failed to load published content');
		} finally {
			setLoading(false);
		}
	}

	const sortedItems = useMemo(() => {
		return [...items].sort((a, b) => {
			const aDate = a.published_at || a.created_time || '';
			const bDate = b.published_at || b.created_time || '';
			return new Date(bDate).getTime() - new Date(aDate).getTime();
		});
	}, [items]);

	const totalPages = Math.max(1, Math.ceil(sortedItems.length / pageSize));
	const pagedItems = useMemo(() => {
		const start = (page - 1) * pageSize;
		return sortedItems.slice(start, start + pageSize);
	}, [sortedItems, page]);

	useEffect(() => {
		if (page > totalPages) {
			setPage(totalPages);
		}
	}, [page, totalPages]);

	function toggleExpanded(id: string) {
		setExpanded((prev) => {
			const next = new Set(prev);
			if (next.has(id)) {
				next.delete(id);
			} else {
				next.add(id);
			}
			return next;
		});
	}

	function formatDate(dateString: string | null | undefined): string {
		if (!dateString) return 'Unknown date';
		try {
			return new Date(dateString).toLocaleDateString('en-US', {
				month: 'short',
				day: 'numeric',
				year: 'numeric',
			});
		} catch {
			return 'Invalid date';
		}
	}

	if (loading) {
		return (
			<div className="mx-auto max-w-6xl space-y-4">
				<div className="mb-6">
					<Skeleton height="20px" width="80px" />
				</div>
				<div className="mb-6 space-y-3">
					<div className="space-y-2">
						<Skeleton height="32px" width="260px" />
						<Skeleton height="16px" width="320px" />
					</div>
				</div>
				{Array.from({ length: 4 }).map((_, i) => (
					<ContentItemSkeleton key={i} />
				))}
			</div>
		);
	}

	return (
		<div className="mx-auto max-w-6xl">
			<div className="mb-6">
				<button
					onClick={() => router.back()}
					className="text-text-soft hover:text-text text-sm inline-flex items-center gap-1"
				>
					← Back
				</button>
			</div>

			<div className="mb-6 space-y-2">
				<h1 className="text-3xl font-semibold">Published Content</h1>
				<p className="text-text-dim">
					All published posts (newest first)
				</p>
			</div>

			{error && (
				<div className="border border-danger/30 bg-danger/10 text-danger text-sm rounded-xl2 p-3 mb-4">
					{error}
				</div>
			)}

		{sortedItems.length === 0 ? (
			<div className="card p-10 text-center flex flex-col items-center gap-4">
				<div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center">
					<CheckCircle className="w-6 h-6 text-primary/50" />
				</div>
				<div>
					<p className="font-semibold text-text mb-1">No published content yet</p>
					<p className="text-sm text-text-dim max-w-sm mx-auto">Your published posts will appear here. Approve and schedule content to start building your published library.</p>
				</div>
				<div className="flex flex-wrap gap-3 justify-center">
					<a
						href="/content/approval"
						className="px-4 py-2 rounded-xl2 bg-primary/10 hover:bg-primary/20 border border-primary/30 text-primary font-medium text-sm transition-colors"
					>
						Review Drafts
					</a>
					<a
						href="/content/idea-engine"
						className="px-4 py-2 rounded-xl2 bg-accent/10 hover:bg-accent/20 border border-accent/30 text-accent font-medium text-sm transition-colors"
					>
						💡 Idea Engine
					</a>
				</div>
			</div>
			) : (
				<div className="space-y-4">
					{pagedItems.map((item) => (
						<div key={item.id} className="card p-6">
							<div className="flex items-start justify-between">
								<div className="flex-1 min-w-0">
									<div className="flex items-center gap-3 mb-2">
										<CheckCircle className="w-4 h-4 text-accent" />
										<h3 className="text-lg font-semibold truncate">{item.title}</h3>
										<span className="px-2 py-1 rounded-full text-xs bg-primary/15 border border-primary/30 text-primary">
											{item.platform}
										</span>
									</div>
									<p className="text-sm text-text-dim mb-2">
										Brand: {item.brand_name}
									</p>
									<div className="flex items-center gap-2 text-sm text-text-dim mb-2">
										<Calendar className="w-4 h-4" />
										<span>Published {formatDate(item.published_at)}</span>
									</div>
									{expanded.has(item.id) ? (
										<div className="space-y-3">
											{item.content && (
												<div>
													<h5 className="text-sm font-medium text-text-dim mb-1">Content</h5>
													<p className="text-text-soft whitespace-pre-wrap">{item.content}</p>
												</div>
											)}
											{item.hashtags && (
												<div>
													<h5 className="text-sm font-medium text-text-dim mb-1">Hashtags</h5>
													<p className="text-text-soft break-words">{item.hashtags}</p>
												</div>
											)}
										</div>
									) : (
										<p className="text-sm text-text-soft line-clamp-3">
											{item.content_preview}
										</p>
									)}
								</div>
								<div className="flex items-center gap-3 ml-4">
									{item.image_reference_url && (
										<img
											src={item.image_reference_url}
											alt="Post image"
											className="h-16 w-16 rounded-lg object-cover border border-edge/60"
											onError={(e) => {
												const target = e.target as HTMLImageElement;
												target.style.display = 'none';
											}}
										/>
									)}
									<button
										onClick={() => toggleExpanded(item.id)}
										className="px-3 py-1.5 rounded-xl2 border border-edge/60 bg-surface/30 hover:bg-surface/50 text-sm whitespace-nowrap flex items-center gap-2"
									>
										{expanded.has(item.id) ? (
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
							</div>
						</div>
					))}
					{totalPages > 1 && (
						<div className="flex items-center justify-between pt-2">
							<button
								onClick={() => setPage((p) => Math.max(1, p - 1))}
								disabled={page === 1}
								className="px-4 py-2 rounded-xl2 border border-edge/60 bg-surface/30 hover:bg-surface/50 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
							>
								Previous
							</button>
							<div className="text-sm text-text-dim">
								Page {page} of {totalPages}
							</div>
							<button
								onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
								disabled={page === totalPages}
								className="px-4 py-2 rounded-xl2 border border-edge/60 bg-surface/30 hover:bg-surface/50 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
							>
								Next
							</button>
						</div>
					)}
				</div>
			)}
		</div>
	);
}

