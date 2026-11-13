'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { humanAvailability, humanProposalStatus, humanVerification } from '@/lib/intelligence/knowledge/presentation';
import { CardSkeleton } from '@/components/skeletons/Skeleton';

type Proposal = {
	id: string;
	recordType: string;
	naturalKey: string;
	status: string;
	payload: {
		name?: string;
		description?: string;
		customerDescription?: string;
		availability?: string;
		verificationStatus?: string;
		platform?: string;
		implementationEvidence?: string;
		qaEvidence?: string;
		publicReleaseEvidence?: string;
		evidence?: string;
		recommendation?: string;
		limitations?: string;
		prohibited?: boolean;
	};
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
	proposals: Proposal[];
	capabilities: CapabilityRow[];
};

type Filter = 'all' | 'verified' | 'needs-verification' | 'proposed' | 'in-development' | 'private-preview' | 'closed';

const FILTERS: Array<{ id: Filter; label: string }> = [
	{ id: 'all', label: 'All' },
	{ id: 'verified', label: 'Verified' },
	{ id: 'needs-verification', label: 'Needs verification' },
	{ id: 'proposed', label: 'Proposed' },
	{ id: 'in-development', label: 'In development' },
	{ id: 'private-preview', label: 'Private preview' },
	{ id: 'closed', label: 'Rejected or deferred' },
];

