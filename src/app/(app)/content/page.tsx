'use client';

import { useEffect, useState } from 'react';
import { productionCapacity } from '@/lib/campaigns/productionPolicy';
import { buildContentOverview, type OverviewArticle, type OverviewJob, type OverviewOpportunity } from '@/lib/content/overview';

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
				const capacity = productionCapacity(jobs, Date.now(), operations.weeklyMaximum ?? 0);
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
		<div className="mx-auto max-w-5xl space-y-4 p-4">
			<header>
				<p className="text-xs text-text-dim">Content</p>
				<h1 className="text-2xl font-semibold">Overview</h1>
			</header>
			{error ? <p className="card border-danger/60 p-3 text-sm" role="alert">{error}</p> : null}
			{brandId && view ? null : <p className="text-sm">Loading the content queue…</p>}
			{view ? (
				<>
					<section className="card grid gap-3 p-4 text-sm md:grid-cols-4">
						<p><span className="block text-text-dim">Campaign</span>{view.campaign.state === 'paused' ? 'Paused' : view.campaign.state === 'blocked' ? 'Blocked' : 'Active'}</p>
						<p><span className="block text-text-dim">Autonomous publishing</span>{view.campaign.publishingEnabled ? 'On' : 'Off'}</p>
						<p><span className="block text-text-dim">Weekly capacity</span>{view.campaign.started} of {view.campaign.weeklyMaximum} used. {view.campaign.remaining} open.</p>
						<p><span className="block text-text-dim">Next capacity slot</span>{view.campaign.capacitySlotAt ? new Date(view.campaign.capacitySlotAt).toLocaleString() : 'A slot is open.'}{view.campaign.paused ? ' A paused campaign has no scheduled start.' : ''}</p>
					</section>
					<section className="grid gap-3 md:grid-cols-5">
						<Metric label="Approved" value={view.metrics.approved} href="/campaigns#approved" />
						<Metric label="In production" value={view.metrics.production} href="/campaigns#production" />
						<Metric label="Awaiting review" value={view.metrics.review} href="/content/articles?view=review" />
						<Metric label="Scheduled" value={view.metrics.scheduled} href="/content/schedule" />
						<Metric label="Published" value={view.metrics.published} href="/content/published" />
					</section>
					<ListCard title="Action queue" href="/campaigns" empty="Nothing is waiting for a decision." items={view.actions} />
					<section className="card grid gap-3 p-4 text-sm md:grid-cols-5">
						<p><span className="block text-text-dim">Research</span>{view.pipeline.research}</p>
						<p><span className="block text-text-dim">Draft</span>{view.pipeline.draft}</p>
						<p><span className="block text-text-dim">Review</span>{view.pipeline.review}</p>
						<p><span className="block text-text-dim">Scheduling</span>{view.pipeline.scheduling}</p>
						<p><span className="block text-text-dim">Publication</span>{view.pipeline.publication}</p>
					</section>
					<ListCard title="Recent activity" href="/content/articles" empty="No recent article activity." items={view.activity} />
					<ListCard title="Production failures" href="/campaigns#production" empty="No production jobs have failed." items={view.failures} />
				</>
			) : null}
		</div>
	);
}

function Metric(props: { label: string; value: number; href: string }) {
	return <a className="card p-3 text-sm" href={props.href}><span className="block text-text-dim">{props.label}</span><span className="text-xl font-semibold">{props.value}</span></a>;
}

function ListCard(props: { title: string; href: string; empty: string; items: Array<{ title: string; detail: string; href: string }> }) {
	return (
		<section className="card space-y-2 p-4 text-sm">
			<div className="flex items-center justify-between gap-3">
				<h2 className="font-medium">{props.title}</h2>
				<a className="underline" href={props.href}>Open</a>
			</div>
			{props.items.length ? props.items.map((item) => <p key={`${item.href}-${item.title}`}><a className="font-medium underline" href={item.href}>{item.title}</a><span className="block text-text-soft">{item.detail}</span></p>) : <p className="text-text-soft">{props.empty}</p>}
		</section>
	);
}
