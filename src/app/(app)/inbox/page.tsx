'use client';

import { Suspense, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { PageHeader } from '@/components/command/PageHeader';
import { StatusBadge, toneForStatus } from '@/components/command/StatusBadge';
import { useWorkspaceOperations } from '@/components/command/useWorkspaceOperations';
import { answerFromRecord, buildInboxConversations, type InboxFilter } from '@/lib/command/inboxModel';

const FILTERS: Array<{ id: InboxFilter; label: string }> = [
	{ id: 'attention', label: 'Needs attention' },
	{ id: 'approval', label: 'Needs approval' },
	{ id: 'progress', label: 'In progress' },
	{ id: 'completed', label: 'Completed' },
	{ id: 'all', label: 'All activity' },
];

export default function InboxPage() {
	return (
		<Suspense fallback={<main className="p-6 text-sm text-text-soft">Loading inbox…</main>}>
			<InboxWorkspace />
		</Suspense>
	);
}

function InboxWorkspace() {
	const params = useSearchParams();
	const { data, error } = useWorkspaceOperations();
	const [filter, setFilter] = useState<InboxFilter>('all');
	const [selectedId, setSelectedId] = useState<string | null>(params.get('focus'));
	const [showList, setShowList] = useState(!params.get('focus'));
	const [question, setQuestion] = useState('');
	const [answer, setAnswer] = useState('');
	const conversations = useMemo(() => data ? buildInboxConversations({
		workspace: data.brandName,
		jobs: data.jobs,
		opportunities: data.opportunities,
		articles: data.articles,
	}) : [], [data]);
	const visible = conversations.filter((item) => filter === 'all' || item.filter === filter);
	const selected = visible.find((item) => item.id === selectedId) ?? conversations.find((item) => item.id === selectedId) ?? visible[0] ?? null;

	return (
		<main className="mx-auto max-w-6xl space-y-4 p-4 md:p-6">
			<PageHeader eyebrow="Inbox" title="Decisions in one place" description="Related work stays in one conversation. Questions here are answered from the recorded status and note. They do not approve, publish, or invent a chat history." />
			{error ? <p className="card border-danger/70 p-4" role="alert">{error}</p> : null}
			<div className="flex flex-wrap gap-2" role="tablist" aria-label="Inbox filters">
				{FILTERS.map((item) => {
					const count = item.id === 'all' ? conversations.length : conversations.filter((row) => row.filter === item.id).length;
					return (
						<button key={item.id} type="button" className={filter === item.id ? 'btn-primary' : 'btn'} aria-pressed={filter === item.id} onClick={() => setFilter(item.id)}>{item.label} · {count}</button>
					);
				})}
			</div>
			{!data && !error ? <p className="text-sm text-text-soft">Loading decisions…</p> : null}
			<div className="grid min-h-[32rem] gap-3 lg:grid-cols-[18rem_minmax(0,1fr)_16rem]">
				<section className={`space-y-2 ${showList ? '' : 'hidden lg:block'}`} aria-label="Conversations">
					{data && !visible.length ? <p className="card-info text-sm text-text-soft">Nothing in this filter.</p> : null}
					{visible.map((item) => (
						<button key={item.id} type="button" aria-pressed={item.id === selected?.id} className={`card-info w-full space-y-1 text-left ${item.id === selected?.id ? 'ring-2 ring-primary' : ''}`} onClick={() => { setSelectedId(item.id); setAnswer(''); setShowList(false); }}>
							<span className="block font-medium">{item.title}</span>
							<span className="block text-sm text-text-soft">{item.status} · {item.stage}</span>
						</button>
					))}
				</section>
				{selected ? (
					<section className={`card-info flex flex-col gap-4 ${showList ? 'hidden lg:flex' : ''}`} aria-label="Conversation">
						<button type="button" className="w-fit rounded-lg border border-edge px-3 py-2 text-sm lg:hidden" onClick={() => setShowList(true)}>Back to list</button>
						<header className="space-y-1">
							<h2 className="text-xl font-semibold">{selected.title}</h2>
							<p className="text-sm text-text-soft">{selected.workspace} · {selected.stage}</p>
							<StatusBadge label={selected.status} tone={toneForStatus(selected.status)} />
						</header>
						<ol className="space-y-3">
							{selected.events.map((event, index) => (
								<li key={`${event.speaker}-${index}`} className="rounded-xl border border-edge bg-surface-muted px-3 py-3">
									<p className="text-xs font-semibold uppercase tracking-wide text-text-dim">{event.speaker}</p>
									<p className="mt-1 text-sm">{event.text}</p>
								</li>
							))}
						</ol>
						<form className="mt-auto space-y-2" onSubmit={(event) => { event.preventDefault(); setAnswer(answerFromRecord(question, selected)); }}>
							<label className="block text-sm font-medium" htmlFor="inbox-question">Ask about this record</label>
							<textarea id="inbox-question" className="input w-full" rows={3} value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="Why did this stop?" />
							<button type="button" className="btn-primary" onClick={() => setAnswer(answerFromRecord(question || 'why', selected))}>Explain from the record</button>
							{answer ? <p className="rounded-xl border border-edge bg-bg p-3 text-sm">{answer}</p> : null}
						</form>
					</section>
				) : <section className="card-info text-sm text-text-soft">Select a conversation.</section>}
				{selected ? (
					<aside className={`card-info space-y-3 ${showList ? 'hidden lg:block' : ''}`}>
						<h3 className="font-semibold">Context</h3>
						<p className="text-sm text-text-soft">Status and stage come from the production job. The full article remains the place for editorial decisions.</p>
						<Link className="btn w-full" href={selected.href}>Open the full record</Link>
						<p className="text-xs text-text-dim">No approval or publishing control is on this page.</p>
					</aside>
				) : null}
			</div>
		</main>
	);
}
