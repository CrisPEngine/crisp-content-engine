'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useSupabase } from '@/components/SupabaseProvider';
import { motion } from 'framer-motion';
import { Check, Edit, AlertCircle, Loader2 } from 'lucide-react';
import { ContentGenerationLoading } from '@/components/ContentGenerationLoading';
import { Skeleton } from '@/components/skeletons/Skeleton';

export default function StrategyReviewPage() {
	const params = useParams();
	const router = useRouter();
	const supabase = useSupabase();
	const [loading, setLoading] = useState(true);
	const [strategy, setStrategy] = useState<any>(null);
	const [approving, setApproving] = useState(false);
	const [editing, setEditing] = useState(false);
	const [editedContent, setEditedContent] = useState('');
	const [showLoading, setShowLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		if (!supabase) return;
		loadStrategy();
	}, [supabase, params.id]);

	async function loadStrategy() {
		if (!supabase || !params.id) return;
		setLoading(true);
		setError(null);
		try {
			const { data: { user } } = await supabase.auth.getUser();
			if (!user) {
				router.push('/login');
				return;
			}

			const res = await fetch(`/api/strategy/${params.id}`, { cache: 'no-store' });
			if (!res.ok) {
				const data = await res.json().catch(() => ({}));
				throw new Error(data?.error || 'Failed to load strategy');
			}
			const data = await res.json();
			setStrategy(data);
		} catch (err: any) {
			console.error('Failed to load strategy:', err);
			setError(err.message || 'Failed to load strategy');
		} finally {
			setLoading(false);
		}
	}

	async function approveStrategy() {
		if (!supabase || !strategy) return;
		setApproving(true);
		setError(null);
		try {
			const res = await fetch(`/api/strategy/${strategy.id}/approve`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					strategy_content: editedContent || strategy.content,
				}),
			});

			const data = await res.json();

			if (!res.ok) {
				if (data.requiresConnection) {
					setError('Please connect your LinkedIn account first. Redirecting...');
					setTimeout(() => {
						router.push('/connections');
					}, 2000);
					return;
				}
				
				// Show detailed error with hint if available
				let errorMessage = data?.error || 'Failed to approve strategy';
				if (data?.hint) {
					errorMessage += `\n\n${data.hint}`;
				}
				if (data?.details) {
					console.error('Strategy approval error details:', data.details);
				}
				throw new Error(errorMessage);
			}

			// Show loading animation
			setShowLoading(true);
			// Redirect to content approval with generating flag after loading completes
			setTimeout(() => {
				router.push('/content/approval?generating=true');
			}, 6000); // After loading animation completes
		} catch (err: any) {
			console.error('Failed to approve strategy:', err);
			setError(err.message || 'Failed to approve strategy. Please try again.');
			setApproving(false);
		}
	}

	async function saveEdit() {
		if (!strategy || !supabase) return;
		try {
			// Save the edited summary to Airtable
			const res = await fetch(`/api/strategy/${strategy.id}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					strategy_summary: editedContent,
				}),
			});

			const data = await res.json();

			if (!res.ok) {
				throw new Error(data?.error || 'Failed to save strategy');
			}

			// Update local state
			setStrategy({ ...strategy, content: editedContent, strategy_summary: editedContent });
			setEditing(false);
		} catch (error: any) {
			console.error('Failed to save edit:', error);
			setError(error.message || 'Failed to save changes. Please try again.');
		}
	}

	function handleContentGenerationComplete() {
		router.push('/content/approval');
	}

	if (loading) {
		return (
			<div className="mx-auto max-w-4xl">
				<div className="mb-6">
					<Skeleton height="20px" width="80px" />
				</div>
				<div className="card p-8 space-y-6">
					<div className="space-y-3">
						<Skeleton height="32px" width="250px" />
						<Skeleton height="20px" width="200px" />
						<Skeleton height="16px" width="150px" />
					</div>
					<div className="space-y-4">
						<Skeleton height="20px" width="120px" />
						<Skeleton height="400px" width="100%" />
					</div>
					<div className="pt-4 border-t border-edge/60">
						<Skeleton height="48px" width="100%" className="rounded-xl2" />
					</div>
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

	if (showLoading) {
		return <ContentGenerationLoading onComplete={handleContentGenerationComplete} />;
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

			{error && (
				<div className="mb-6 card p-4 border-danger/40 bg-danger/10 flex items-start gap-3">
					<AlertCircle className="w-5 h-5 text-danger flex-shrink-0 mt-0.5" />
					<div className="flex-1">
						<div className="font-medium text-danger mb-1">Error</div>
						<div className="text-sm text-text-dim">{error}</div>
					</div>
				</div>
			)}

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
						{strategy.status === 'Strategy Approved' && (
							<div className="mt-3 p-3 rounded-xl2 border border-warning/30 bg-warning/10 text-sm text-text-soft">
								<AlertCircle className="w-4 h-4 inline mr-2 text-warning" />
								This strategy has been approved. To update it, please use the Monthly Strategy Update process.
							</div>
						)}
					</div>
					{!editing && strategy.status !== 'Strategy Approved' && (
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
								{strategy.content.split('\n').map((line: string, idx: number) => {
									// Simple markdown-like rendering
									if (line.startsWith('## ')) {
										return (
											<h2 key={idx} className="text-xl font-semibold mt-6 mb-3 text-text">
												{line.replace('## ', '')}
											</h2>
										);
									}
									if (line.startsWith('📌 ')) {
										return (
											<p key={idx} className="text-lg font-medium mb-2 text-primary">
												{line}
											</p>
										);
									}
									if (line.startsWith('**') && line.endsWith('**')) {
										return (
											<p key={idx} className="font-semibold mb-2">
												{line.replace(/\*\*/g, '')}
											</p>
										);
									}
									if (line.startsWith('- **')) {
										const parts = line.match(/- \*\*(.*?)\*\*: (.*)/);
										if (parts) {
											return (
												<p key={idx} className="ml-4 mb-1">
													<span className="font-semibold">{parts[1]}:</span> {parts[2]}
												</p>
											);
										}
									}
									if (line.startsWith('- ')) {
										return (
											<p key={idx} className="ml-4 mb-1">
												{line}
											</p>
										);
									}
									if (line.match(/^\d+\./)) {
										return (
											<p key={idx} className="ml-2 mb-2">
												{line}
											</p>
										);
									}
									if (line.trim() === '') {
										return <br key={idx} />;
									}
									return (
										<p key={idx} className="mb-2">
											{line}
										</p>
									);
								})}
							</div>
						</div>
					)}
				</div>

				{!editing && strategy.status !== 'Strategy Approved' && (
					<div className="flex pt-4 border-t border-edge/60">
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
							Approve & Continue
						</button>
					</div>
				)}
				{!editing && strategy.status === 'Strategy Approved' && (
					<div className="flex pt-4 border-t border-edge/60 gap-3">
						<button
							onClick={() => router.push('/content/approval')}
							className="flex-1 px-6 py-3 rounded-xl2 border border-accent/40 bg-accent/10 hover:bg-accent/20 flex items-center justify-center gap-2"
						>
							Review Content
						</button>
						<button
							onClick={() => router.push('/strategy/monthly-update')}
							className="px-6 py-3 rounded-xl2 border border-primary/40 bg-primary/10 hover:bg-primary/20 flex items-center justify-center gap-2"
						>
							Monthly Strategy Update
						</button>
					</div>
				)}
			</motion.div>
		</div>
	);
}

