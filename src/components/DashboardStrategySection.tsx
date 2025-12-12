'use client';

/**
 * Dashboard Strategy Section
 * 
 * Client component that displays:
 * - Master Strategy Editor (for approved strategies)
 * - Content Briefs Section
 */

import { useState, useEffect } from 'react';
import { useSupabase } from '@/components/SupabaseProvider';
import { MasterStrategyEditor } from './MasterStrategyEditor';
import { ContentBriefsSection } from './ContentBriefsSection';
import { Loader2 } from 'lucide-react';

type DashboardStrategySectionProps = {
	brandProfileId: string;
};

export function DashboardStrategySection({ brandProfileId }: DashboardStrategySectionProps) {
	const supabase = useSupabase();
	const [strategyJson, setStrategyJson] = useState<any>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		if (!supabase || !brandProfileId) return;
		loadStrategy();
	}, [supabase, brandProfileId]);

	async function loadStrategy() {
		if (!supabase) return;
		setLoading(true);
		setError(null);
		try {
			const res = await fetch(`/api/strategy/${brandProfileId}`, { cache: 'no-store' });
			if (!res.ok) {
				throw new Error('Failed to load strategy');
			}
			const data = await res.json();
			setStrategyJson(data.strategy_json);
		} catch (err: any) {
			console.error('Failed to load strategy:', err);
			setError(err.message || 'Failed to load strategy');
		} finally {
			setLoading(false);
		}
	}

	if (loading) {
		return (
			<div className="space-y-6">
				<div className="card p-6">
					<div className="flex items-center gap-2 text-text-dim">
						<Loader2 className="w-4 h-4 animate-spin" />
						<span className="text-sm">Loading strategy...</span>
					</div>
				</div>
			</div>
		);
	}

	if (error) {
		return (
			<div className="card p-6 border-danger/40 bg-danger/10 text-danger text-sm">
				{error}
			</div>
		);
	}

	return (
		<div className="space-y-6">
			{/* Master Strategy Editor - Only show if strategy exists */}
			{strategyJson && (
				<MasterStrategyEditor
					brandProfileId={brandProfileId}
					initialStrategyJson={strategyJson}
				/>
			)}

			{/* Content Briefs Section */}
			<ContentBriefsSection brandProfileId={brandProfileId} />
		</div>
	);
}
