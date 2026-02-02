'use client';

import { Sparkles, Calendar } from 'lucide-react';
import { useUsage } from '@/lib/useUsage';
import Link from 'next/link';

type BrandProfile = {
	id: string;
	client_name: string;
	platforms_requested?: string[];
	status: string;
	strategy_summary?: string;
};

type GenerateContentActionsProps = {
	brandProfiles: BrandProfile[];
};

export function GenerateContentActions({ brandProfiles }: GenerateContentActionsProps) {
	const { data: usageData, loading } = useUsage();

	// Check if user has remaining posts
	// For unlimited plans, posts_per_month might be null, undefined, or a very large number
	const postsCap = usageData?.caps?.posts_per_month;
	const isUnlimited = !postsCap || postsCap === 999999 || postsCap === Infinity || postsCap >= 999999;
	const remainingPosts = isUnlimited ? 999999 : (postsCap - (usageData?.usage?.posts || 0));
	const hasRemainingPosts = isUnlimited || remainingPosts > 0;

	// Show loading state or hide if no remaining posts (but only after loading completes)
	if (loading) {
		// Show component during loading to avoid layout shift
		return (
			<div className="w-full card p-3 md:p-4 bg-primary/5 border border-primary/20 flex flex-col h-full">
				<h3 className="font-semibold mb-3 text-sm md:text-base">Content Actions</h3>
				<div className="space-y-2 flex-1 opacity-50">
					<div className="text-xs text-text-dim">Loading...</div>
				</div>
			</div>
		);
	}

	// Only show if user has remaining posts
	if (!hasRemainingPosts) {
		return null;
	}

	return (
		<>
			<div className="w-full card p-3 md:p-4 bg-primary/5 border border-primary/20 flex flex-col h-full">
				<h3 className="font-semibold mb-3 text-sm md:text-base">Content Actions</h3>
				<div className="space-y-2 flex-1">
					{/* Generate More Content */}
					<div className="flex flex-col gap-2 p-2 rounded-lg text-xs bg-primary/10 border border-primary/30">
						<div className="font-medium">Generate More Content</div>
						<p className="text-[11px] text-text-dim mb-2">
							Create additional posts for your brands within your monthly allowance.
						</p>
						{remainingPosts < 999999 && (
							<p className="text-[10px] text-text-soft mb-2">
								<span className="font-medium text-primary">{remainingPosts}</span> posts remaining this month
							</p>
						)}
						<Link
							href="/content/generate"
							className="px-3 py-1.5 rounded-lg bg-primary/10 hover:bg-primary/20 border border-primary/30 text-primary font-medium text-center text-xs flex items-center justify-center gap-1.5"
						>
							<Sparkles className="w-3 h-3" />
							Generate Content
						</Link>
					</div>

					{/* Monthly Strategy Update */}
					<div className="flex flex-col gap-2 p-2 rounded-lg text-xs opacity-60">
						<div className="font-medium">Monthly Strategy Update</div>
						<p className="text-[11px] text-text-dim mb-2">
							Share fresh objectives & themes to evolve next month's content plan.
						</p>
						<Link
							href="/strategy/monthly-update"
							className="px-3 py-1.5 rounded-lg bg-surface/30 hover:bg-surface/50 border border-edge/60 text-text-soft font-medium text-center text-xs flex items-center justify-center gap-1.5"
						>
							<Calendar className="w-3 h-3" />
							Update Strategy
						</Link>
					</div>
				</div>
			</div>
		</>
	);
}

