'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { PageHeader } from '@/components/command/PageHeader';
import { StatusBadge, toneForStatus } from '@/components/command/StatusBadge';
import { WorkflowCanvas } from '@/components/command/WorkflowCanvas';
import { useWorkspaceOperations } from '@/components/command/useWorkspaceOperations';
import { AGENT_CAPABILITIES } from '@/lib/command/agents';
import { presentWorkflowNote, workflowStageLabel, workflowStatusLabel } from '@/lib/command/status';

export default function WorkflowsPage() {
	const { data, error } = useWorkspaceOperations();
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const jobs = data?.jobs ?? [];
	const selected = useMemo(() => jobs.find((job) => job.id === selectedId) ?? jobs[0], [jobs, selectedId]);
	const title = selected ? data?.opportunities.find((item) => item.id === selected.opportunityId)?.title ?? data?.articles.find((item) => item.id === selected.articleId)?.title ?? 'Content workflow' : '';
	const article = data?.articles.find((item) => item.id === selected?.articleId);

	return (
		<main className="mx-auto max-w-6xl space-y-6 p-4 md:p-8">
			<PageHeader eyebrow="Workflows" title="Workflows" description="The definition is the path CRISP already runs. A run is one recorded job on that path. This screen cannot edit the live workflow." />
			{error ? <p className="card border-danger/70 p-4" role="alert">{error}</p> : null}
			{data ? (
				<div className="flex flex-wrap gap-2">
					<StatusBadge label={data.view.campaign.paused ? 'Paused' : 'Active'} tone={data.view.campaign.paused ? 'warning' : 'success'} />
					<StatusBadge label={data.view.campaign.publishingEnabled ? 'Publishing on' : 'Publishing off'} tone={data.view.campaign.publishingEnabled ? 'danger' : 'info'} />
				</div>
			) : null}
			<section className="space-y-3">
				<h2 className="text-xl font-semibold">Workflow library</h2>
				{!data && !error ? <p className="text-sm text-text-soft">Loading workflow runs…</p> : null}
				{data && !jobs.length ? <p className="card-info text-sm text-text-soft">No production jobs are recorded.</p> : null}
				<div className="grid gap-3 md:grid-cols-2">
					{jobs.slice(0, 8).map((job) => {
						const name = data?.opportunities.find((item) => item.id === job.opportunityId)?.title ?? 'Content workflow';
						const status = workflowStatusLabel(job.status);
						const on = job.id === selected?.id;
						return (
							<button key={job.id} type="button" aria-pressed={on} className={`card-info space-y-2 text-left ${on ? 'ring-2 ring-primary' : ''}`} onClick={() => setSelectedId(job.id)}>
								<span className="flex flex-wrap items-center justify-between gap-2">
									<span className="font-semibold">{name}</span>
									<StatusBadge label={status} tone={toneForStatus(status)} />
								</span>
								<span className="block text-sm text-text-soft">{workflowStageLabel(job.stage)}. {presentWorkflowNote(job.note || 'No extra note was recorded.')}</span>
							</button>
						);
					})}
				</div>
			</section>
			{selected ? (
				<section className="space-y-3">
					<div className="flex flex-wrap items-end justify-between gap-3">
						<h2 className="text-xl font-semibold">Canvas · {title}</h2>
						{selected.articleId ? <Link className="btn" href={`/content/articles/${selected.articleId}`}>Open article</Link> : null}
					</div>
					<WorkflowCanvas key={selected.id} job={selected} article={article} title={title} />
				</section>
			) : null}
			<section className="space-y-3">
				<h2 className="text-xl font-semibold">Capability catalogue</h2>
				<p className="text-sm text-text-soft">These are the capabilities already described in CRISP. They cannot be dropped onto a live run. A draft editor that could execute new graphs is not part of this workspace.</p>
				<ul className="grid gap-3 md:grid-cols-2">
					{AGENT_CAPABILITIES.map((agent) => (
						<li key={agent.id} className="card-info">
							<p className="font-medium">{agent.name}</p>
							<p className="text-sm text-text-soft">{agent.status === 'available' ? 'Available' : agent.status === 'partial' ? 'Partially configured' : 'Planned'}. {agent.description}</p>
						</li>
					))}
				</ul>
			</section>
		</main>
	);
}
