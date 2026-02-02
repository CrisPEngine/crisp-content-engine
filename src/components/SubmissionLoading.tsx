'use client';

import { motion } from 'framer-motion';
import { Loader2, Sparkles, CheckCircle } from 'lucide-react';
import { useEffect, useState } from 'react';

interface SubmissionLoadingProps {
	brandName: string;
	onComplete?: () => void;
}

export function SubmissionLoading({ brandName, onComplete }: SubmissionLoadingProps) {
	const [step, setStep] = useState(0);
	const [completed, setCompleted] = useState(false);

	// Longer durations so the interstitial stays up while the backend persists the brand and triggers strategy
	const steps = [
		{ text: 'Saving your brand profile...', duration: 2500 },
		{ text: 'AI is analyzing your brand...', duration: 3500 },
		{ text: 'Creating your content strategy...', duration: 4500 },
		{ text: 'Almost ready...', duration: 2000 },
	];

	useEffect(() => {
		if (completed) return;

		let currentStepIndex = 0;
		const timeouts: NodeJS.Timeout[] = [];

		steps.forEach((s, index) => {
			const timeout = setTimeout(() => {
				if (index < steps.length - 1) {
					setStep(index + 1);
				} else {
					setCompleted(true);
					// Hold on success state so user sees "Brand Profile Created!" before redirect
					setTimeout(() => {
						onComplete?.();
					}, 2500);
				}
			}, s.duration + (index > 0 ? steps.slice(0, index).reduce((acc, step) => acc + step.duration, 0) : 0));

			timeouts.push(timeout);
		});

		return () => {
			timeouts.forEach((timeout) => clearTimeout(timeout));
		};
	}, [completed, onComplete]);

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center bg-bg/95 backdrop-blur-sm">
			<motion.div
				initial={{ opacity: 0, scale: 0.9 }}
				animate={{ opacity: 1, scale: 1 }}
				className="card p-12 max-w-md w-full mx-4 text-center space-y-6"
			>
				{completed ? (
					<>
						<motion.div
							initial={{ scale: 0 }}
							animate={{ scale: 1 }}
							transition={{ type: 'spring', stiffness: 200 }}
						>
							<CheckCircle className="w-16 h-16 text-accent mx-auto mb-4" />
						</motion.div>
						<h2 className="text-2xl font-semibold mb-2">Brand Profile Created!</h2>
						<p className="text-text-dim">
							Your brand <span className="font-medium text-text">{brandName}</span> has been saved.
						</p>
						<p className="text-sm text-text-soft mt-4">
							Our AI is now reviewing your brief and creating a custom content strategy...
						</p>
					</>
				) : (
					<>
						<motion.div
							animate={{ rotate: 360 }}
							transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
							className="mx-auto mb-4"
						>
							<Sparkles className="w-16 h-16 text-primary" />
						</motion.div>
						<h2 className="text-2xl font-semibold mb-2">Creating Your Strategy</h2>
						<p className="text-text-dim mb-6">
							Our AI is reviewing your brand brief and crafting a custom content strategy...
						</p>
						<div className="space-y-3">
							{steps.map((s, index) => (
								<div key={index} className="flex items-center gap-3">
									{index < step ? (
										<CheckCircle className="w-5 h-5 text-accent flex-shrink-0" />
									) : index === step ? (
										<Loader2 className="w-5 h-5 text-primary animate-spin flex-shrink-0" />
									) : (
										<div className="w-5 h-5 rounded-full border-2 border-edge/60 flex-shrink-0" />
									)}
									<p
										className={`text-sm ${
											index < step
												? 'text-accent'
												: index === step
												? 'text-primary'
												: 'text-text-dim'
										}`}
									>
										{s.text}
									</p>
								</div>
							))}
						</div>
					</>
				)}
			</motion.div>
		</div>
	);
}

