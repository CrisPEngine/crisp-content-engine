'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { Loader2, Check, Sparkles } from 'lucide-react';
import { useEffect, useState, useRef } from 'react';

type Step = {
	id: string;
	label: string;
	status: 'pending' | 'active' | 'complete';
};

const steps: Step[] = [
	{ id: 'approve', label: 'Approving...', status: 'pending' },
	{ id: 'generate', label: 'AI generating content...', status: 'pending' },
	{ id: 'schedule', label: 'Scheduling posts...', status: 'pending' },
	{ id: 'complete', label: 'Content generation complete', status: 'pending' },
];

type ContentGenerationLoadingProps = {
	onComplete?: () => void;
	/** Poll function that returns true when generation is complete */
	pollForCompletion?: () => Promise<boolean>;
	/** Brief ID to check status for (optional) */
	briefId?: string;
	/** Brand profile ID to check content for (optional) */
	brandProfileId?: string;
};

const POLL_INTERVAL_MS = 5000;
const MAX_POLLS = 120; // 10 minutes max
const ESCAPE_HATCH_AFTER_POLLS = 18; // Show "Close anyway" after ~90 seconds

export function ContentGenerationLoading({ 
	onComplete, 
	pollForCompletion,
	briefId,
	brandProfileId,
}: ContentGenerationLoadingProps) {
	const [currentStep, setCurrentStep] = useState(0);
	const [completedSteps, setCompletedSteps] = useState<Set<string>>(new Set());
	const [isComplete, setIsComplete] = useState(false);
	const [showEscapeHatch, setShowEscapeHatch] = useState(false);

	// Keep latest poll/onComplete in refs so effect runs once and doesn't reset interval on re-render
	const pollRef = useRef(pollForCompletion);
	const onCompleteRef = useRef(onComplete);
	pollRef.current = pollForCompletion;
	onCompleteRef.current = onComplete;

	useEffect(() => {
		// Simulate step progression
		const timers: NodeJS.Timeout[] = [];

		// Step 1: Approve (immediate)
		timers.push(
			setTimeout(() => {
				setCompletedSteps((prev) => new Set([...prev, 'approve']));
				setCurrentStep(1);
			}, 500)
		);

		// Step 2: Generate (2-3 seconds)
		timers.push(
			setTimeout(() => {
				setCompletedSteps((prev) => new Set([...prev, 'generate']));
				setCurrentStep(2);
			}, 2500)
		);

		// Step 3: Schedule (1-2 seconds)
		timers.push(
			setTimeout(() => {
				setCompletedSteps((prev) => new Set([...prev, 'schedule']));
				setCurrentStep(3);
			}, 4000)
		);

		// Poll for completion if pollForCompletion is provided
		if (pollForCompletion) {
			let pollCount = 0;
			let intervalId: ReturnType<typeof setInterval> | null = null;

			const tick = async () => {
				pollCount++;
				if (pollCount >= ESCAPE_HATCH_AFTER_POLLS) {
					setShowEscapeHatch(true);
				}

				try {
					const completed = await (pollRef.current?.() ?? Promise.resolve(false));
					if (completed && intervalId) {
						clearInterval(intervalId);
						intervalId = null;
						setCompletedSteps((prev) => new Set([...prev, 'complete']));
						setCurrentStep(4);
						setIsComplete(true);
						setTimeout(() => onCompleteRef.current?.(), 1500);
						return;
					}
				} catch (error) {
					console.error('Error polling for completion:', error);
				}

				if (pollCount >= MAX_POLLS && intervalId) {
					clearInterval(intervalId);
					intervalId = null;
					setCompletedSteps((prev) => new Set([...prev, 'complete']));
					setCurrentStep(4);
					setIsComplete(true);
					setTimeout(() => onCompleteRef.current?.(), 1500);
				}
			};

			intervalId = setInterval(tick, POLL_INTERVAL_MS);
			timers.push(intervalId);
		} else {
			// Fallback: Complete after 5 seconds if no polling function
			timers.push(
				setTimeout(() => {
					setCompletedSteps((prev) => new Set([...prev, 'complete']));
					setCurrentStep(4);
					setIsComplete(true);
					setTimeout(() => onCompleteRef.current?.(), 1000);
				}, 5000)
			);
		}

		return () => {
			timers.forEach((timer) => {
				if (typeof timer === 'number') {
					clearTimeout(timer);
				} else {
					clearInterval(timer);
				}
			});
		};
	}, []); // Run once; we use refs for latest callbacks

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center bg-bg/95 backdrop-blur-sm">
			<motion.div
				initial={{ opacity: 0, scale: 0.95 }}
				animate={{ opacity: 1, scale: 1 }}
				className="card p-8 max-w-md w-full mx-4"
			>
				<div className="text-center mb-8">
					<motion.div
						animate={{ rotate: 360 }}
						transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
						className="inline-block mb-4"
					>
						<Sparkles className="w-12 h-12 text-primary" />
					</motion.div>
					<h2 className="text-2xl font-semibold mb-2">Creating Your Content</h2>
					<p className="text-text-dim text-sm">This will take just a moment...</p>
				</div>

				{showEscapeHatch && !isComplete && (
					<div className="mb-4 p-3 rounded-xl2 border border-edge/60 bg-surface/30">
						<p className="text-sm text-text-dim mb-2">Taking longer than usual?</p>
						<button
							type="button"
							onClick={() => {
								setIsComplete(true);
								setCompletedSteps((prev) => new Set([...prev, 'complete']));
								setCurrentStep(4);
								onComplete?.();
							}}
							className="text-sm text-primary hover:underline"
						>
							Close and go to content
						</button>
					</div>
				)}

				<div className="space-y-4">
					<AnimatePresence>
						{steps.map((step, index) => {
							const isActive = currentStep === index;
							const isComplete = completedSteps.has(step.id);
							const isPending = !isActive && !isComplete;

							return (
								<motion.div
									key={step.id}
									initial={{ opacity: 0, x: -20 }}
									animate={{ opacity: 1, x: 0 }}
									exit={{ opacity: 0 }}
									className={`flex items-center gap-3 p-3 rounded-xl2 border transition-colors ${
										isActive
											? 'border-primary/40 bg-primary/10'
											: isComplete
												? 'border-accent/40 bg-accent/10'
												: 'border-edge/60 bg-surface/30'
									}`}
								>
									<div className="flex-shrink-0">
										{isComplete ? (
											<motion.div
												initial={{ scale: 0 }}
												animate={{ scale: 1 }}
												className="w-6 h-6 rounded-full bg-accent/20 border border-accent/40 flex items-center justify-center"
											>
												<Check className="w-4 h-4 text-accent" />
											</motion.div>
										) : isActive ? (
											<Loader2 className="w-6 h-6 text-primary animate-spin" />
										) : (
											<div className="w-6 h-6 rounded-full border border-edge/60 bg-surface/50" />
										)}
									</div>
									<div className="flex-1">
										<p
											className={`text-sm ${
												isActive
													? 'text-primary font-medium'
													: isComplete
														? 'text-accent'
														: 'text-text-dim'
											}`}
										>
											{step.label}
										</p>
									</div>
								</motion.div>
							);
						})}
					</AnimatePresence>
				</div>
			</motion.div>
		</div>
	);
}

