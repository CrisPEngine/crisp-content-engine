'use client';

import { useEffect, useState } from 'react';
import { productionCapacity } from '@/lib/campaigns/productionPolicy';
import { buildContentOverview, type OverviewArticle, type OverviewJob, type OverviewOpportunity } from '@/lib/content/overview';
import { PageHeader } from '@/components/command/PageHeader';
import { StatusBadge } from '@/components/command/StatusBadge';
import { WorkflowStepper } from '@/components/command/WorkflowStepper';

type Brand = { id: string; name: string };
type Operations = { paused?: boolean; autonomousPublishingEnabled?: boolean; weeklyMaximum?: number; mode?: string; costUsd?: number };

export default function ContentOverviewPage() {
	const [brandId, setBrandId] = useState('');
	const [error, setError] = useState('');
	const [view, setView] = useState<ReturnType<typeof buildContentOverview> | null>(null);

	useEffect(() => {
		fetch('/api/intelligence/brands')
			.then((response) => response.json())
			.then(async (body: { brands?: Brand[] }) => {
				const folian = (body.brands ?? []).find((brand) => /folian/i.test(brand.name)) ?? body.brands?.[0];
				if (!folian) return;
				setBrandId(folian.id);
				const [queue, listed] = await Promise.all([
					fetch(`/api/campaigns?brandId=${encodeURIComponent(folian.id)}`).then((response) => response.json()),
					fetch(`/api/articles?brandId=${encodeURIComponent(folian.id)}&pageSize=100`).then((response) => response.json()),
				]);
				const operations = (queue.operations ?? {}) as Operations;
				const jobs = (queue.jobs ?? []) as OverviewJob[];
				const capacity = productionCapacity(jobs.flatMap((job) => job.createdAt ? [{ createdAt: job.createdAt, status: job.status, workType: job.workType }] : []), Date.now(), operations.weeklyMaximum ?? 0);
				setView(buildContentOverview({
					paused: operations.paused ?? queue.campaigns?.[0]?.status !== 'active',
					publishingEnabled: operations.autonomousPublishingEnabled === true,
					started: capacity.started,
					remaining: capacity.remaining,
					nextSlotAt: capacity.nextSlotAt,
					weeklyMaximum: operations.weeklyMaximum ?? 0,
					opportunities: (queue.opportunities ?? []) as OverviewOpportunity[],
					jobs,
					articles: (Array.isArray(listed.articles) ? listed.articles : []) as OverviewArticle[],
				}));
			})
			.catch(() => setError('Content operations could not be loaded.'));
	}, []);

	return (
		<div className="mx-auto max-w-5xl space-y-6 p-4 md:p-8">
			<PageHeader eyebrow="Content" title="Editorial planning" description="Drafts, reviews and publication stay separate. A count is a record in this workspace, not a target." />
			{error ? <p className="card border-danger/60 p-3 text-sm" role="alert">{error}</p> : null}
			{brandId && view ? null : <p className="text-sm">Loading the content queue…</p>}
			{view ? (
				<>
					<section className="card-info grid gap-3 text-sm md:grid-cols-4">
						<p><span className="mb-1 block"><StatusBadge label={view.campaign.state === 'paused' ? 'Paused' : view.campaign.state === 'blocked' ? 'Blocked' : 'Active'} tone={view.campaign.state === 'paused' ? 'warning' : view.campaign.state === 'blocked' ? 'danger' : 'success'} /></span>Campaign</p>
						<p><span className="mb-1 block"><StatusBadge label={view.campaign.publishingEnabled ? 'Publishing on' : 'Publishing off'} tone={view.campaign.publishingEnabled ? 'danger' : 'info'} /></span>Autonomous publishing</p>
						<p><span className="block text-text-soft">Weekly capacity</span>{view.campaign.started} of {view.campaign.weeklyMaximum} used. {view.campaign.remaining} open.</p>
						<p><span className="block text-text-soft">Next capacity slot</span>{view.campaign.capacitySlotAt ? new Date(view.campaign.capacitySlotAt).toLocaleString() : 'A slot is open.'}{view.campaign.paused ? ' A paused campaign has no scheduled start.' : ''}</p>
					</section>
					<WorkflowStepper stages={[
						{ name: 'Research', status: view.pipeline.research ? `${view.pipeline.research} running` : 'None running' },
						{ name: 'Draft', status: view.pipeline.draft ? `${view.pipeline.draft} running` : 'None running' },
						{ name: 'Review', status: view.pipeline.review ? `${view.pipeline.review} waiting` : 'None waiting' },
						{ name: 'Scheduling', status: view.pipeline.scheduling ? `${view.pipeline.scheduling} scheduled` : 'None scheduled' },
						{ name: 'Published', status: view.pipeline.publication ? `${view.pipeline.publication} published` : 'None published' },
					]} />
					<section className="grid gap-3 md:grid-cols-5">
						<Metric label="Approved" value={view.metrics.approved} href="/campaigns#approved" />
						<Metric label="In production" value={view.metrics.production} href="/campaigns#production" />
						<Metric label="Awaiting review" value={view.metrics.review} href="/content/articles?view=review" />
						<Metric label="Scheduled" value={view.metrics.scheduled} href="/content/schedule" />
						<Metric label="Published" value={view.metrics.published} href="/content/published" />
						<Metric label="Needs attention" value={view.metrics.attention} href="/campaigns#production" />
						<Metric label="Indexed" value={view.metrics.indexed ?? 'Not confirmed'} href="/campaigns#operations" />
					</section>
					<ListCard title="Action queue" href="/campaigns" empty="Nothing is waiting for a decision." items={view.actions} />
					<ListCard title="Recent activity" href="/content/articles" empty="No recent article activity." items={view.activity} />
					<ListCard title="Production failures" href="/campaigns#production" empty="No production jobs have failed." items={view.failures} />
				</>
			) : null}
		</div>
	);
}

function Metric(props: { label: string; value: number | string; href: string }) {
	return <a className="card-nav" href={props.href}><span className="block text-sm text-text-soft">{props.label}</span><span className="text-2xl font-semibold">{props.value}</span><span className="mt-2 block text-sm text-primary">Open →</span></a>;
}

function ListCard(props: { title: string; href: string; empty: string; items: Array<{ title: string; detail: string; href: string }> }) {
	return (
		<section className="card space-y-2 p-4 text-sm">
			<div className="flex items-center justify-between gap-3">
				<h2 className="font-medium">{props.title}</h2>
				<a className="text-link" href={props.href}>Open →</a>
			</div>
			{props.items.length ? props.items.map((item) => <p key={`${item.href}-${item.title}`}><a className="text-link font-medium" href={item.href}>{item.title}</a><span className="block text-text-soft">{item.detail}</span></p>) : <p className="text-text-soft">{props.empty}</p>}
		</section>
	);
}
