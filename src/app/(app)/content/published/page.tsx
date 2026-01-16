'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSupabase } from '@/components/SupabaseProvider';
import { useRouter } from 'next/navigation';
import { Calendar, CheckCircle } from 'lucide-react';
import { Skeleton, ContentItemSkeleton } from '@/components/skeletons/Skeleton';

type PublishedContent = {
	id: string;
	title: string;
	platform: string;
	published_at?: string | null;
	created_time?: string;
	brand_name: string;
	content_preview: string;
};

export default function PublishedContentPage() {
	const supabase = useSupabase();
	const router = useRouter();
	const [loading, setLoading] = useState(true);
	const [items, setItems] = useState<PublishedContent[]>([]);
	const [error, setError] = useState<string | null>(null);

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
				router.push('/login');
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
			return new Date(aDate).getTime() - new Date(bDate).getTime();
		});
	}, [items]);

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
					All published posts in chronological order
				</p>
			</div>

			{error && (
				<div className="border border-danger/30 bg-danger/10 text-danger text-sm rounded-xl2 p-3 mb-4">
					{error}
				</div>
			)}

			{sortedItems.length === 0 ? (
				<div className="card p-8 text-center">
					<Calendar className="w-12 h-12 text-text-dim mx-auto mb-4" />
					<p className="text-text-soft">No published content yet</p>
				</div>
			) : (
				<div className="space-y-4">
					{sortedItems.map((item) => (
						<div key={item.id} className="card p-6">
							<div className="flex items-start justify-between">
								<div className="flex-1">
									<div className="flex items-center gap-3 mb-2">
										<CheckCircle className="w-4 h-4 text-accent" />
										<h3 className="text-lg font-semibold">{item.title}</h3>
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
									<p className="text-sm text-text-soft line-clamp-3">
										{item.content_preview}
									</p>
								</div>
							</div>
						</div>
					))}
				</div>
			)}
		</div>
	);
}

