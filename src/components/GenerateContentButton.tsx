'use client';

import { Sparkles } from 'lucide-react';
import { useUsage } from '@/lib/useUsage';
import Link from 'next/link';

type BrandProfile = {
	id: string;
	client_name: string;
	platforms_requested?: string[];
	status: string;
	strategy_summary?: string;
};

type GenerateContentButtonProps = {
	brandProfiles: BrandProfile[];
};

export function GenerateContentButton({ brandProfiles }: GenerateContentButtonProps) {
	const { data: usageData } = useUsage();

	// Check if user has remaining posts
	const remainingPosts = (usageData?.caps?.posts_per_month || 999999) - (usageData?.usage?.posts || 0);
	const hasRemainingPosts = remainingPosts > 0 || remainingPosts === 999999;

	// Only show button if user has remaining posts
	if (!hasRemainingPosts) {
		return null;
	}

	return (
		<>
			<div className="card p-4 md:p-6 bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/30">
				<div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
					<div className="flex-1">
						<h3 className="text-lg md:text-xl font-semibold mb-1">Generate More Content</h3>
						<p className="text-sm md:text-base text-text-dim">
							Create additional posts for your brands within your monthly allowance.
						</p>
						{remainingPosts < 999999 && (
							<p className="text-xs text-text-soft mt-2">
								<span className="font-medium text-primary">{remainingPosts}</span> posts remaining this month
							</p>
						)}
					</div>
					<Link
						href="/content/generate"
						className="w-full sm:w-auto px-6 md:px-8 py-3 rounded-xl2 bg-gradient-to-r from-primary/90 to-primary/70 hover:from-primary hover:to-primary/90 text-white font-semibold whitespace-nowrap shadow-lg shadow-primary/20 hover:shadow-xl transition-all flex items-center justify-center gap-2"
					>
						<Sparkles className="w-4 h-4" />
						Generate Content
					</Link>
				</div>
			</div>
		</>
	);
}

