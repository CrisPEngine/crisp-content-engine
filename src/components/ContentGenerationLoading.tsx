'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { Loader2, Check, Sparkles, AlertCircle } from 'lucide-react';
import { useEffect, useState, useRef } from 'react';

type Step = {
	id: string;
	label: string;
	status: 'pending' | 'active' | 'complete';
};

const steps: Step[] = [
	{ id: 'queue', label: 'Starting generation job...', status: 'pending' },
	{ id: 'generate', label: 'AI writing drafts...', status: 'pending' },
	{ id: 'queue_write', label: 'Saving to approval queue...', status: 'pending' },
	{ id: 'complete', label: 'Generation complete', status: 'pending' },
];

type ContentGenerationLoadingProps = {
	onComplete?: () => void;
	/** Poll function that returns job outcome */
	pollForCompletion?: () => Promise<'pending' | 'complete' | 'failed' | 'stalled'>;
	generationJobId?: string;
};

const POLL_INTERVAL_MS = 4000;
const MAX_POLLS = 120;
const MIN_DISPLAY_MS = 8000;
const POST_COMPLETE_DELAY_MS = 2000;

export function ContentGenerationLoading({
	onComplete,
	pollForCompletion,
	generationJobId,
}: ContentGenerationLoadingProps) {
	const [currentStep, setCurrentStep] = useState(0);
	const [completedSteps, setCompletedSteps] = useState<Set<string>>(new Set());
	const [isComplete, setIsComplete] = useState(false);
	const [isFailed, setIsFailed] = useState(false);
	const [failureMessage, setFailureMessage] = useState<string | null>(null);
	const minDisplayReached = useRef(false);
	const pollRef = useRef(pollForCompletion);
	const onCompleteRef = useRef(onComplete);
	pollRef.current = pollForCompletion;
	onCompleteRef.current = onComplete;

	const runCompletion = useRef(() => {
		setCompletedSteps((prev) => new Set([...prev, 'complete']));
		setCurrentStep(4);
		setIsComplete(true);
		setTimeout(() => onCompleteRef.current?.(), POST_COMPLETE_DELAY_MS);
	});

	useEffect(() => {
		const timers: ReturnType<typeof setTimeout>[] = [];

		timers.push(
			setTimeout(() => {
				setCompletedSteps((prev) => new Set([...prev, 'queue']));
				setCurrentStep(1);
			}, 800),
		);
		timers.push(
			setTimeout(() => {
				setCompletedSteps((prev) => new Set([...prev, 'generate']));
				setCurrentStep(2);
			}, 4000),
		);
		timers.push(
			setTimeout(() => {
				setCompletedSteps((prev) => new Set([...prev, 'queue_write']));
				setCurrentStep(3);
			}, 9000),
		);

		timers.push(
			setTimeout(() => {
				minDisplayReached.current = true;
			}, MIN_DISPLAY_MS),
		);

		if (pollRef.current) {
			let pollCount = 0;
			const tick = async () => {
				pollCount += 1;
				try {
					const outcome = await (pollRef.current?.() ?? Promise.resolve('pending' as const));
					if (outcome === 'complete' && minDisplayReached.current) {
						runCompletion.current();
						return;
					}
					if (outcome === 'failed') {
						setIsFailed(true);
						setFailureMessage('Content generation failed. You can retry from Quick Generate.');
						return;
					}
					if (outcome === 'stalled' || pollCount >= MAX_POLLS) {
						setIsFailed(true);
						setFailureMessage(
							generationJobId
								? `Generation is taking longer than expected. Job id: ${generationJobId}. Check Approval or retry.`
								: 'Generation timed out. Check Approval or retry.',
						);
						return;
					}
				} catch (error) {
					console.error('Error polling for completion:', error);
				}
			};
			const id = setInterval(tick, POLL_INTERVAL_MS);
			timers.push(id as unknown as ReturnType<typeof setTimeout>);
			void tick();
		}

		return () => {
			timers.forEach((timer) => {
				if (typeof timer === 'number') clearTimeout(timer);
				else clearInterval(timer);
			});
		};
	}, [generationJobId]);

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
					<p className="text-text-dim text-sm mb-1">Native generation usually takes 30 seconds to a few minutes per channel.</p>
					{generationJobId ? (
						<p className="text-text-dim text-xs font-mono">Job {generationJobId.slice(0, 8)}…</p>
					) : null}
				</div>

				{isFailed && (
					<div className="mb-4 p-3 rounded-xl2 border border-warning/40 bg-warning/10 flex gap-2">
						<AlertCircle className="w-5 h-5 text-warning shrink-0" />
						<p className="text-sm text-text-dim">{failureMessage}</p>
					</div>
				)}

				<div className="space-y-4">
					<AnimatePresence>
						{steps.map((step, index) => {
							const isActive = currentStep === index;
							const stepComplete = completedSteps.has(step.id);
							return (
								<motion.div
									key={step.id}
									initial={{ opacity: 0, x: -20 }}
									animate={{ opacity: 1, x: 0 }}
									className={`flex items-center gap-3 p-3 rounded-xl2 border transition-colors ${
										isActive
											? 'border-primary/40 bg-primary/10'
											: stepComplete
												? 'border-accent/40 bg-accent/10'
												: 'border-edge/60 bg-surface/30'
									}`}
								>
									<div className="flex-shrink-0">
										{stepComplete ? (
											<div className="w-6 h-6 rounded-full bg-accent/20 border border-accent/40 flex items-center justify-center">
												<Check className="w-4 h-4 text-accent" />
											</div>
										) : isActive ? (
											<Loader2 className="w-6 h-6 text-primary animate-spin" />
										) : (
											<div className="w-6 h-6 rounded-full border border-edge/60 bg-surface/50" />
										)}
									</div>
									<p
										className={`text-sm ${
											isActive ? 'text-primary font-medium' : stepComplete ? 'text-accent' : 'text-text-dim'
										}`}
									>
										{step.label}
									</p>
								</motion.div>
							);
						})}
					</AnimatePresence>
				</div>

				{isFailed && (
					<button
						type="button"
						className="mt-6 w-full text-sm text-primary hover:underline"
						onClick={() => onComplete?.()}
					>
						Continue to approval queue
					</button>
				)}
			</motion.div>
		</div>
	);
}
