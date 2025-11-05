"use client";

import { useUsage } from '@/lib/useUsage';
import { useEffect, useState } from 'react';

export function PlanUsageCard() {
	const { data, loading } = useUsage();
	const [planInfo, setPlanInfo] = useState<{ planName: string; cycle: 'monthly' | 'annual' } | null>(null);
	useEffect(() => {
		(async () => {
			const r = await fetch('/api/plan', { cache: 'no-store' });
			const j = await r.json();
			if (!r.ok) return;
			setPlanInfo({ planName: j.planName || 'Free', cycle: j.cycle || 'monthly' });
		})();
	}, []);
	if (loading || !planInfo) {
		return (
			<div className="card p-4">
				<div className="text-text-soft">Loading plan usage…</div>
			</div>
		);
	}
	const used = data?.usage?.posts ?? 0;
	const cap = data?.caps?.posts_per_month ?? 999999;
	const pct = Math.min(100, Math.round((used / (cap || 1)) * 100));
	return (
		<div className="card p-6 space-y-4">
			<div className="flex items-center justify-between">
				<div>
					<div className="text-text-soft text-sm">Your plan</div>
					<div className="text-xl font-semibold">{planInfo.planName} <span className="text-text-dim text-base">({planInfo.cycle})</span></div>
				</div>
				<a href="/billing" className="px-3 py-1.5 rounded-xl2 border border-edge/60 bg-surface/70 text-sm hover:bg-surface/90">Manage</a>
			</div>
			<div className="text-sm text-text-soft">Posts this month</div>
			<div className="w-full h-2 bg-edge/60 rounded-full overflow-hidden">
				<div className="h-2 bg-accent" style={{ width: `${pct}%` }} />
			</div>
			<div className="text-text-dim text-sm">{used} / {cap === 999999 ? '∞' : cap}</div>
			{!data?.ok && (
				<div className="text-danger text-sm">{data?.reason ?? 'Limit reached.'}</div>
			)}
		</div>
	);
}


