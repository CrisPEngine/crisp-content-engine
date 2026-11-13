'use client';

import { useCallback, useEffect, useState } from 'react';

type Proposal = {
	id: string;
	recordType: string;
	naturalKey: string;
	status: string;
	payload: { name?: string; description?: string; availability?: string; verificationStatus?: string; evidence?: string; prohibited?: boolean };
};

type CapabilityRow = {
	id: string;
	name: string;
	availability: string;
	verificationStatus: string;
	evidence?: string | null;
	lastVerified?: string | null;
};

type Overview = {
	counts: {
		products: number;
		verifiedCapabilities: number;
		unverifiedCapabilities: number;
		pendingProposals: number;
		sourcesNeedingReview: number;
		tablesAvailable: boolean;
	};
	strategy: { status: string; objectives: string[]; pillars: string[]; phase: string | null } | null;
	activeThemes: Array<{ id: string; title: string }>;
	approvedLearnings: number;
	proposedLearnings: number;
	gaps: string[];
	proposals: Proposal[];
	capabilities: CapabilityRow[];
};

export function KnowledgeOverview({ brandId, onOpenTab }: { brandId: string; onOpenTab: (tab: 'brain' | 'strategy' | 'themes' | 'learnings' | 'diagnostics') => void }) {
	const [overview, setOverview] = useState<Overview | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);
	const [selectedCapabilities, setSelectedCapabilities] = useState<string[]>([]);
	const [notice, setNotice] = useState<string | null>(null);

	const load = useCallback(async () => {
		const res = await fetch(`/api/intelligence/knowledge?airtableBrandId=${encodeURIComponent(brandId)}`, { cache: 'no-store' });
		const data = (await res.json()) as Overview & { error?: string };
		if (!res.ok) throw new Error(data.error || 'Knowledge overview failed');
		setOverview(data);
		setSelected([]);
		setSelectedCapabilities([]);
	}, [brandId]);

	useEffect(() => {
		let cancelled = false;
		load()
			.catch((err: unknown) => {
				if (!cancelled) setError(err instanceof Error ? err.message : 'Knowledge overview failed');
			});
		return () => {
			cancelled = true;
		};
	}, [load]);

	async function run(action: 'discover' | 'decide' | 'apply' | 'verify', status?: 'approved' | 'rejected' | 'deferred', verificationStatus?: 'verified' | 'evidence_outdated' | 'disputed') {
		setBusy(true);
		setError(null);
		setNotice(null);
		try {
			const res = await fetch('/api/intelligence/knowledge', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					airtableBrandId: brandId,
					action,
					ids: action === 'verify' ? selectedCapabilities : selected,
					status,
					verificationStatus,
				}),
			});
			const data = (await res.json()) as { error?: string; updated?: number; applied?: number };
			if (!res.ok) throw new Error(data.error || 'Knowledge action failed');
			const saved = action === 'discover'
				? 'Discovery added only new proposals. Existing decisions were kept. Model calls: 0.'
				: action === 'apply'
					? `${data.applied ?? 0} approved proposals applied. Approval did not mark them verified. Model calls: 0.`
					: action === 'verify'
						? `${data.updated ?? 0} capabilities saved as ${verificationStatus}. Model calls: 0.`
						: `${data.updated ?? 0} proposals saved as ${status}. Model calls: 0.`;
			setNotice(saved);
			await load();
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Knowledge action failed');
		} finally {
			setBusy(false);
		}
	}

	if (error && !overview) return <div className="card p-4 text-sm text-danger">{error}</div>;
	if (!overview) return <div className="card p-4 text-sm text-text-dim">Loading knowledge overview…</div>;
	const counts = overview.counts;

	return (
		<section className="card p-4 space-y-4" aria-label="Brand knowledge overview">
			<div className="flex flex-wrap items-center justify-between gap-3">
				<h2 className="text-lg font-semibold">Knowledge overview</h2>
				<button type="button" className="px-3 py-2 rounded-xl2 border text-sm" disabled={busy || !counts.tablesAvailable} onClick={() => void run('discover')}>
					Discover from configured sources
				</button>
			</div>
			{!counts.tablesAvailable ? <p className="text-sm">Knowledge tables are not available yet. Existing Brand Brain fields are unchanged.</p> : null}
			{notice ? <p className="text-sm">{notice}</p> : null}
			{error ? <p className="text-sm text-danger">{error}</p> : null}
			<dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
				<Metric label="Products" value={counts.tablesAvailable ? String(counts.products) : 'Not available'} onClick={() => onOpenTab('brain')} />
				<Metric label="Verified capabilities" value={counts.tablesAvailable ? String(counts.verifiedCapabilities) : 'Not available'} onClick={() => onOpenTab('brain')} />
				<Metric label="Unverified capabilities" value={counts.tablesAvailable ? String(counts.unverifiedCapabilities) : 'Not available'} onClick={() => onOpenTab('brain')} />
				<Metric label="Pending proposals" value={counts.tablesAvailable ? String(counts.pendingProposals) : 'Not available'} />
				<Metric label="Sources needing review" value={counts.tablesAvailable ? String(counts.sourcesNeedingReview) : 'Not available'} />
				<Metric label="Active strategy" value={overview.strategy ? overview.strategy.status : 'Not available'} onClick={() => onOpenTab('strategy')} />
				<Metric label="Active themes" value={String(overview.activeThemes.length)} onClick={() => onOpenTab('themes')} />
				<Metric label="Approved learnings" value={String(overview.approvedLearnings)} onClick={() => onOpenTab('learnings')} />
			</dl>
			{overview.gaps.map((gap) => <p key={gap} className="text-sm">{gap}</p>)}
			{overview.strategy ? <p className="text-sm">Objectives: {overview.strategy.objectives.join('; ') || 'None stored'}. Pillars: {overview.strategy.pillars.join('; ') || 'None stored'}.</p> : null}
			<p className="text-sm">Approving a proposal records the knowledge. It does not verify it. A website sentence alone is not verification.</p>
			{overview.capabilities?.length ? (
				<div className="space-y-2">
					<h3 className="font-medium">Capabilities</h3>
					<ul className="divide-y">
						{overview.capabilities.map((item) => (
							<li key={item.id} className="py-2 text-sm">
								<label className="flex gap-3">
									<input type="checkbox" checked={selectedCapabilities.includes(item.id)} onChange={(event) => setSelectedCapabilities((current) => event.target.checked ? [...current, item.id] : current.filter((id) => id !== item.id))} />
									<span>
										<span className="font-medium">{item.name}</span>
										<span> · {item.availability} · {item.verificationStatus.replace(/_/g, ' ')}{item.lastVerified ? ` · verified ${item.lastVerified}` : ''}</span>
										{item.evidence ? <span className="block text-text-dim">{item.evidence}</span> : <span className="block">Evidence missing.</span>}
									</span>
								</label>
							</li>
						))}
					</ul>
					<div className="flex flex-wrap gap-2">
						<button type="button" className="px-3 py-2 rounded-xl2 border text-sm" disabled={busy || !selectedCapabilities.length} onClick={() => void run('verify', undefined, 'verified')}>Mark selected verified</button>
						<button type="button" className="px-3 py-2 rounded-xl2 border text-sm" disabled={busy || !selectedCapabilities.length} onClick={() => void run('verify', undefined, 'evidence_outdated')}>Flag evidence for review</button>
						<button type="button" className="px-3 py-2 rounded-xl2 border text-sm" disabled={busy || !selectedCapabilities.length} onClick={() => void run('verify', undefined, 'disputed')}>Mark disputed</button>
					</div>
				</div>
			) : null}
			<div className="space-y-2">
				<h3 className="font-medium">Proposals</h3>
				<div className="flex flex-wrap gap-2">
					<button type="button" className="px-3 py-2 rounded-xl2 border text-sm" disabled={busy || !selected.length} onClick={() => void run('decide', 'approved')}>Approve selected</button>
					<button type="button" className="px-3 py-2 rounded-xl2 border text-sm" disabled={busy || !selected.length} onClick={() => void run('decide', 'rejected')}>Reject selected</button>
					<button type="button" className="px-3 py-2 rounded-xl2 border text-sm" disabled={busy || !selected.length} onClick={() => void run('decide', 'deferred')}>Defer selected</button>
					<button type="button" className="px-3 py-2 rounded-xl2 border text-sm" disabled={busy} onClick={() => void run('apply')}>Apply approved</button>
				</div>
				{overview.proposals.length ? (
					<ul className="divide-y">
						{overview.proposals.map((proposal) => (
							<li key={proposal.id} className="py-3">
								<label className="flex gap-3 text-sm">
									<input
										type="checkbox"
										checked={selected.includes(proposal.id)}
										disabled={proposal.status === 'applied'}
										onChange={(event) => setSelected((current) => event.target.checked ? [...current, proposal.id] : current.filter((id) => id !== proposal.id))}
									/>
									<span>
										<span className="font-medium">{proposal.payload.name || proposal.naturalKey}</span>
										<span className="text-text-dim"> · {proposal.status} · {proposal.payload.availability || proposal.recordType} · {proposal.payload.verificationStatus || 'verification required'}</span>
										<span className="block text-text-dim">{proposal.payload.description}</span>
										{proposal.payload.evidence ? <span className="block">{proposal.payload.evidence}</span> : null}
									</span>
								</label>
							</li>
						))}
					</ul>
				) : <p className="text-sm text-text-dim">No knowledge proposals.</p>}
			</div>
		</section>
	);
}

function Metric({ label, value, onClick }: { label: string; value: string; onClick?: () => void }) {
	const body = (
		<>
			<dt className="text-text-dim">{label}</dt>
			<dd className="text-xl font-semibold">{value}</dd>
		</>
	);
	if (!onClick) return <div className="rounded-xl2 border border-edge/60 p-3"><dl>{body}</dl></div>;
	return <button type="button" onClick={onClick} className="rounded-xl2 border border-edge/60 p-3 text-left"><dl>{body}</dl></button>;
}
