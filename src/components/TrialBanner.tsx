"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type TrialInfo = {
	isTrial: boolean;
	trialDaysRemaining?: number;
	trialUsage?: {
		linkedin: number;
		x: number;
		linkedinRemaining: number;
		xRemaining: number;
	};
	isEmailVerified?: boolean;
};

export function TrialBanner() {
	const [trialInfo, setTrialInfo] = useState<TrialInfo | null>(null);
	const [loading, setLoading] = useState(true);
	const router = useRouter();

	useEffect(() => {
		async function loadTrialInfo() {
			try {
				const res = await fetch('/api/usage/summary', { cache: 'no-store' });
				if (res.ok) {
					const data = await res.json();
					setTrialInfo({
						isTrial: data.isTrial || false,
						trialDaysRemaining: data.trialDaysRemaining,
						trialUsage: data.trialUsage,
						isEmailVerified: data.isEmailVerified,
					});
				}
			} catch (error) {
				console.error('Failed to load trial info:', error);
			} finally {
				setLoading(false);
			}
		}
		loadTrialInfo();
	}, []);

	if (loading || !trialInfo?.isTrial) return null;

	const daysRemaining = trialInfo.trialDaysRemaining || 0;
	const linkedinRemaining = trialInfo.trialUsage?.linkedinRemaining || 0;
	const xRemaining = trialInfo.trialUsage?.xRemaining || 0;

	return (
		<div className="mb-6 p-4 rounded-xl border border-blue-500/30 bg-blue-500/10">
			<div className="flex items-start justify-between gap-4">
				<div className="flex-1">
					<div className="flex items-center gap-2 mb-2">
						<span className="text-sm font-semibold text-blue-300">
							🎉 Trial Active
						</span>
						<span className="text-xs px-2 py-0.5 rounded-full bg-blue-500/20 border border-blue-500/40 text-blue-200">
							{daysRemaining} {daysRemaining === 1 ? 'day' : 'days'} remaining
						</span>
					</div>
					<p className="text-sm text-text-soft mb-2">
						You're trying CRISP with limited credits. Upgrade anytime to unlock full features.
					</p>
					<div className="flex flex-wrap gap-3 text-xs">
						<div className="flex items-center gap-1">
							<span className="text-text-dim">LinkedIn:</span>
							<span className="font-medium text-text">
								{linkedinRemaining}/3 remaining
							</span>
						</div>
						<div className="flex items-center gap-1">
							<span className="text-text-dim">X:</span>
							<span className="font-medium text-text">
								{xRemaining}/3 remaining
							</span>
						</div>
					</div>
				</div>
				<button
					onClick={() => router.push('/billing')}
					className="px-4 py-2 rounded-lg bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium transition shrink-0"
				>
					Upgrade
				</button>
			</div>
		</div>
	);
}
