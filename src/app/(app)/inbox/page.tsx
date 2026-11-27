'use client';

import { useMemo, useState } from 'react';
import { ActionCard } from '@/components/command/ActionCard';
import { PageHeader } from '@/components/command/PageHeader';
import { useWorkspaceOperations } from '@/components/command/useWorkspaceOperations';

const FILTERS = ['Needs my approval', 'Needs attention', 'Ready for review', 'Completed', 'All activity'] as const;

function bucket(detail: string): (typeof FILTERS)[number] {
	if (/awaiting approval/i.test(detail)) return 'Needs my approval';
	if (/blocked|failed|resolve/i.test(detail)) return 'Needs attention';
	if (/published/i.test(detail)) return 'Completed';
	return 'Ready for review';
}

export default function InboxPage() {
	const { data, error } = useWorkspaceOperations();
	const [filter, setFilter] = useState<(typeof FILTERS)[number]>('All activity');
	const items = useMemo(() => {
		const actions = data?.view.actions ?? [];
		const completed = (data?.view.activity ?? []).filter((item) => /published/i.test(item.detail)).map((item) => ({ ...item, detail: item.detail }));
		return [...actions, ...completed];
	}, [data]);
	const visible = items.filter((item) => filter === 'All activity' || bucket(item.detail) === filter);

	return (
		<main className="mx-auto max-w-5xl space-y-6 p-4 md:p-8">
			<PageHeader eyebrow="Inbox" title="Decisions waiting on you" description="Each item is a real record. Approving here is not available from this list — open the record to see exactly what an approval will do." />
			{error ? <p className="card border-danger/70 p-4" role="alert">{error}</p> : null}
			<div className="flex flex-wrap gap-2" role="tablist" aria-label="Inbox filters">
				{FILTERS.map((name) => {
					const count = name === 'All activity' ? items.length : items.filter((item) => bucket(item.detail) === name).length;
					return (
						<button key={name} type="button" className={filter === name ? 'btn-primary' : 'btn'} onClick={() => setFilter(name)}>{name} · {count}</button>
					);
				})}
			</div>
			{!data && !error ? <p className="text-sm text-text-soft">Loading decisions…</p> : null}
			<div className="space-y-3">
				{data && !visible.length ? <p className="card-info text-sm text-text-soft">Nothing in this filter.</p> : null}
				{visible.map((item) => (
					<ActionCard key={`${item.href}-${item.title}-${item.detail}`} title={item.title} detail={item.detail} status={bucket(item.detail)} href={item.href} action="Open record" />
				))}
			</div>
		</main>
	);
}