export function CapabilityCatalogue({
	brandId,
	initialFilter = 'all',
	initialRecord = '',
	onRecord,
}: {
	brandId: string;
	initialFilter?: string;
	initialRecord?: string;
	onRecord?: (id: string) => void;
}) {
	const [overview, setOverview] = useState<Overview | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [notice, setNotice] = useState<string | null>(null);
	const [busy, setBusy] = useState<string | null>(null);
	const lock = useRef(false);
	const [query, setQuery] = useState('');
	const [filter, setFilter] = useState<Filter>(isFilter(initialFilter) ? initialFilter : 'all');
	const [selected, setSelected] = useState<string[]>([]);
	const [openId, setOpenId] = useState(initialRecord);
	const [confirm, setConfirm] = useState<{ label: string; detail: string; run: () => Promise<void> } | null>(null);

	const load = useCallback(async () => {
		const res = await fetch(`/api/intelligence/knowledge?airtableBrandId=${encodeURIComponent(brandId)}`, { cache: 'no-store' });
		const data = (await res.json()) as Overview & { error?: string };
		if (!res.ok) throw new Error(data.error || 'The capability catalogue could not be loaded.');
		setOverview(data);
	}, [brandId]);

	useEffect(() => {
		if (isFilter(initialFilter)) setFilter(initialFilter);
	}, [initialFilter]);

	useEffect(() => {
		setOpenId(initialRecord);
	}, [initialRecord]);

	useEffect(() => {
		let cancelled = false;
		load().catch((err: unknown) => {
			if (!cancelled) setError(err instanceof Error ? err.message : 'The capability catalogue could not be loaded.');
		});
		return () => {
			cancelled = true;
		};
	}, [load]);

	const rows = useMemo(() => {
		const capabilities = new Map((overview?.capabilities ?? []).map((row) => [row.name.toLowerCase(), row]));
		return (overview?.proposals ?? []).map((proposal) => {
			const capability = capabilities.get((proposal.payload.name || '').toLowerCase());
			return { proposal, capability };
		});
	}, [overview]);

	const visible = useMemo(() => {
		const needle = query.trim().toLowerCase();
		return rows
			.filter(({ proposal, capability }) => {
				if (!matchesFilter(filter, proposal, capability)) return false;
				if (!needle) return true;
				const haystack = `${proposal.payload.name ?? ''} ${proposal.payload.description ?? ''} ${proposal.payload.customerDescription ?? ''}`.toLowerCase();
				return haystack.includes(needle);
			})
			.sort((a, b) => (a.proposal.payload.name || '').localeCompare(b.proposal.payload.name || ''));
	}, [rows, query, filter]);

	const open = rows.find((row) => row.proposal.id === openId) ?? null;

	async function mutate(label: string, task: () => Promise<void>) {
		if (lock.current) return;
		lock.current = true;
		setBusy(label);
		setError(null);
		setNotice(null);
		try {
			await task();
			await load();
		} catch (err) {
			setError(err instanceof Error ? err.message : 'The change was not saved. You can try again.');
		} finally {
			lock.current = false;
			setBusy(null);
			setConfirm(null);
		}
	}

	async function post(body: Record<string, unknown>) {
		const res = await fetch('/api/intelligence/knowledge', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ airtableBrandId: brandId, ...body }),
		});
		const data = (await res.json()) as { error?: string; updated?: number; applied?: number };
		if (!res.ok) throw new Error(data.error || 'The change was not saved.');
		return data;
	}

	function ask(label: string, detail: string, run: () => Promise<void>) {
		setConfirm({ label, detail, run: () => mutate(label, run) });
	}

	if (!overview && !error) {
		return (
			<div className="space-y-3" aria-busy="true" aria-live="polite">
				<p className="text-sm text-text-soft">Loading capability catalogue…</p>
				<CardSkeleton />
				<CardSkeleton />
			</div>
		);
	}

	return (
		<div className="space-y-4">
			<div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
				<div>
					<h2 className="text-lg font-semibold">Capabilities</h2>
					<p className="mt-1 max-w-2xl text-sm text-text-soft">Approved means the record is in Brand Brain. Verified means the evidence supports using it as a product fact, within its availability limits.</p>
				</div>
				<label className="block text-sm">
					<span className="text-text-dim">Search</span>
					<input className="mt-1 w-full rounded-xl2 border border-edge/60 bg-surface/30 px-3 py-2 lg:w-72" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Name or description" />
				</label>
			</div>
			<div className="flex gap-2 overflow-x-auto" role="tablist" aria-label="Capability filters">
				{FILTERS.map((item) => (
					<button key={item.id} type="button" role="tab" aria-selected={filter === item.id} className={`shrink-0 rounded-full border px-3 py-1 text-sm ${filter === item.id ? 'border-primary bg-primary/15' : 'border-edge'}`} onClick={() => setFilter(item.id)}>
						{item.label}
					</button>
				))}
			</div>
			<div aria-live="polite" className="min-h-6 text-sm">
				{busy ? <span className="inline-flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" />{busy}</span> : null}
				{notice ? <span>{notice}</span> : null}
				{error ? <span className="text-danger">{error} Nothing else was changed.</span> : null}
			</div>
			{selected.length ? (
				<div className="card flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between">
					<p className="text-sm font-medium">{selected.length} selected</p>
					<div className="flex flex-wrap gap-2">
						<button type="button" className="rounded-xl2 border px-3 py-2 text-sm" disabled={Boolean(busy)} onClick={() => ask('Approving…', `Approve ${selected.length} proposed records. This does not verify them.`, async () => {
							const data = await post({ action: 'decide', status: 'approved', ids: selected });
							setNotice(`${data.updated ?? 0} records approved. They are not verified.`);
							setSelected([]);
						})}>Approve</button>
						<button type="button" className="rounded-xl2 border px-3 py-2 text-sm" disabled={Boolean(busy)} onClick={() => ask('Deferring…', `Defer ${selected.length} records. They stay out of customer-facing facts.`, async () => {
							const data = await post({ action: 'decide', status: 'deferred', ids: selected });
							setNotice(`${data.updated ?? 0} records deferred.`);
							setSelected([]);
						})}>Defer</button>
						<button type="button" className="rounded-xl2 border px-3 py-2 text-sm" disabled={Boolean(busy)} onClick={() => ask('Applying…', 'Add the approved records to Brand Brain. Verification stays unchanged.', async () => {
							const data = await post({ action: 'apply', ids: selected });
							setNotice(`${data.applied ?? 0} records added to Brand Brain. None were verified by this action.`);
							setSelected([]);
						})}>Apply approved</button>
					</div>
				</div>
			) : null}
			{confirm ? (
				<div className="card space-y-3 border-primary/40 p-4" role="alertdialog" aria-label="Confirm capability action">
					<p className="text-sm">{confirm.detail}</p>
					<div className="flex gap-2">
						<button type="button" className="rounded-xl2 border border-primary/40 bg-primary/10 px-3 py-2 text-sm" disabled={Boolean(busy)} onClick={() => void confirm.run()}>{busy || 'Continue'}</button>
						<button type="button" className="rounded-xl2 border px-3 py-2 text-sm" disabled={Boolean(busy)} onClick={() => setConfirm(null)}>Cancel</button>
					</div>
				</div>
			) : null}
			{visible.length === 0 ? <p className="text-sm text-text-dim">No capabilities match this view.</p> : null}
			<ul className="space-y-2 md:hidden">
				{visible.map(({ proposal, capability }) => (
					<li key={proposal.id} className="card p-3">
						<div className="flex items-start justify-between gap-3">
							<div>
								<p className="font-medium">{proposal.payload.name}</p>
								<p className="text-sm text-text-soft">{proposal.payload.platform || 'Product'} · {humanAvailability(capability?.availability || proposal.payload.availability)}</p>
								<p className="text-sm">{capability ? humanVerification(capability.verificationStatus) : humanProposalStatus(proposal.status)}</p>
							</div>
							<button type="button" className="rounded-xl2 border px-3 py-2 text-sm" onClick={() => { setOpenId(proposal.id); onRecord?.(proposal.id); }}>View</button>
						</div>
					</li>
				))}
			</ul>
			<div className="hidden overflow-x-auto md:block">
				<table className="w-full text-sm">
					<thead>
						<tr className="text-left text-text-dim">
							<th className="py-2 pr-3"><span className="sr-only">Select</span></th>
							<th className="py-2 pr-3">Capability</th>
							<th className="py-2 pr-3">Product</th>
							<th className="py-2 pr-3">Availability</th>
							<th className="py-2 pr-3">Verification</th>
							<th className="py-2">Action</th>
						</tr>
					</thead>
					<tbody>
						{visible.map(({ proposal, capability }) => (
							<tr key={proposal.id} className="border-t border-edge/40">
								<td className="py-2 pr-3">
									<input type="checkbox" aria-label={`Select ${proposal.payload.name}`} checked={selected.includes(proposal.id)} disabled={proposal.status === 'applied' || proposal.status === 'rejected'} onChange={(event) => setSelected((current) => event.target.checked ? [...current, proposal.id] : current.filter((id) => id !== proposal.id))} />
								</td>
								<td className="py-2 pr-3 font-medium">{proposal.payload.name}</td>
								<td className="py-2 pr-3">{proposal.payload.platform || '—'}</td>
								<td className="py-2 pr-3">{humanAvailability(capability?.availability || proposal.payload.availability)}</td>
								<td className="py-2 pr-3">{capability ? humanVerification(capability.verificationStatus) : humanProposalStatus(proposal.status)}</td>
								<td className="py-2">
									<button type="button" className="underline" onClick={() => { setOpenId(proposal.id); onRecord?.(proposal.id); }}>View</button>
								</td>
							</tr>
						))}
					</tbody>
				</table>
			</div>
			{open ? (
				<CapabilityDetail
					proposal={open.proposal}
					capability={open.capability}
					busy={busy}
					onClose={() => { setOpenId(''); onRecord?.(''); }}
					onSave={(description) => mutate('Saving description…', async () => {
						await post({ action: 'describe', proposalId: open.proposal.id, text: description });
						setNotice('Description saved. Verification was not changed.');
					})}
					onDecide={(status) => ask(status === 'approved' ? 'Approving…' : status === 'deferred' ? 'Deferring…' : 'Rejecting…', status === 'approved' ? 'Approve this record. It will not be verified.' : 'This record will stay out of customer-facing facts.', async () => {
						await post({ action: 'decide', status, ids: [open.proposal.id] });
						setNotice(status === 'approved' ? 'Approved. It is not verified yet.' : status === 'deferred' ? 'Deferred.' : 'Rejected.');
					})}
					onApply={() => ask('Applying…', 'Add this approved record to Brand Brain. This does not verify it.', async () => {
						await post({ action: 'apply', ids: [open.proposal.id] });
						setNotice('Added to Brand Brain. It still needs verification.');
					})}
					onVerify={() => {
						if (!open.capability) return;
						ask('Verifying…', 'Mark this capability verified. It can then be used as a product fact, within its availability limits.', async () => {
							await post({ action: 'verify', ids: [open.capability!.id], verificationStatus: 'verified' });
							setNotice('Capability verified.');
						});
					}}
				/>
			) : null}
		</div>
	);
}

