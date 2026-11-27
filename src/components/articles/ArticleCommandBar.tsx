'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { StatusBadge } from '@/components/command/StatusBadge';
import { WorkflowStepper } from '@/components/command/WorkflowStepper';
import { workflowStageLabel, workflowStatusLabel } from '@/lib/command/status';

type JobMatch = { stage: string; status: string; opportunityTitle: string | null };

export function ArticleCommandBar({
	brandId,
	articleId,
	title,
	approval,
	nextAction,
	nextDetail,
	published,
	submittedToCms,
	stages,
}: {
	brandId: string;
	articleId: string;
	title: string;
	approval: string;
	nextAction: string;
	nextDetail: string;
	published: boolean;
	submittedToCms: boolean;
	stages: Array<{ name: string; status: string }>;
}) {
	const [job, setJob] = useState<JobMatch | null>(null);

	useEffect(() => {
		let cancelled = false;
		fetch(`/api/campaigns?brandId=${encodeURIComponent(brandId)}`)
			.then((response) => response.json())
			.then((body: { jobs?: Array<{ articleId: string | null; stage: string; status: string; opportunityId: string }>; opportunities?: Array<{ id: string; title: string }> }) => {
				const match = (body.jobs ?? []).find((item) => item.articleId === articleId);
				if (!match || cancelled) return;
				const opportunity = (body.opportunities ?? []).find((item) => item.id === match.opportunityId);
				setJob({ stage: match.stage, status: match.status, opportunityTitle: opportunity?.title ?? null });
			})
			.catch(() => undefined);
		return () => {
			cancelled = true;
		};
	}, [articleId, brandId]);

	const publication = published ? 'Published' : submittedToCms ? 'CMS draft sent, not published' : 'Not sent to the CMS';

	return (
		<section className="card-info space-y-4" aria-label="Article status">
			<div className="flex flex-wrap items-start justify-between gap-3">
				<div>
					<p className="text-sm text-text-soft">Article</p>
					<h2 className="text-xl font-semibold">{title}</h2>
				</div>
				<div className="flex flex-wrap gap-2">
					<StatusBadge label={approval === 'approved' ? 'Approved' : 'Awaiting approval'} tone={approval === 'approved' ? 'success' : 'warning'} />
					<StatusBadge label={publication} tone={published ? 'success' : 'neutral'} />
					{job ? <StatusBadge label={workflowStatusLabel(job.status)} tone={job.status === 'needs_attention' ? 'warning' : 'info'} /> : null}
				</div>
			</div>
			{job?.opportunityTitle ? <p className="text-sm">Opportunity: {job.opportunityTitle}</p> : <p className="text-sm text-text-soft">No production opportunity is linked to this article.</p>}
			{job ? <p className="text-sm">Workflow stage: {workflowStageLabel(job.stage)}</p> : null}
			<p className="text-base"><span className="font-medium">Next: {nextAction}.</span> {nextDetail}</p>
			<WorkflowStepper stages={stages.map((stage) => job?.status === 'needs_attention' && stage.name === 'Editorial' ? { ...stage, status: 'Needs attention' } : stage)} />
			<Link href="?stage=publish#approval" className="btn-primary w-fit">Open approval controls →</Link>
		</section>
	);
}
