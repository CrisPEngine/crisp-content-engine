'use client';

import { useMemo, useState, type PointerEvent } from 'react';
import type { OverviewArticle, OverviewJob } from '@/lib/content/overview';
import { workflowNodesForRun, workflowStageSummary, type WorkflowNodeState } from '@/lib/command/workflowGraph';
import { presentWorkflowNote } from '@/lib/command/status';

const TONE: Record<WorkflowNodeState['tone'], string> = {
	complete: 'border-success/50 bg-surface',
	current: 'border-primary bg-primary/10',
	waiting: 'border-edge bg-surface',
	idle: 'border-edge bg-surface',
	failed: 'border-danger bg-danger/10',
};

export function WorkflowCanvas({
	job,
	article,
	title,
}: {
	job: OverviewJob;
	article?: OverviewArticle;
	title: string;
}) {
	const nodes = useMemo(() => workflowNodesForRun(job, article), [job, article]);
	const [selectedId, setSelectedId] = useState(nodes.find((node) => node.tone === 'current')?.id ?? nodes[0]?.id ?? '');
	const [scale, setScale] = useState(1);
	const [offset, setOffset] = useState({ x: 0, y: 0 });
	const [drag, setDrag] = useState<{ x: number; y: number } | null>(null);
	const selected = nodes.find((node) => node.id === selectedId) ?? nodes[0];

	function onPointerDown(event: PointerEvent<HTMLDivElement>) {
		if ((event.target as HTMLElement).closest('button')) return;
		setDrag({ x: event.clientX - offset.x, y: event.clientY - offset.y });
	}

	const [inspectorOpen, setInspectorOpen] = useState(true);

	return (
		<div className="space-y-3">
			<div className="rounded-xl border border-edge bg-surface-muted px-4 py-3">
				<p className="text-sm font-semibold">Viewing workflow</p>
				<p className="text-sm text-text-soft">This shows how the recorded run moved through the existing content workflow. Nodes cannot be added, removed, or reconnected. Editing a live workflow is not available.</p>
			</div>
			<div className="mb-2 flex flex-wrap gap-2">
				<button type="button" className="btn" onClick={() => setScale((value) => Math.min(1.4, value + 0.1))}>Zoom in</button>
				<button type="button" className="btn" onClick={() => setScale((value) => Math.max(0.7, value - 0.1))}>Zoom out</button>
				<button type="button" className="btn" onClick={() => { setScale(1); setOffset({ x: 0, y: 0 }); }}>Fit</button>
				<button type="button" className="btn" onClick={() => { setScale(1); setOffset({ x: 0, y: 0 }); }}>Reset view</button>
				<button type="button" className="btn" onClick={() => setOffset((value) => ({ ...value, x: value.x - 80 }))}>Pan left</button>
				<button type="button" className="btn" onClick={() => setOffset((value) => ({ ...value, x: value.x + 80 }))}>Pan right</button>
				<button type="button" className="btn" aria-pressed={inspectorOpen} onClick={() => setInspectorOpen((value) => !value)}>{inspectorOpen ? 'Hide details' : 'Show details'}</button>
			</div>
			<div className={`grid gap-4 ${inspectorOpen ? 'xl:grid-cols-[minmax(0,1fr)_18rem]' : ''}`}>
			<div>
				<div
					className="workflow-canvas relative h-[28rem] overflow-hidden rounded-xl border border-edge"
					onPointerDown={onPointerDown}
					onPointerMove={(event) => {
						if (!drag) return;
						setOffset({ x: event.clientX - drag.x, y: event.clientY - drag.y });
					}}
					onPointerUp={() => setDrag(null)}
					onPointerLeave={() => setDrag(null)}
				>
					<div className="absolute left-4 top-8 origin-top-left" style={{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})` }}>
						<ol className="flex w-max flex-col gap-3 md:flex-row md:items-stretch">
							{nodes.map((node, index) => (
								<li key={node.id} className="flex flex-col items-center gap-3 md:flex-row">
									<button
										type="button"
										aria-pressed={node.id === selected?.id}
										onClick={() => setSelectedId(node.id)}
										className={`w-44 rounded-xl border px-3 py-3 text-left ${TONE[node.tone]} ${node.id === selected?.id ? 'ring-2 ring-primary' : ''}`}
									>
										<p className="text-xs uppercase tracking-wide text-text-dim">{node.kind === 'approval' ? 'Human decision' : node.kind}</p>
										<p className="font-semibold">{node.name}</p>
										<p className="text-sm text-text-soft">{node.label}</p>
									</button>
									{index < nodes.length - 1 ? <span className="text-text-dim" aria-hidden="true">→</span> : null}
								</li>
							))}
						</ol>
					</div>
				</div>
				<p className="mt-2 text-sm text-text-soft">Drag the background to pan the view. That does not change the order of work. On a narrow screen, use the keyboard list below.</p>
			</div>
			{inspectorOpen ? <aside className="card-info space-y-3">
				<p className="text-xs uppercase tracking-wide text-text-dim">Selected node</p>
				<h3 className="text-lg font-semibold">{selected?.name}</h3>
				<p className="text-sm">{selected?.description}</p>
				<p className="text-sm text-text-soft">{title}</p>
				<p className="text-sm">{workflowStageSummary(job)}</p>
				{job.note ? <p className="text-sm">{presentWorkflowNote(job.note)}</p> : null}
				{job.error && job.error !== job.note ? <p className="text-sm text-danger">{presentWorkflowNote(job.error)}</p> : null}
				<p className="text-xs text-text-dim">{selected?.label === 'Historical stage' ? 'Detailed execution status is unavailable for this earlier step. It is not marked as a separate success.' : 'An editorial check can recommend a decision. Only Human approval is a person’s decision, and it is not taken from this canvas.'}</p>
			</aside> : null}
			<div>
				<h3 className="text-sm font-semibold">Keyboard list</h3>
				<ul className="mt-2 space-y-1">
					{nodes.map((node) => (
						<li key={node.id}>
							<button type="button" className="text-left text-sm text-link underline" onClick={() => setSelectedId(node.id)}>
								{node.name}: {node.label}
							</button>
						</li>
					))}
				</ul>
			</div>
			</div>
		</div>
	);
}
