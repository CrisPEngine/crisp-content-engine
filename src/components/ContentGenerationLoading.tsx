'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { Loader2, Check, Sparkles } from 'lucide-react';
import { useEffect, useState } from 'react';

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

export function ContentGenerationLoading({ 
	onComplete, 
	pollForCompletion,
	briefId,
	brandProfileId,
}: ContentGenerationLoadingProps) {
	const [currentStep, setCurrentStep] = useState(0);
	const [completedSteps, setCompletedSteps] = useState<Set<string>>(new Set());
	const [isComplete, setIsComplete] = useState(false);

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
			const maxPolls = 120; // 10 minutes max (120 * 5 seconds)
			
			const pollInterval = setInterval(async () => {
				pollCount++;
				
				try {
					const completed = await pollForCompletion();
					if (completed) {
						clearInterval(pollInterval);
						setCompletedSteps((prev) => new Set([...prev, 'complete']));
						setCurrentStep(4);
						setIsComplete(true);
						
						// Call onComplete after a brief delay
						if (onComplete) {
							setTimeout(() => onComplete(), 1500);
						}
					}
				} catch (error) {
					console.error('Error polling for completion:', error);
					// Continue polling on error
				}
				
				// Stop polling after max attempts
				if (pollCount >= maxPolls) {
					clearInterval(pollInterval);
					setCompletedSteps((prev) => new Set([...prev, 'complete']));
					setCurrentStep(4);
					setIsComplete(true);
					
					// Call onComplete anyway
					if (onComplete) {
						setTimeout(() => onComplete(), 1500);
					}
				}
			}, 5000); // Poll every 5 seconds
			
			timers.push(pollInterval as any);
		} else {
			// Fallback: Complete after 5 seconds if no polling function
			timers.push(
				setTimeout(() => {
					setCompletedSteps((prev) => new Set([...prev, 'complete']));
					setCurrentStep(4);
					setIsComplete(true);
					if (onComplete) {
						setTimeout(() => onComplete(), 1000);
					}
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
	}, [onComplete, pollForCompletion]);

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

