import { StatusBadge, toneForStatus } from './StatusBadge';

export function WorkflowStepper({ stages }: { stages: Array<{ name: string; status: string }> }) {
	return (
		<ol className="flex flex-wrap gap-2">
			{stages.map((stage, index) => (
				<li key={stage.name} className="flex min-w-[10.5rem] max-w-full flex-1">
					<div className="flex h-full min-h-16 w-full min-w-0 flex-col items-start gap-2 rounded-xl border border-edge bg-surface p-3">
						<span className="text-sm font-medium leading-snug">{index + 1}. {stage.name}</span>
						<StatusBadge label={stage.status} tone={toneForStatus(stage.status)} />
					</div>
				</li>
			))}
		</ol>
	);
}
