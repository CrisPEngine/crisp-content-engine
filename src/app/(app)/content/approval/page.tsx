'use client';

import { useState, useEffect } from 'react';
import { useSupabase } from '@/components/SupabaseProvider';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Check, X, Eye, Loader2, Calendar } from 'lucide-react';

type ContentItem = {
	id: string;
	title: string;
	platform: string;
	content: string;
	status: string;
	scheduled_date?: string;
	created_at: string;
	brand_name: string;
};

export default function ContentApprovalPage() {
	const supabase = useSupabase();
	const router = useRouter();
	const [loading, setLoading] = useState(true);
	const [contentItems, setContentItems] = useState<ContentItem[]>([]);
	const [selectedItem, setSelectedItem] = useState<ContentItem | null>(null);
	const [approving, setApproving] = useState<string | null>(null);
	const [rejecting, setRejecting] = useState<string | null>(null);

	useEffect(() => {
		if (!supabase) return;
		loadContent();
	}, [supabase]);

	async function loadContent() {
		if (!supabase) return;
		setLoading(true);
		try {
			const { data: { user } } = await supabase.auth.getUser();
			if (!user) {
				router.push('/login');
				return;
			}

			// TODO: Replace with actual API call
			// const res = await fetch('/api/content/approval');
			// const data = await res.json();
			// setContentItems(data.items);

			// Placeholder data
			setContentItems([
				{
					id: '1',
					title: 'LinkedIn Post - Product Launch',
					platform: 'LinkedIn',
					content: 'Excited to announce our new product...',
					status: 'Needs Approval',
					scheduled_date: '2025-01-15T10:00:00Z',
					created_at: new Date().toISOString(),
					brand_name: 'Example Brand',
				},
			]);
		} catch (error) {
			console.error('Failed to load content:', error);
		} finally {
			setLoading(false);
		}
	}

	async function approveContent(id: string) {
		if (!supabase) return;
		setApproving(id);
		try {
			// TODO: Replace with actual API call
			// await fetch(`/api/content/${id}/approve`, { method: 'POST' });
			
			// Update status in Airtable to "Approved" or "Ready To Publish"
			setContentItems(items => items.filter(item => item.id !== id));
			alert('Content approved!');
		} catch (error) {
			console.error('Failed to approve content:', error);
			alert('Failed to approve content. Please try again.');
		} finally {
			setApproving(null);
		}
	}

	async function rejectContent(id: string) {
		if (!supabase) return;
		setRejecting(id);
		try {
			// TODO: Replace with actual API call
			// await fetch(`/api/content/${id}/reject`, { method: 'POST' });
			
			// Update status in Airtable to "Needs Review" or "Needs Copy"
			setContentItems(items => items.filter(item => item.id !== id));
			alert('Content rejected. Status updated.');
		} catch (error) {
			console.error('Failed to reject content:', error);
			alert('Failed to reject content. Please try again.');
		} finally {
			setRejecting(null);
		}
	}

	if (loading) {
		return (
			<div className="mx-auto max-w-6xl">
				<div className="card p-8 text-center">
					<Loader2 className="w-8 h-8 text-primary animate-spin mx-auto mb-4" />
					<p className="text-text-soft">Loading content...</p>
				</div>
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

			<div className="mb-6">
				<h1 className="text-3xl font-semibold mb-2">Content Approval Queue</h1>
				<p className="text-text-dim">
					Review and approve content before it's published
				</p>
			</div>

			{contentItems.length === 0 ? (
				<div className="card p-8 text-center">
					<p className="text-text-soft">No content pending approval</p>
				</div>
			) : (
				<div className="space-y-4">
					{contentItems.map((item) => (
						<motion.div
							key={item.id}
							initial={{ opacity: 0, y: 20 }}
							animate={{ opacity: 1, y: 0 }}
							className="card p-6 space-y-4"
						>
							<div className="flex items-start justify-between">
								<div className="flex-1">
									<div className="flex items-center gap-3 mb-2">
										<h3 className="text-lg font-semibold">{item.title}</h3>
										<span className="px-2 py-1 rounded-full text-xs bg-primary/15 border border-primary/30 text-primary">
											{item.platform}
										</span>
										<span className="px-2 py-1 rounded-full text-xs bg-warning/15 border border-warning/30 text-warning">
											{item.status}
										</span>
									</div>
									<p className="text-sm text-text-dim mb-2">
										Brand: {item.brand_name}
									</p>
									{item.scheduled_date && (
										<div className="flex items-center gap-2 text-sm text-text-dim">
											<Calendar className="w-4 h-4" />
											<span>
												Scheduled: {new Date(item.scheduled_date).toLocaleString()}
											</span>
										</div>
									)}
								</div>
								<button
									onClick={() => setSelectedItem(selectedItem?.id === item.id ? null : item)}
									className="px-3 py-2 rounded-xl2 border border-edge/60 bg-surface/30 hover:bg-surface/50 flex items-center gap-2"
								>
									<Eye className="w-4 h-4" />
									{selectedItem?.id === item.id ? 'Hide' : 'View'}
								</button>
							</div>

							{selectedItem?.id === item.id && (
								<div className="rounded-xl2 border border-edge/60 bg-bg/80 p-4 mt-4">
									<div className="prose prose-invert max-w-none text-text whitespace-pre-wrap">
										{item.content}
									</div>
								</div>
							)}

							<div className="flex gap-3 pt-4 border-t border-edge/60">
								<button
									onClick={() => approveContent(item.id)}
									disabled={approving === item.id || rejecting === item.id}
									className="flex-1 px-4 py-2 rounded-xl2 border border-accent/40 bg-accent/10 hover:bg-accent/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
								>
									{approving === item.id ? (
										<Loader2 className="w-4 h-4 animate-spin" />
									) : (
										<Check className="w-4 h-4" />
									)}
									Approve
								</button>
								<button
									onClick={() => rejectContent(item.id)}
									disabled={approving === item.id || rejecting === item.id}
									className="flex-1 px-4 py-2 rounded-xl2 border border-danger/40 bg-danger/10 hover:bg-danger/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
								>
									{rejecting === item.id ? (
										<Loader2 className="w-4 h-4 animate-spin" />
									) : (
										<X className="w-4 h-4" />
									)}
									Reject
								</button>
							</div>
						</motion.div>
					))}
				</div>
			)}
		</div>
	);
}

