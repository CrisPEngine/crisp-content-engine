'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { CheckCircle2, Circle, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { humanStepLabel } from '@/lib/onboarding/stepLabels';

type Step = { id: string; label: string; href: string; done: boolean };

/**
 * After onboarding, show next-step checklist with live status when cheap to compute.
 */
export function NewBrandCallout() {
	const router = useRouter();
	const searchParams = useSearchParams();
	const [dismissed, setDismissed] = useState(false);
	const [steps, setSteps] = useState<Step[]>([]);
	const [brandName, setBrandName] = useState<string | null>(null);
	const [loading, setLoading] = useState(false);

	const showCallout = searchParams.get('new_brand') === '1' && !dismissed;
	const brandBrainId = searchParams.get('brandBrainId') ?? undefined;
	const airtableBrandId = searchParams.get('airtableBrandId') ?? undefined;

	useEffect(() => {
		if (!showCallout) return;
		const query = new URLSearchParams();
		if (brandBrainId) query.set('brandBrainId', brandBrainId);
		if (airtableBrandId) query.set('airtableBrandId', airtableBrandId);
		setLoading(true);
		void fetch(`/api/onboarding/next-steps?${query.toString()}`, { cache: 'no-store' })
			.then(async (res) => {
				const body = (await res.json()) as { steps?: Step[]; brandName?: string };
				setSteps(
					(body.steps ?? []).map((step) => ({
						...step,
						label: humanStepLabel(step.id, step.label),
					})),
				);
				setBrandName(body.brandName ?? null);
			})
			.finally(() => setLoading(false));
	}, [showCallout, brandBrainId, airtableBrandId]);

	const handleDismiss = () => {
		setDismissed(true);
		const params = new URLSearchParams(searchParams.toString());
		params.delete('new_brand');
		params.delete('brandBrainId');
		params.delete('airtableBrandId');
		const qs = params.toString();
		router.replace(qs ? `/dashboard?${qs}` : '/dashboard', { scroll: false });
	};

	if (!showCallout) return null;

	return (
		<div className="card p-4 bg-primary/10 border border-primary/30 space-y-3">
			<div className="flex items-start justify-between gap-3">
				<div>
					<p className="text-sm font-medium text-text">Next steps for {brandName || 'your new brand'}</p>
					<p className="text-sm text-text-dim mt-0.5">
						Your brand brain is active in CCE. Finish these steps so content and agents can use it end to end.
					</p>
				</div>
				<button
					type="button"
					onClick={handleDismiss}
					className="flex items-center gap-1.5 text-text-dim hover:text-text text-sm flex-shrink-0"
					aria-label="Dismiss"
				>
					<X className="w-4 h-4" />
					Dismiss
				</button>
			</div>
			{loading ? <p className="text-sm text-text-dim">Loading checklist…</p> : null}
			<ul className="space-y-2">
				{steps.map((step) => (
					<li key={step.id} className="flex items-center gap-2 text-sm">
						{step.done ? (
							<CheckCircle2 className="w-4 h-4 text-accent flex-shrink-0" aria-hidden />
						) : (
							<Circle className="w-4 h-4 text-text-dim flex-shrink-0" aria-hidden />
						)}
						<Link href={step.href} className={step.done ? 'text-text-dim line-through' : 'text-primary hover:underline'}>
							{step.label}
						</Link>
					</li>
				))}
			</ul>
		</div>
	);
}
