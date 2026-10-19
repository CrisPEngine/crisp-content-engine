'use client';

import { useCallback, useEffect, useState } from 'react';
import { RecommendedNextStep } from '@/components/RecommendedNextStep';
import { readWorkingBrandId } from '@/lib/brands/workingBrand';

type GetStartedPayload = {
	currentStep?: number;
	hasContentToReview?: boolean;
	hasApprovedStrategy?: boolean;
	hasBrandProfiles?: boolean;
	airtableBrandId?: string;
	brandName?: string | null;
};

type Props = {
	hasSubscription: boolean;
};

export function DashboardRecommendedNextStep({ hasSubscription }: Props) {
	const [loading, setLoading] = useState(true);
	const [payload, setPayload] = useState<GetStartedPayload | null>(null);

	const load = useCallback(async () => {
		setLoading(true);
		try {
			const working = readWorkingBrandId();
			const query = working ? `?airtableBrandId=${encodeURIComponent(working)}` : '';
			const res = await fetch(`/api/dashboard/get-started${query}`, { cache: 'no-store' });
			const body = (await res.json()) as GetStartedPayload;
			if (res.ok) setPayload(body);
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		void load();
		const onBrand = () => void load();
		window.addEventListener('cce-working-brand', onBrand);
		window.addEventListener('storage', onBrand);
		return () => {
			window.removeEventListener('cce-working-brand', onBrand);
			window.removeEventListener('storage', onBrand);
		};
	}, [load]);

	if (!hasSubscription) return null;

	if (loading) {
		return (
			<div className="card p-4 md:p-5 border border-edge/60 animate-pulse">
				<p className="text-sm text-text-dim">Loading recommended next step for your working brand…</p>
			</div>
		);
	}

	if (!payload) return null;

	return (
		<RecommendedNextStep
			currentStep={payload.currentStep ?? 1}
			hasContentToReview={payload.hasContentToReview === true}
			hasBrandProfiles={payload.hasBrandProfiles !== false}
			hasApprovedStrategies={payload.hasApprovedStrategy === true}
			hasSubscription={hasSubscription}
			brandProfileId={payload.airtableBrandId}
		/>
	);
}
