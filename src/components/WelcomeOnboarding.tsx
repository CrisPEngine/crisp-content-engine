import Link from 'next/link';

type Props = {
	show: boolean;
	hasNativeBrand: boolean;
	hasStrategy: boolean;
	hasChannels: boolean;
};

export function WelcomeOnboarding({ show, hasNativeBrand, hasStrategy, hasChannels }: Props) {
	if (!show) return null;

	const steps = [
		{
			done: hasNativeBrand,
			title: 'Create your brand',
			body: 'Add your brand name and website so CCE knows what to represent.',
			href: '/onboarding',
			cta: 'Create brand',
		},
		{
			done: hasNativeBrand,
			title: 'Research my brand',
			body: 'Run research from your website and public sources.',
			href: '/research',
			cta: 'Open research',
		},
		{
			done: hasStrategy,
			title: 'Build initial strategy',
			body: 'Review themes and approve a direction for content.',
			href: '/intelligence',
			cta: 'Intelligence',
		},
		{
			done: hasChannels,
			title: 'Connect channels',
			body: 'Assign LinkedIn, Facebook, and Instagram destinations per brand.',
			href: '/connections',
			cta: 'Connections',
		},
		{
			done: false,
			title: 'Create first content',
			body: 'Generate or approve your first post when you are ready.',
			href: '/content/approval',
			cta: 'Content',
		},
	];

	return (
		<div className="card p-6 border border-primary/30 bg-primary/5 space-y-4">
			<div>
				<h2 className="text-lg font-semibold">Welcome to CrisP Content Engine</h2>
				<p className="text-sm text-text-dim mt-1">
					A short path to get value from CCE. You can skip any step and come back later.
				</p>
			</div>
			<ol className="space-y-3">
				{steps.map((step, index) => (
					<li key={step.title} className="flex gap-3 items-start">
						<span
							className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
								step.done ? 'bg-emerald-500/20 text-emerald-300' : 'bg-surface border border-edge/60 text-text-dim'
							}`}
						>
							{step.done ? '✓' : index + 1}
						</span>
						<div className="flex-1">
							<p className="font-medium text-sm">{step.title}</p>
							<p className="text-xs text-text-dim">{step.body}</p>
							{!step.done && (
								<Link href={step.href} className="text-xs text-primary hover:underline mt-1 inline-block">
									{step.cta} →
								</Link>
							)}
						</div>
					</li>
				))}
			</ol>
			<p className="text-xs text-text-dim">
				<a href="/dashboard" className="text-primary hover:underline">
					Skip for now
				</a>{' '}
				— full dashboard stays available.
			</p>
		</div>
	);
}
