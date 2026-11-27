'use client';

import Link from 'next/link';
import { ActionCard } from './ActionCard';
import { CapabilityCard } from './CapabilityCard';
import { MetricCard } from './MetricCard';
import { PageHeader } from './PageHeader';
import { StatusBadge } from './StatusBadge';
import { useWorkspaceOperations } from './useWorkspaceOperations';
import { activityProcess } from '@/lib/command/status';
import { NavIcon } from '@/components/command/NavIcon';

function greeting(date = new Date()) {
	const hour = date.getHours();
	if (hour < 12) return 'Good morning';
	if (hour < 17) return 'Good afternoon';
	return 'Good evening';
}

function statusForAction(detail: string) {
	if (/blocked|attention|resolve/i.test(detail)) return 'Human review required';
	if (/awaiting approval/i.test(detail)) return 'Awaiting approval';
	if (/paused|has not started/i.test(detail)) return 'Approved opportunity';
	if (/published/i.test(detail)) return 'Published, changes pending';
	return 'Needs a decision';
}

function actionLabel(detail: string) {
	if (/blocked|attention|resolve/i.test(detail)) return 'Review findings';
	if (/awaiting approval/i.test(detail)) return 'Review article';
	if (/paused|has not started/i.test(detail)) return 'View opportunity';
	return 'Open';
}

const LAUNCHER = [
	{ title: 'Intelligence', description: 'Discover opportunities and understand the business.', href: '/intelligence' },
	{ title: 'Agents', description: 'See which AI capabilities are available.', href: '/agents' },
	{ title: 'Workflows', description: 'Follow work from opportunity to approval.', href: '/workflows' },
	{ title: 'Content', description: 'Plan, review and improve articles.', href: '/content' },
	{ title: 'Campaigns', description: 'Coordinate opportunities and distribution.', href: '/campaigns' },
	{ title: 'Brand Brain', description: 'Manage business knowledge and brand rules.', href: '/intelligence' },
	{ title: 'Integrations', description: 'Connect websites and marketing channels.', href: '/connections' },
	{ title: 'Reports', description: 'Outcome reporting is not a separate workspace yet.', href: null, planned: true },
];

export function CommandHome() {
	const { data, error } = useWorkspaceOperations();
	const brand = data?.brandName ?? 'your workspace';
	const view = data?.view;

	return (
		<section className="space-y-8" aria-label="Command centre">
			<div className="command-hero rounded-2xl border border-edge p-6">
				<PageHeader
					eyebrow="CRISP Command"
					title={`${greeting()}. ${view?.campaign.paused ? `${brand} is paused.` : `Here’s what’s happening with ${brand}.`}`}
					description={view?.campaign.paused
						? 'The campaign is not starting new work, and publishing is off unless the workspace says otherwise. Decisions already recorded still need a person.'
						: 'CRISP has recorded opportunities and work that may need a decision. It does not publish on its own.'}
				/>
			</div>
			{error ? <p className="card border-danger/70 p-4 text-sm" role="alert">{error}</p> : null}
			{!view && !error ? <p className="text-sm text-text-soft">Loading workspace activity…</p> : null}
			{view ? (
				<>
					<div className="flex flex-wrap gap-2">
						<StatusBadge label={view.campaign.paused ? 'Campaign paused' : 'Campaign active'} tone={view.campaign.paused ? 'warning' : 'success'} />
						<StatusBadge label={view.campaign.publishingEnabled ? 'Autonomous publishing on' : 'Autonomous publishing off'} tone={view.campaign.publishingEnabled ? 'danger' : 'info'} />
					</div>
					<div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
						<MetricCard href="/campaigns#approved" icon="◎" title="Opportunities" value={view.metrics.approved} detail="Approved topics that have not been started." />
						<MetricCard href="/workflows" icon="↪" title="Active work" value={view.metrics.production} detail={view.metrics.production ? 'Workflows currently running.' : 'Nothing is running. A paused campaign does not start work.'} />
						<MetricCard href="/inbox" icon="!" title="Needs attention" value={view.metrics.attention} detail="Approvals, failures and decisions waiting for a person." />
						<MetricCard href="/content/published" icon="✓" title="Completed work" value={view.metrics.published} detail="Articles recorded as published. Drafts are not counted here." />
					</div>
					<div className="space-y-3">
						<div className="flex flex-wrap items-end justify-between gap-2">
							<h2 className="text-xl font-semibold">Your priorities</h2>
							<Link className="text-link text-sm" href="/inbox">Open in the inbox</Link>
						</div>
						{view.actions.length ? view.actions.slice(0, 4).map((item) => (
							<ActionCard key={`${item.href}-${item.title}`} title={item.title} detail={item.detail} status={statusForAction(item.detail)} href={item.href} action={actionLabel(item.detail)} />
						)) : <p className="card-info text-sm text-text-soft">Nothing is waiting for a decision.</p>}
					</div>
					<div className="space-y-3">
						<h2 className="text-xl font-semibold">Agent activity</h2>
						<ul className="card-info divide-y divide-edge">
							{view.activity.length ? view.activity.map((item) => (
								<li key={item.href + item.title} className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
									<div>
										<p className="font-medium"><a className="text-link" href={item.href}>{item.title}</a></p>
										<p className="text-sm text-text-soft">{activityProcess(item.detail)} · {item.detail}</p>
									</div>
									<p className="text-sm text-text-dim">{item.at ? new Date(item.at).toLocaleString() : 'Time not recorded'}</p>
								</li>
							)) : <li className="text-sm text-text-soft">No recent article activity.</li>}
						</ul>
					</div>
				</>
			) : null}
			<div className="space-y-3">
				<h2 className="text-xl font-semibold">Ask from the records</h2>
				<p className="text-sm text-text-soft">These open real screens. They do not generate an answer.</p>
				<div className="flex flex-wrap gap-2">
					<Link className="btn" href="/inbox">What needs my attention?</Link>
					<Link className="btn" href="/workflows">Why did a workflow stop?</Link>
					<Link className="btn" href="/campaigns#approved">Which opportunities are approved?</Link>
					<Link className="btn" href="/content/published">What is already published?</Link>
				</div>
			</div>
			<div className="card-action space-y-2">
				<h2 className="text-xl font-semibold">See CRISP in action</h2>
				<p className="text-sm text-text-soft">Follow a real marketing opportunity from discovery to editorial review and human approval. This uses existing records and does not change the website.</p>
				<Link href="/demo" className="btn-primary w-fit">Explore workflow →</Link>
			</div>
			<div className="space-y-3">
				<h2 className="text-xl font-semibold">Explore CRISP</h2>
				<div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
					{LAUNCHER.map((item) => (
						<CapabilityCard key={item.title} href={item.href} title={item.title} description={item.description} icon={<NavIcon name={item.title} />} planned={item.planned} />
					))}
				</div>
			</div>
		</section>
	);
}
