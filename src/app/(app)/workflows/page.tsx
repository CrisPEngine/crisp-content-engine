'use client';

import Link from 'next/link';
import { PageHeader } from '@/components/command/PageHeader';
import { StatusBadge, toneForStatus } from '@/components/command/StatusBadge';
import { WorkflowStepper } from '@/components/command/WorkflowStepper';
import { useWorkspaceOperations } from '@/components/command/useWorkspaceOperations';
import { presentWorkflowNote, workflowStageLabel, workflowStatusLabel } from '@/lib/command/status';

const PIPELINE = ['Opportunity', 'Research', 'Planning', 'Draft', 'Editorial', 'Approval'];

export default function WorkflowsPage() {
	const { data, error } = useWorkspaceOperations();
	const paused = data?.view.campaign.paused;
	const publishing = data?.view.campaign.publishingEnabled;

	return (
		<main className="mx-auto max-w-5xl space-y-6 p-4 md:p-8">
			<PageHeader eyebrow="Workflows" title="Content opportunity to editorial review" description="Research and prepare content improvements for human approval. Generating a draft, finishing editorial review, approving it, sending it to the CMS, and publishing it are separate states." />
			{error ? <p className="card border-danger/70 p-4" role="alert">{error}</p> : null}
			{data ? (
				<div className="flex flex-wrap gap-2">
					<StatusBadge label={paused ? 'Paused' : 'Active'} tone={paused ? 'warning' : 'success'} />
					<StatusBadge label={publishing ? 'Publishing on' : 'Publishing off'} tone={publishing ? 'danger' : 'info'} />
					<StatusBadge label={`${data.view.campaign.started} of ${data.view.campaign.weeklyMaximum} weekly slots used`} tone="neutral" />
				</div>
			) : null}
			<WorkflowStepper stages={PIPELINE.map((name) => ({ name, status: 'In the path' }))} />
			<p className="text-sm text-text-soft">The stages above name the path. They are not individual agents, and a paused campaign does not move a record through them on its own. Live status is on each run below.</p>
			<section className="space-y-3">
				<h2 className="text-xl font-semibold">Recent workflow runs</h2>
				{!data && !error ? <p className="text-sm text-text-soft">Loading workflow runs…</p> : null}
				{data && !data.jobs.length ? <p className="card-info text-sm text-text-soft">No production jobs are recorded.</p> : null}
				{data?.jobs.slice(0, 8).map((job) => {
					const title = data.opportunities.find((item) => item.id === job.opportunityId)?.title ?? 'Content workflow';
					const status = workflowStatusLabel(job.status);
					return (
						<article key={job.id} className="card-info space-y-2">
							<div className="flex flex-wrap items-center justify-between gap-2">
								<h3 className="text-base font-semibold">{title}</h3>
								<StatusBadge label={status} tone={toneForStatus(status)} />
							</div>
							<p className="text-sm text-text-soft">Stage: {workflowStageLabel(job.stage)}. {presentWorkflowNote(job.note || 'No extra note was recorded.')}</p>
							<p className="text-sm">{job.articleId ? 'A draft exists. Opening it does not publish it.' : 'No draft is attached yet.'}</p>
							{job.error && job.error !== job.note ? <p className="text-sm text-danger" role="alert">{presentWorkflowNote(job.error)}</p> : null}
							{job.articleId ? <Link className="text-link text-sm" href={`/content/articles/${job.articleId}`}>View workflow →</Link> : <Link className="text-link text-sm" href="/campaigns#production">View queue →</Link>}
						</article>
					);
				})}
			</section>
		</main>
	);
}
