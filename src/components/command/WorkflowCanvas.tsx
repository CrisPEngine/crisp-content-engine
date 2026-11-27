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

	return (
		<div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
			<div>
				<div className="mb-2 flex flex-wrap gap-2">
					<button type="button" className="btn" onClick={() => setScale((value) => Math.min(1.6, value + 0.1))}>Zoom in</button>
					<button type="button" className="btn" onClick={() => setScale((value) => Math.max(0.6, value - 0.1))}>Zoom out</button>
					<button type="button" className="btn" onClick={() => { setScale(1); setOffset({ x: 0, y: 0 }); }}>Fit</button>
					<button type="button" className="btn" onClick={() => { setScale(1); setOffset({ x: 0, y: 0 }); }}>Reset view</button>
				</div>
				<div
					className="workflow-canvas relative h-[34rem] overflow-hidden rounded-xl border border-edge"
					onPointerDown={onPointerDown}
					onPointerMove={(event) => {
						if (!drag) return;
						setOffset({ x: event.clientX - drag.x, y: event.clientY - drag.y });
					}}
					onPointerUp={() => setDrag(null)}
					onPointerLeave={() => setDrag(null)}
				>
					<div className="absolute left-4 top-4 origin-top-left" style={{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})` }}>
						<ol className="w-72 space-y-3">
							{nodes.map((node, index) => (
								<li key={node.id}>
									<button
										type="button"
										aria-pressed={node.id === selected?.id}
										onClick={() => setSelectedId(node.id)}
										className={`w-full rounded-xl border px-3 py-3 text-left ${TONE[node.tone]} ${node.id === selected?.id ? 'ring-2 ring-primary' : ''}`}
									>
										<p className="text-xs uppercase tracking-wide text-text-dim">{node.kind}</p>
										<p className="font-semibold">{node.name}</p>
										<p className="text-sm text-text-soft">{node.label}</p>
									</button>
									{index < nodes.length - 1 ? <div className="mx-auto h-3 w-px bg-edge" aria-hidden="true" /> : null}
								</li>
							))}
						</ol>
					</div>
				</div>
				<p className="mt-2 text-sm text-text-soft">Read-only. This graph is the content workflow CRISP already runs. Dragging the canvas does not change the run.</p>
			</div>
			<aside className="card-info space-y-3">
				<p className="text-xs uppercase tracking-wide text-text-dim">Selected node</p>
				<h3 className="text-lg font-semibold">{selected?.name}</h3>
				<p className="text-sm">{selected?.description}</p>
				<p className="text-sm text-text-soft">{title}</p>
				<p className="text-sm">{workflowStageSummary(job)}</p>
				{job.note ? <p className="text-sm">{presentWorkflowNote(job.note)}</p> : null}
				{job.error && job.error !== job.note ? <p className="text-sm text-danger">{presentWorkflowNote(job.error)}</p> : null}
				<p className="text-xs text-text-dim">An editorial agent can recommend a decision. Only the Human approval node is a person’s decision, and it is not taken from this canvas.</p>
			</aside>
			<div className="lg:col-span-2">
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
	);
}
