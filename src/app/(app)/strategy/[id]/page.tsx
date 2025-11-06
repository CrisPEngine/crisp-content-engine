'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useSupabase } from '@/components/SupabaseProvider';
import { motion } from 'framer-motion';
import { Check, X, Edit, Loader2 } from 'lucide-react';

export default function StrategyReviewPage() {
	const params = useParams();
	const router = useRouter();
	const supabase = useSupabase();
	const [loading, setLoading] = useState(true);
	const [strategy, setStrategy] = useState<any>(null);
	const [approving, setApproving] = useState(false);
	const [rejecting, setRejecting] = useState(false);
	const [editing, setEditing] = useState(false);
	const [editedContent, setEditedContent] = useState('');

	useEffect(() => {
		if (!supabase) return;
		loadStrategy();
	}, [supabase, params.id]);

	async function loadStrategy() {
		if (!supabase || !params.id) return;
		setLoading(true);
		try {
			// In a real app, you'd fetch from Airtable or your API
			// For now, this is a placeholder structure
			const { data: { user } } = await supabase.auth.getUser();
			if (!user) {
				router.push('/login');
				return;
			}

			// TODO: Replace with actual API call to fetch strategy
			// const res = await fetch(`/api/strategy/${params.id}`);
			// const data = await res.json();
			// setStrategy(data);

			// Placeholder data
			setStrategy({
				id: params.id,
				brand_name: 'Example Brand',
				status: 'Strategy Ready (Awaiting Approval)',
				content: 'This is the generated strategy content...',
				created_at: new Date().toISOString(),
			});
		} catch (error) {
			console.error('Failed to load strategy:', error);
		} finally {
			setLoading(false);
		}
	}

	async function approveStrategy() {
		if (!supabase || !strategy) return;
		setApproving(true);
		try {
			// TODO: Replace with actual API call
			// await fetch(`/api/strategy/${strategy.id}/approve`, { method: 'POST' });
			
			// Update status in Airtable
			alert('Strategy approved! Status will be updated.');
			router.push('/dashboard');
		} catch (error) {
			console.error('Failed to approve strategy:', error);
			alert('Failed to approve strategy. Please try again.');
		} finally {
			setApproving(false);
		}
	}

	async function rejectStrategy() {
		if (!supabase || !strategy) return;
		setRejecting(true);
		try {
			// TODO: Replace with actual API call
			// await fetch(`/api/strategy/${strategy.id}/reject`, { method: 'POST' });
			
			// Update status in Airtable to "Needs Strategy"
			alert('Strategy rejected. Status will be updated to "Needs Strategy".');
			router.push('/dashboard');
		} catch (error) {
			console.error('Failed to reject strategy:', error);
			alert('Failed to reject strategy. Please try again.');
		} finally {
			setRejecting(false);
		}
	}

	async function saveEdit() {
		if (!strategy) return;
		try {
			// TODO: Replace with actual API call
			// await fetch(`/api/strategy/${strategy.id}`, {
			// 	method: 'PATCH',
			// 	body: JSON.stringify({ content: editedContent }),
			// });
			
			setStrategy({ ...strategy, content: editedContent });
			setEditing(false);
			alert('Strategy updated successfully!');
		} catch (error) {
			console.error('Failed to save edit:', error);
			alert('Failed to save changes. Please try again.');
		}
	}

	if (loading) {
		return (
			<div className="mx-auto max-w-4xl">
				<div className="card p-8 text-center">
					<Loader2 className="w-8 h-8 text-primary animate-spin mx-auto mb-4" />
					<p className="text-text-soft">Loading strategy...</p>
				</div>
			</div>
		);
	}

	if (!strategy) {
		return (
			<div className="mx-auto max-w-4xl">
				<div className="card p-8 text-center">
					<p className="text-danger">Strategy not found</p>
					<button
						onClick={() => router.push('/dashboard')}
						className="mt-4 px-4 py-2 rounded-xl2 border border-primary/40 bg-primary/10 hover:bg-primary/20"
					>
						Back to Dashboard
					</button>
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
					← Back
				</button>
			</div>

			<motion.div
				initial={{ opacity: 0, y: 20 }}
				animate={{ opacity: 1, y: 0 }}
				className="card p-8 space-y-6"
			>
				<div className="flex items-center justify-between">
					<div>
						<h1 className="text-3xl font-semibold mb-2">Strategy Review</h1>
						<p className="text-text-dim">
							Brand: <span className="font-medium text-text">{strategy.brand_name}</span>
						</p>
						<p className="text-sm text-text-dim mt-1">
							Status: <span className="font-medium">{strategy.status}</span>
						</p>
					</div>
					{!editing && (
						<button
							onClick={() => {
								setEditedContent(strategy.content);
								setEditing(true);
							}}
							className="px-4 py-2 rounded-xl2 border border-edge/60 bg-surface/30 hover:bg-surface/50 flex items-center gap-2"
						>
							<Edit className="w-4 h-4" />
							Edit
						</button>
					)}
				</div>

				<div>
					<label className="block text-sm font-medium mb-2">Strategy Content</label>
					{editing ? (
						<div className="space-y-3">
							<textarea
								value={editedContent}
								onChange={(e) => setEditedContent(e.target.value)}
								rows={20}
								className="w-full rounded-xl2 border border-edge/60 bg-bg/80 px-4 py-3 text-text focus:border-primary/60 focus:outline-none focus:ring-1 focus:ring-primary/20 resize-none"
							/>
							<div className="flex gap-2">
								<button
									onClick={saveEdit}
									className="px-4 py-2 rounded-xl2 border border-primary/40 bg-primary/10 hover:bg-primary/20"
								>
									Save Changes
								</button>
								<button
									onClick={() => setEditing(false)}
									className="px-4 py-2 rounded-xl2 border border-edge/60 bg-surface/30 hover:bg-surface/50"
								>
									Cancel
								</button>
							</div>
						</div>
					) : (
						<div className="rounded-xl2 border border-edge/60 bg-bg/80 p-6">
							<div className="prose prose-invert max-w-none text-text whitespace-pre-wrap">
								{strategy.content}
							</div>
						</div>
					)}
				</div>

				{!editing && (
					<div className="flex gap-3 pt-4 border-t border-edge/60">
						<button
							onClick={approveStrategy}
							disabled={approving}
							className="flex-1 px-6 py-3 rounded-xl2 border border-accent/40 bg-accent/10 hover:bg-accent/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
						>
							{approving ? (
								<Loader2 className="w-5 h-5 animate-spin" />
							) : (
								<Check className="w-5 h-5" />
							)}
							Approve Strategy
						</button>
						<button
							onClick={rejectStrategy}
							disabled={rejecting}
							className="flex-1 px-6 py-3 rounded-xl2 border border-danger/40 bg-danger/10 hover:bg-danger/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
						>
							{rejecting ? (
								<Loader2 className="w-5 h-5 animate-spin" />
							) : (
								<X className="w-5 h-5" />
							)}
							Reject & Request Revision
						</button>
					</div>
				)}
			</motion.div>
		</div>
	);
}

