'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { readWorkingBrandId } from '@/lib/brands/workingBrand';
import { humanStepLabel } from '@/lib/onboarding/stepLabels';

type Step = { id: string; label: string; done: boolean; href: string };

export function NativeGetStartedCard() {
	const [loading, setLoading] = useState(true);
	const [currentStep, setCurrentStep] = useState(0);
	const [steps, setSteps] = useState<Step[]>([]);
	const [brandName, setBrandName] = useState<string | null>(null);

	const reload = useCallback(() => {
		setLoading(true);
		const working = readWorkingBrandId();
		const query = working ? `?airtableBrandId=${encodeURIComponent(working)}` : '';
		void fetch(`/api/dashboard/get-started${query}`, { cache: 'no-store' })
			.then(async (res) => res.json())
			.then((body) => {
				setSteps(
					(body.steps ?? []).map((step: Step) => ({
						...step,
						label: humanStepLabel(step.id, step.label),
					})),
				);
				setCurrentStep(body.currentStep ?? 0);
				setBrandName(body.brandName ?? null);
			})
			.finally(() => setLoading(false));
	}, []);

	useEffect(() => {
		reload();
		const onBrand = () => reload();
		window.addEventListener('cce-working-brand', onBrand);
		window.addEventListener('storage', onBrand);
		return () => {
			window.removeEventListener('cce-working-brand', onBrand);
			window.removeEventListener('storage', onBrand);
		};
	}, [reload]);

	if (loading) {
		return (
			<div className="w-full card p-3 md:p-4 bg-primary/5 border border-primary/20">
				<p className="text-sm text-text-dim">Loading native setup steps…</p>
			</div>
		);
	}

	if (currentStep === 0) return null;

	return (
		<div className="w-full card p-3 md:p-4 bg-primary/5 border border-primary/20 flex flex-col">
			<h3 className="font-semibold mb-1 text-sm md:text-base">Get Started{brandName ? `: ${brandName}` : ''}</h3>
			<p className="text-xs text-text-dim mb-3">Progress uses your native strategy, drafts, and channel destinations.</p>
			<div className="space-y-2 flex-1">
				{steps.map((step, index) => {
					const stepNumber = index + 1;
					const active = currentStep === stepNumber;
					const done = step.done;
					return (
						<div
							key={step.id}
							className={`flex flex-col gap-2 p-2 rounded-lg text-xs ${active ? 'bg-primary/10 border border-primary/30' : done ? 'opacity-60' : 'opacity-80'}`}
						>
							<div className="font-medium">
								Step {stepNumber}. {step.label}
							</div>
							{active && !done ? (
								<Link
									href={step.href}
									className="px-3 py-1.5 rounded-lg bg-primary/10 hover:bg-primary/20 border border-primary/30 text-primary font-medium text-center text-xs"
								>
									Continue
								</Link>
							) : null}
							{done ? <span className="text-xs text-accent font-medium">Done</span> : null}
						</div>
					);
				})}
			</div>
		</div>
	);
}
