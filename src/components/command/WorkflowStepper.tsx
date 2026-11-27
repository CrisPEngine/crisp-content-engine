import { StatusBadge, toneForStatus } from './StatusBadge';

export function WorkflowStepper({ stages }: { stages: Array<{ name: string; status: string }> }) {
	return (
		<ol className="grid gap-2 md:grid-cols-3">
			{stages.map((stage, index) => (
				<li key={stage.name} className="card-info flex items-center justify-between gap-3 py-3">
					<span className="text-sm font-medium"><span className="mr-2 text-text-dim">{index + 1}</span>{stage.name}</span>
					<StatusBadge label={stage.status} tone={toneForStatus(stage.status)} />
				</li>
			))}
		</ol>
	);
}
