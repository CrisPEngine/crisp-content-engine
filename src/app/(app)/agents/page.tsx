import Link from 'next/link';
import { AGENT_CAPABILITIES } from '@/lib/command/agents';
import { PageHeader } from '@/components/command/PageHeader';
import { StatusBadge, toneForStatus } from '@/components/command/StatusBadge';

const STATUS_LABEL = { available: 'Available', partial: 'Partially configured', planned: 'Planned' } as const;

export default function AgentsPage() {
	return (
		<main className="mx-auto max-w-5xl space-y-6 p-4 md:p-8">
			<PageHeader eyebrow="Agents" title="Capabilities CRISP can use" description="These are workflows already in the product. A planned capability is labelled and does not pretend to be running." />
			<div className="grid gap-4 md:grid-cols-2">
				{AGENT_CAPABILITIES.map((agent) => (
					<article key={agent.id} className="card-info space-y-3">
						<div className="flex items-start justify-between gap-3">
							<div>
								<h2 className="text-lg font-semibold">{agent.name}</h2>
								<p className="text-sm text-text-soft">{agent.role}</p>
							</div>
							<StatusBadge label={STATUS_LABEL[agent.status]} tone={toneForStatus(STATUS_LABEL[agent.status])} />
						</div>
						<p className="text-sm">{agent.description}</p>
						{agent.tools.length ? <p className="text-sm text-text-soft">Includes {agent.tools.join(', ')}.</p> : null}
						{agent.href ? <Link className="btn-primary w-fit" href={agent.href}>{agent.action} →</Link> : <p className="text-sm text-text-dim">{agent.action}</p>}
					</article>
				))}
			</div>
		</main>
	);
}
