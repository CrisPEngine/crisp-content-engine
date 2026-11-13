'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { humanEvent, nextIntelligenceAction, type IntelligenceSection } from '@/lib/intelligence/knowledge/presentation';
import { CardSkeleton } from '@/components/skeletons/Skeleton';

type HomeData = {
	counts: {
		verifiedCapabilities: number;
		pendingProposals: number;
		sourcesNeedingReview: number;
	};
	strategy: { status: string; phase: string | null } | null;
	activeThemes: Array<{ id: string; title: string }>;
	approvedLearnings: number;
	proposedLearnings: number;
	activity?: Array<{ id: string; action: string; note?: string | null; createdAt: string }>;
};

export function IntelligenceHome({
	brandId,
	brandName,
	onOpen,
}: {
	brandId: string;
	brandName: string;
	onOpen: (section: IntelligenceSection, extra?: { area?: string; filter?: string }) => void;
}) {
	const [data, setData] = useState<HomeData | null>(null);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		let cancelled = false;
		fetch(`/api/intelligence/knowledge?airtableBrandId=${encodeURIComponent(brandId)}`, { cache: 'no-store' })
			.then(async (res) => {
				const body = (await res.json()) as HomeData & { error?: string };
				if (!res.ok) throw new Error(body.error || 'The overview could not be loaded.');
				if (!cancelled) setData(body);
			})
			.catch((err: unknown) => {
				if (!cancelled) setError(err instanceof Error ? err.message : 'The overview could not be loaded.');
			});
		return () => {
			cancelled = true;
		};
	}, [brandId]);

	if (error) return <p className="text-sm text-danger">{error}</p>;
	if (!data) {
		return (
			<div className="space-y-3" aria-busy="true">
				<p className="text-sm text-text-soft">Loading {brandName}…</p>
				<div className="grid gap-3 sm:grid-cols-3"><CardSkeleton /><CardSkeleton /><CardSkeleton /></div>
			</div>
		);
	}

	const next = nextIntelligenceAction({
		verified: data.counts.verifiedCapabilities,
		pendingProposals: data.counts.pendingProposals,
		strategyStatus: data.strategy?.status ?? null,
		activeThemes: data.activeThemes.length,
		pendingLearnings: data.proposedLearnings,
	});
	const attention: Array<{ label: string; section: IntelligenceSection; area?: string; filter?: string }> = [];
	if (data.counts.pendingProposals) attention.push({ label: `${data.counts.pendingProposals} knowledge records awaiting a decision`, section: 'brain', area: 'capabilities', filter: 'proposed' });
	if (data.counts.sourcesNeedingReview) attention.push({ label: `${data.counts.sourcesNeedingReview} evidence sources need review`, section: 'brain', area: 'capabilities', filter: 'needs-verification' });
	if (data.proposedLearnings) attention.push({ label: `${data.proposedLearnings} learnings awaiting approval`, section: 'learnings', filter: 'pending' });
	if (!data.strategy || data.strategy.status !== 'active') attention.push({ label: 'Strategy is not active', section: 'strategy' });
	const cards = [
		['Verified capabilities', String(data.counts.verifiedCapabilities)],
		['Pending proposals', String(data.counts.pendingProposals)],
		['Evidence to review', String(data.counts.sourcesNeedingReview)],
		['Strategy', data.strategy?.status || 'None'],
		['Active themes', String(data.activeThemes.length)],
		['Pending learnings', String(data.proposedLearnings)],
	];

	return (
		<div className="space-y-6">
			<section className="card space-y-2 p-4">
				<p className="text-sm text-text-dim">Recommended next action</p>
				<h2 className="text-xl font-semibold">{next.title}</h2>
				<p className="text-sm text-text-soft">{next.detail}</p>
				<div className="flex flex-wrap gap-2">
					{next.section === 'overview' ? (
						<Link className="rounded-xl2 border border-primary/40 bg-primary/10 px-3 py-2 text-sm" href={`/content/articles/new?brand_profile_id=${encodeURIComponent(brandId)}`}>Test in an article</Link>
					) : (
						<button type="button" className="rounded-xl2 border border-primary/40 bg-primary/10 px-3 py-2 text-sm" onClick={() => onOpen(next.section, { area: next.area, filter: next.filter })}>Continue</button>
					)}
					<Link className="rounded-xl2 border px-3 py-2 text-sm" href="/content/articles">Open articles</Link>
				</div>
			</section>
			<section>
				<h2 className="mb-3 font-medium">Needs your attention</h2>
				{attention.length === 0 ? <p className="text-sm text-text-soft">Nothing is waiting. You can still review any section.</p> : (
					<ul className="space-y-2">
						{attention.map((item) => (
							<li key={item.label}>
								<button type="button" className="card w-full px-4 py-3 text-left text-sm hover:bg-surface/60" onClick={() => onOpen(item.section, { area: item.area, filter: item.filter })}>{item.label}</button>
							</li>
						))}
					</ul>
				)}
			</section>
			<dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
				{cards.map(([label, value]) => (
					<div key={label} className="card p-4">
						<dt className="text-sm text-text-dim">{label}</dt>
						<dd className="mt-1 text-2xl font-semibold capitalize">{value}</dd>
					</div>
				))}
			</dl>
			<section>
				<h2 className="mb-3 font-medium">Recent activity</h2>
				{data.activity?.length ? (
					<ul className="space-y-2 text-sm">
						{data.activity.map((item) => (
							<li key={item.id} className="card px-4 py-3">
								<p>{humanEvent(item.action)}</p>
								<p className="text-text-dim">{new Date(item.createdAt).toLocaleString()}</p>
							</li>
						))}
					</ul>
				) : <p className="text-sm text-text-dim">No knowledge changes have been recorded yet.</p>}
			</section>
		</div>
	);
}