function CapabilityDetail({
	proposal,
	capability,
	busy,
	onClose,
	onSave,
	onDecide,
	onApply,
	onVerify,
}: {
	proposal: Proposal;
	capability?: CapabilityRow;
	busy: string | null;
	onClose: () => void;
	onSave: (description: string) => void;
	onDecide: (status: 'approved' | 'rejected' | 'deferred') => void;
	onApply: () => void;
	onVerify: () => void;
}) {
	const [description, setDescription] = useState(proposal.payload.customerDescription || proposal.payload.description || '');
	const dirty = description !== (proposal.payload.customerDescription || proposal.payload.description || '');
	const evidence = [
		['Implementation', proposal.payload.implementationEvidence],
		['QA', proposal.payload.qaEvidence],
		['Public release', proposal.payload.publicReleaseEvidence || proposal.payload.evidence],
		['Limits', proposal.payload.limitations],
		['Recommendation', proposal.payload.recommendation],
	].filter((row): row is [string, string] => Boolean(row[1]));
	return (
		<section className="card space-y-4 p-4" aria-label={`${proposal.payload.name} details`}>
			<div className="flex items-start justify-between gap-3">
				<div>
					<h3 className="text-lg font-semibold">{proposal.payload.name}</h3>
					<p className="text-sm text-text-soft">{proposal.payload.platform || 'Product'} · {humanAvailability(capability?.availability || proposal.payload.availability)} · {capability ? humanVerification(capability.verificationStatus) : humanProposalStatus(proposal.status)}</p>
					{capability?.lastVerified ? <p className="text-xs text-text-dim">Last verified {capability.lastVerified}</p> : null}
				</div>
				<button type="button" className="rounded-xl2 border px-3 py-2 text-sm" onClick={onClose}>Close</button>
			</div>
			<label className="block text-sm">
				<span className="text-text-dim">Customer-facing description</span>
				<textarea className="mt-1 w-full rounded-xl2 border bg-transparent p-2" rows={4} value={description} onChange={(event) => setDescription(event.target.value)} />
			</label>
			<p className="text-sm">{dirty ? 'Unsaved description' : 'Description saved'}</p>
			<div className="flex flex-wrap gap-2">
				<button type="button" className="rounded-xl2 border border-primary/40 bg-primary/10 px-3 py-2 text-sm" disabled={Boolean(busy) || !dirty} onClick={() => onSave(description)}>{busy === 'Saving description…' ? 'Saving…' : 'Save description'}</button>
				{proposal.status === 'proposed' || proposal.status === 'deferred' ? <button type="button" className="rounded-xl2 border px-3 py-2 text-sm" disabled={Boolean(busy)} onClick={() => onDecide('approved')}>Approve</button> : null}
				{proposal.status === 'approved' ? <button type="button" className="rounded-xl2 border px-3 py-2 text-sm" disabled={Boolean(busy)} onClick={onApply}>Add to Brand Brain</button> : null}
				{capability && capability.verificationStatus !== 'verified' ? <button type="button" className="rounded-xl2 border px-3 py-2 text-sm" disabled={Boolean(busy)} onClick={onVerify}>Verify</button> : null}
				{proposal.status === 'proposed' || proposal.status === 'approved' ? <button type="button" className="rounded-xl2 border px-3 py-2 text-sm" disabled={Boolean(busy)} onClick={() => onDecide('deferred')}>Defer</button> : null}
				{proposal.status !== 'rejected' && proposal.status !== 'applied' ? <button type="button" className="rounded-xl2 border px-3 py-2 text-sm" disabled={Boolean(busy)} onClick={() => onDecide('rejected')}>Reject</button> : null}
			</div>
			<dl className="space-y-2 text-sm">
				{evidence.map(([label, value]) => (
					<div key={label}>
						<dt className="text-text-dim">{label}</dt>
						<dd>{value}</dd>
					</div>
				))}
			</dl>
		</section>
	);
}

function matchesFilter(filter: Filter, proposal: Proposal, capability?: CapabilityRow): boolean {
	if (filter === 'all') return true;
	if (filter === 'verified') return capability?.verificationStatus === 'verified';
	if (filter === 'needs-verification') return Boolean(capability) && capability?.verificationStatus !== 'verified';
	if (filter === 'proposed') return proposal.status === 'proposed' || proposal.status === 'approved';
	if (filter === 'in-development') return (capability?.availability || proposal.payload.availability) === 'in_development';
	if (filter === 'private-preview') return (capability?.availability || proposal.payload.availability) === 'private_preview';
	return proposal.status === 'rejected' || proposal.status === 'deferred';
}

function isFilter(value: string): value is Filter {
	return FILTERS.some((item) => item.id === value);
}
