'use client';

// Strategy Review Page - Redesigned with header card and snapshot
import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useSupabase } from '@/components/SupabaseProvider';
import { motion } from 'framer-motion';
import { Check, Edit, AlertCircle, Loader2, Info, Calendar } from 'lucide-react';
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
	const [hasPendingContent, setHasPendingContent] = useState(false);

	const strategyId = typeof params.id === 'string' ? params.id : String(params.id);
	
	const loadStrategy = useCallback(async () => {
		if (!supabase || !strategyId) return;
		setLoading(true);
		setError(null);
		try {
			const { data: { user } } = await supabase.auth.getUser();
			if (!user) {
				window.location.href = '/sign-in';
				return;
			}

			const res = await fetch(`/api/strategy/${strategyId}`, { cache: 'no-store' });
			if (!res.ok) {
				const data = await res.json().catch(() => ({}));
				throw new Error(data?.error || 'Failed to load strategy');
			}
			const data = await res.json();
			setStrategy(data);
			
			// Check if content is pending for this brand
			if (data.status === 'Strategy Approved') {
				try {
					const contentRes = await fetch('/api/content/queue?status=Draft,Pending Approval,Needs Review', { cache: 'no-store' });
					if (contentRes.ok) {
						const contentData = await contentRes.json();
						// Check if any content belongs to this brand
						const brandHasContent = contentData.items?.some((item: any) => item.brand_profile_id === strategyId);
						setHasPendingContent(brandHasContent || false);
					}
				} catch (err) {
					console.warn('Failed to check pending content:', err);
				}
			}
		} catch (err: any) {
			console.error('Failed to load strategy:', err);
			setError(err.message || 'Failed to load strategy');
		} finally {
			setLoading(false);
		}
	}, [supabase, strategyId]);

	useEffect(() => {
		if (!supabase) return;
		loadStrategy();
	}, [supabase, loadStrategy]);

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

			// Wait 5 seconds with button loading, then show interstitial
			setTimeout(() => {
				setApproving(false);
				setShowLoading(true);
			}, 5000);
		} catch (err: any) {
			console.error('Failed to approve strategy:', err);
			setError(err.message || 'Failed to approve strategy. Please try again.');
			setApproving(false);
		}
	}

	// Poll function for ContentGenerationLoading
	async function pollForCompletion(): Promise<boolean> {
		if (!strategy) return false;
		
		try {
			// Check if content has been created for this brand
			const contentRes = await fetch(
				`/api/content/queue?stage=approval&brand_profile_id=${strategy.id}`,
				{ cache: 'no-store' }
			);
			
			if (contentRes.ok) {
				const contentData = await contentRes.json();
				const items = contentData.items || [];
				
				// If content exists, generation is complete
				if (items.length > 0) {
					return true;
				}
			}
			
			return false;
		} catch (error) {
			console.error('Error polling for completion:', error);
			return false;
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

	// ALL HOOKS MUST BE CALLED BEFORE ANY EARLY RETURNS
	// Create stable key from strategy for useMemo dependencies
	const strategyKey = strategy?.id ? String(strategy.id) : null;
	const strategyJsonKey = strategy?.strategy_json 
		? (typeof strategy.strategy_json === 'string' ? strategy.strategy_json : JSON.stringify(strategy.strategy_json))
		: null;
	const createdAtKey = strategy?.created_at ? String(strategy.created_at) : null;
	
	// Strategy has real content (from Make) - required before approval
	const hasStrategyContent = useMemo(() => {
		if (!strategy) return false;
		const content = (strategy.content || strategy.strategy_summary || '').trim();
		if (content.length > 50) return true; // Summary has substance
		const json = strategy.strategy_json;
		if (!json) return false;
		const parsed = typeof json === 'string' ? (() => { try { return JSON.parse(json); } catch { return null; } })() : json;
		return parsed && typeof parsed === 'object' && (parsed.pillars?.length > 0 || parsed.brand_summary || parsed.brand_understanding);
	}, [strategy?.content, strategy?.strategy_summary, strategy?.strategy_json]);

	// Parse strategy_json to extract snapshot data - use stable string key
	const strategySnapshot = useMemo(() => {
		if (!strategyJsonKey || !strategy?.strategy_json) return null;
		try {
			const json = typeof strategy.strategy_json === 'string' 
				? JSON.parse(strategy.strategy_json) 
				: strategy.strategy_json;
			
			return {
				pillarsCount: json.pillars?.length || 0,
				audience: json.brand_understanding?.perceived_audience || json.brand_summary?.positioning || 'Not specified',
				voiceSummary: json.voice?.summary || 'Not specified',
				cadence: json.cadence || {},
			};
		} catch {
			return null;
		}
	}, [strategyJsonKey, strategyKey]);
	
	// Format last updated date - use stable string key
	const lastUpdated = useMemo(() => {
		if (!createdAtKey) return null;
		try {
			const date = new Date(createdAtKey);
			return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
		} catch {
			return null;
		}
	}, [createdAtKey]);

	// NOW we can do early returns after all hooks
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

	// Get status color
	const getStatusColor = (status: string) => {
		if (status === 'Strategy Approved') return 'text-accent';
		if (status === 'Strategy Ready (Awaiting Approval)') return 'text-primary';
		return 'text-text-dim';
	};

	// Get status dot color
	const getStatusDotColor = (status: string) => {
		if (status === 'Strategy Approved') return 'bg-accent';
		if (status === 'Strategy Ready (Awaiting Approval)') return 'bg-primary';
		return 'bg-text-dim';
	};

	if (showLoading) {
		return (
			<ContentGenerationLoading 
				onComplete={handleContentGenerationComplete}
				pollForCompletion={pollForCompletion}
				brandProfileId={strategy?.id}
			/>
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

			{error && (
				<div className="mb-6 card p-4 border-danger/40 bg-danger/10 flex items-start gap-3">
					<AlertCircle className="w-5 h-5 text-danger flex-shrink-0 mt-0.5" />
					<div className="flex-1">
						<div className="font-medium text-danger mb-1">Error</div>
						<div className="text-sm text-text-dim">{error}</div>
					</div>
				</div>
			)}

			{/* Strategy Header Card - Redesigned */}
			<motion.div
				initial={{ opacity: 0, y: 20 }}
				animate={{ opacity: 1, y: 0 }}
				className="relative rounded-2xl p-6 mb-6 bg-gradient-to-br from-surface/80 to-surface/40 border border-primary/30 shadow-lg shadow-primary/10"
				style={{
					boxShadow: '0 0 20px rgba(99, 102, 241, 0.1), 0 0 40px rgba(99, 102, 241, 0.05)',
				}}
			>
				<div className="flex flex-col md:flex-row items-start justify-between gap-4 md:gap-6">
					{/* Left: Brand name, status, last updated */}
					<div className="flex-1 w-full">
						<h1 className="text-2xl md:text-3xl font-bold text-text mb-3">{strategy.brand_name}</h1>
						<div className="flex flex-wrap items-center gap-3 mb-2">
							<div className="flex items-center gap-2">
								<div className={`w-2 h-2 rounded-full ${getStatusDotColor(strategy.status)}`} />
								<span className={`text-sm font-medium ${getStatusColor(strategy.status)}`}>
									{strategy.status}
								</span>
							</div>
							{lastUpdated && (
								<span className="text-xs text-text-dim flex items-center gap-1">
									<Calendar className="w-3 h-3" />
									Updated {lastUpdated}
								</span>
							)}
						</div>
					</div>

					{/* Right: Action buttons - Stack on mobile */}
					{!editing && strategy.status === 'Strategy Approved' && (
						<div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full md:w-auto">
							<button
								onClick={() => router.push('/content/approval')}
								className="px-6 py-3 rounded-xl2 bg-gradient-to-r from-accent/90 to-accent/70 hover:from-accent hover:to-accent/90 text-white font-medium shadow-lg shadow-accent/20 flex items-center justify-center gap-2 transition-all"
							>
								<Check className="w-4 h-4" />
								Review Content
							</button>
							<button
								onClick={() => router.push('/strategy/monthly-updates')}
								className="px-6 py-3 rounded-xl2 border-2 border-primary/50 bg-transparent hover:bg-primary/10 text-primary font-medium flex items-center justify-center gap-2 transition-all"
							>
								Review Monthly Updates
							</button>
							<button
								onClick={() => router.push('/content-brief')}
								className="px-6 py-3 rounded-xl2 border-2 border-primary/50 bg-transparent hover:bg-primary/10 text-primary font-medium flex items-center justify-center gap-2 transition-all"
							>
								Submit New Update
							</button>
						</div>
					)}
					{!editing && strategy.status !== 'Strategy Approved' && (
						<div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full md:w-auto">
							{hasStrategyContent && (
								<button
									onClick={() => {
										setEditedContent(strategy.content || '');
										setEditing(true);
									}}
									className="px-4 py-2 rounded-xl2 border border-edge/60 bg-surface/30 hover:bg-surface/50 flex items-center justify-center gap-2"
								>
									<Edit className="w-4 h-4" />
									Edit
								</button>
							)}
							<button
								onClick={approveStrategy}
								disabled={approving || !hasStrategyContent}
								title={!hasStrategyContent ? 'Strategy content is still being generated. Please wait or refresh.' : undefined}
								className="px-6 py-2 rounded-xl2 border border-accent/40 bg-accent/10 hover:bg-accent/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
							>
								{approving ? (
									<Loader2 className="w-4 h-4 animate-spin" />
								) : (
									<Check className="w-4 h-4" />
								)}
								Approve & Continue
							</button>
						</div>
					)}
				</div>
			</motion.div>

			{/* Info Banner - Centered, smaller */}
			{strategy.status === 'Strategy Approved' && (
				<motion.div
					initial={{ opacity: 0, y: 10 }}
					animate={{ opacity: 1, y: 0 }}
					className="mx-auto mb-6 max-w-[700px]"
				>
					<div className="card p-3 border-primary/20 bg-primary/5 flex items-center justify-center gap-2">
						<Info className="w-4 h-4 text-primary flex-shrink-0" />
						<p className="text-sm text-text-soft text-center">
							This strategy has been approved. To update it, please use the Monthly Strategy Update process.
						</p>
					</div>
				</motion.div>
			)}

			{/* Strategy Snapshot Card */}
			{strategySnapshot && (
				<motion.div
					initial={{ opacity: 0, y: 10 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{ delay: 0.1 }}
					className="card p-6 mb-6 border-edge/60 bg-surface/30"
					style={{
						boxShadow: '0 0 10px rgba(99, 102, 241, 0.05)',
					}}
				>
					<div className="grid grid-cols-1 md:grid-cols-3 gap-6">
						{/* Pillars Count */}
						<div>
							<div className="text-xs text-text-dim mb-1">Content Pillars</div>
							<div className="text-2xl font-bold text-text">{strategySnapshot.pillarsCount}</div>
						</div>

						{/* Audience Summary */}
						<div>
							<div className="text-xs text-text-dim mb-1">Target Audience</div>
							<div className="text-sm font-medium text-text line-clamp-2">
								{strategySnapshot.audience.length > 60 
									? `${strategySnapshot.audience.substring(0, 60)}...`
									: strategySnapshot.audience}
							</div>
						</div>

						{/* Voice Traits */}
						<div>
							<div className="text-xs text-text-dim mb-1">Voice</div>
							<div className="text-sm font-medium text-text line-clamp-2">
								{strategySnapshot.voiceSummary.length > 60
									? `${strategySnapshot.voiceSummary.substring(0, 60)}...`
									: strategySnapshot.voiceSummary}
							</div>
						</div>
					</div>
				</motion.div>
			)}

			{/* Strategy not ready yet - show waiting message */}
			{!hasStrategyContent && strategy.status !== 'Strategy Approved' && (
				<motion.div
					initial={{ opacity: 0, y: 10 }}
					animate={{ opacity: 1, y: 0 }}
					className="mb-6 card p-6 border-primary/30 bg-primary/5 flex items-start gap-3"
				>
					<AlertCircle className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
					<div>
						<p className="font-medium text-text mb-1">Strategy is still being generated</p>
						<p className="text-sm text-text-dim">
							Our AI is creating your content strategy. This usually takes a minute or two. Refresh the page to see updates, or check back shortly.
						</p>
					</div>
				</motion.div>
			)}

			{/* Strategy Content Section */}
			<motion.div
				initial={{ opacity: 0, y: 10 }}
				animate={{ opacity: 1, y: 0 }}
				transition={{ delay: 0.2 }}
				className="space-y-4"
			>
				{/* Section Header */}
				<div className="space-y-2">
					<h2 className="text-2xl font-semibold text-text">Strategy Content</h2>
					<div className="h-px bg-gradient-to-r from-transparent via-edge/60 to-transparent" />
				</div>

				{/* Content Card */}
				<div className="card p-8 space-y-6">
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
								{(strategy.content || '').split('\n').map((line: string, idx: number) => {
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

					{/* Bottom Action Buttons - Only show for non-approved strategies */}
					{!editing && strategy.status !== 'Strategy Approved' && (
						<div className="flex pt-4 border-t border-edge/60">
							<button
								onClick={approveStrategy}
								disabled={approving || !hasStrategyContent}
								title={!hasStrategyContent ? 'Strategy content is still being generated.' : undefined}
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
				</div>
			</motion.div>
		</div>
	);
}

