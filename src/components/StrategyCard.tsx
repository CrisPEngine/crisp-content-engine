'use client';

/**
 * Strategy Card Component
 * 
 * Simple card for dashboard showing strategy status and CTA
 */

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSupabase } from '@/components/SupabaseProvider';
import { FileText, Loader2, AlertCircle, Check } from 'lucide-react';

type StrategyCardProps = {
	brandProfileId: string;
};

export function StrategyCard({ brandProfileId }: StrategyCardProps) {
	const router = useRouter();
	const supabase = useSupabase();
	const [loading, setLoading] = useState(true);
	const [briefStatus, setBriefStatus] = useState<string | null>(null);
	const [pendingBriefs, setPendingBriefs] = useState(0);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		if (!supabase || !brandProfileId) return;
		loadBriefStatus();
	}, [supabase, brandProfileId]);

	async function loadBriefStatus() {
		if (!supabase) return;
		setLoading(true);
		setError(null);
		try {
			const res = await fetch(`/api/content-briefs?brand_profile_id=${brandProfileId}`, {
				cache: 'no-store',
			});
			if (!res.ok) {
				throw new Error('Failed to load brief status');
			}
			const data = await res.json();
			const briefs = data.briefs || [];
			
			// Find latest brief
			const latestBrief = briefs[0];
			if (latestBrief) {
				setBriefStatus(latestBrief.status);
			}
			
			// Count pending briefs
			const pending = briefs.filter((b: any) => b.status === 'Pending Approval').length;
			setPendingBriefs(pending);
		} catch (err: any) {
			console.error('Failed to load brief status:', err);
			setError(err.message);
		} finally {
			setLoading(false);
		}
	}

	function getStatusChip() {
		if (briefStatus === 'Pending Approval') {
			return (
				<span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-primary/10 text-primary text-xs font-medium">
					<AlertCircle className="w-3 h-3" />
					Brief pending approval
				</span>
			);
		}
		if (briefStatus === 'Sent to Make' || briefStatus === 'Generation Completed') {
			return (
				<span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-accent/10 text-accent text-xs font-medium">
					<Loader2 className="w-3 h-3 animate-spin" />
					Generation in progress
				</span>
			);
		}
		if (briefStatus === 'Generation Completed') {
			return (
				<span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-accent/10 text-accent text-xs font-medium">
					<Check className="w-3 h-3" />
					Content ready for approval
				</span>
			);
		}
		return null;
	}

	return (
		<div className="card p-6">
			<div className="flex items-start justify-between">
				<div className="flex-1">
					<div className="flex items-center gap-2 mb-2">
						<FileText className="w-5 h-5 text-primary" />
						<h3 className="text-lg font-semibold">Strategy</h3>
					</div>
					<p className="text-sm text-text-dim mb-4">
						Edit your master strategy and manage monthly content briefs
					</p>
					{loading ? (
						<div className="flex items-center gap-2 text-sm text-text-dim">
							<Loader2 className="w-4 h-4 animate-spin" />
							Loading status...
						</div>
					) : (
						<div className="flex items-center gap-2 flex-wrap">
							{getStatusChip()}
							{pendingBriefs > 0 && (
								<span className="text-xs text-text-dim">
									{pendingBriefs} brief{pendingBriefs !== 1 ? 's' : ''} pending
								</span>
							)}
						</div>
					)}
				</div>
				<button
					onClick={() => router.push(`/strategy?brand_profile_id=${brandProfileId}`)}
					className="px-4 py-2 rounded-xl2 border border-primary/40 bg-primary/10 hover:bg-primary/20 text-sm font-medium whitespace-nowrap"
				>
					Open Strategy
				</button>
			</div>
		</div>
	);
}
