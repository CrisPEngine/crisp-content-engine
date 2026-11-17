'use client';

import { useCallback, useEffect, useState } from 'react';
import type { ContentCampaign, ContentOpportunity, ProviderAvailability } from '@/lib/campaigns/types';

type Brand = { id: string; name: string };
type Queue = { opportunities: ContentOpportunity[]; campaigns: ContentCampaign[]; providers: ProviderAvailability[] };

const DEMAND_LABEL = {
	observed: 'Observed demand',
	inferred: 'Inferred demand',
	strategic: 'Strategic suggestion',
	unvalidated: 'Unvalidated idea',
} as const;

export default function CampaignsPage() {
	const [brands, setBrands] = useState<Brand[]>([]);
	const [brandId, setBrandId] = useState('');
	const [queue, setQueue] = useState<Queue | null>(null);
	const [error, setError] = useState('');
	const [notice, setNotice] = useState('');
	const [pending, setPending] = useState('');
	const [topic, setTopic] = useState('');
	const [title, setTitle] = useState('');
	const [problem, setProblem] = useState('');
	const [campaignName, setCampaignName] = useState('');
	const [capacity, setCapacity] = useState(3);
	const [openId, setOpenId] = useState<string | null>(null);
	const [connection, setConnection] = useState<{
		searchConsole?: { state?: string; property?: string | null; retrievedAt?: string | null; error?: string | null; queryCount?: number; pageCount?: number };
		analytics?: { state?: string; property?: string | null; retrievedAt?: string | null; error?: string | null; keyEvents?: string | null; organic?: { sessions?: number | null } | null };
	} | null>(null);

	const load = useCallback(async (id: string) => {
		if (!id) return;
		setPending('load');
		setError('');
		const response = await fetch(`/api/campaigns?brandId=${encodeURIComponent(id)}`);
		const body = await response.json();
		setPending('');
		if (!response.ok) {
			setError(body.error ?? 'The opportunity queue could not be loaded.');
			return;
		}
		setQueue(body as Queue);
	}, []);

	useEffect(() => {
		fetch('/api/intelligence/brands')
			.then((response) => response.json())
			.then((body: { brands?: Brand[] }) => {
				const rows = body.brands ?? [];
				setBrands(rows);
				const folian = rows.find((brand) => /folian/i.test(brand.name));
				setBrandId(folian?.id ?? rows[0]?.id ?? '');
			})
			.catch(() => setError('Brands could not be loaded.'));
	}, []);

	useEffect(() => {
		if (brandId) void load(brandId);
	}, [brandId, load]);

	async function post(action: string, extra: Record<string, unknown>, pendingLabel: string, success: string) {
		setPending(pendingLabel);
		setError('');
		setNotice('');
		const response = await fetch('/api/campaigns', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ action, brandId, ...extra }),
		});
		const body = await response.json();
		setPending('');
		if (!response.ok) {
			setError(body.error ?? 'That action failed. Nothing was published.');
			return;
		}
		setNotice(success);
		if (action === 'test_analytics') setConnection(body.test ?? null);
		await load(brandId);
	}

	function providerLabel(state: string): string {
		if (state === 'connected') return 'Connected';
		if (state === 'error') return 'Error';
		if (state === 'available') return 'Available';
		return 'Unavailable';
	}

	const busy = pending !== '';
	return (
		<div className="mx-auto max-w-6xl space-y-6 p-4">
			<header>
				<p className="text-xs text-text-dim">CCE / Campaigns / Opportunities</p>
				<h1 className="text-2xl font-semibold">Opportunity queue</h1>
				<p className="text-sm text-text-soft">Discover and validate a topic before an article is produced. A weekly number is a maximum, not a quota.</p>
			</header>
			<label className="block text-sm">
				Brand
				<select className="input mt-1" value={brandId} onChange={(event) => setBrandId(event.target.value)}>
					{brands.map((brand) => <option key={brand.id} value={brand.id}>{brand.name}</option>)}
				</select>
			</label>
			<div aria-live="polite">
				{error ? <p className="card border-danger/60 p-3 text-sm" role="alert">{error}</p> : null}
				{notice ? <p className="card p-3 text-sm" role="status">{notice}</p> : null}
			</div>
			<section className="grid gap-3 md:grid-cols-3">
				{(queue?.providers ?? []).map((provider) => (
					<article key={provider.id} className="card p-3 text-sm">
						<p className="font-medium">{provider.label}</p>
						<p className={provider.state === 'available' || provider.state === 'connected' ? 'text-accent' : 'text-warning'}>{providerLabel(provider.state)}</p>
						{provider.property ? <p>Property {provider.property}</p> : null}
						{provider.lastSuccessAt ? <p>Last successful retrieval {provider.lastSuccessAt}</p> : null}
						{provider.error ? <p role="alert">{provider.error}</p> : null}
						<p className="text-text-soft">{provider.detail}</p>
					</article>
				))}
			</section>
			<section className="card space-y-3 p-4 text-sm">
				<h2 className="font-medium">Test Google connections</h2>
				<p className="text-text-soft">This reads Search Console and GA4 for the selected brand only. It does not create opportunities or articles.</p>
				<button className="btn" type="button" disabled={busy || !brandId} onClick={() => void post('test_analytics', {}, 'test', 'Connection test finished. No opportunities or articles were created.')}>{pending === 'test' ? 'Testing connection…' : 'Run read-only connection test'}</button>
				{connection ? (
					<div className="space-y-1">
						<p>Search Console: {connection.searchConsole?.state} · {connection.searchConsole?.property ?? 'no property'} · {connection.searchConsole?.queryCount ?? 0} queries · {connection.searchConsole?.pageCount ?? 0} pages{connection.searchConsole?.retrievedAt ? ` · ${connection.searchConsole.retrievedAt}` : ''}</p>
						{connection.searchConsole?.error ? <p role="alert">{connection.searchConsole.error}</p> : null}
						<p>Google Analytics: {connection.analytics?.state} · {connection.analytics?.property ?? 'no property'} · key events {connection.analytics?.keyEvents ?? 'not requested'} · organic sessions {connection.analytics?.organic?.sessions ?? 'unavailable'}{connection.analytics?.retrievedAt ? ` · ${connection.analytics.retrievedAt}` : ''}</p>
						{connection.analytics?.error ? <p role="alert">{connection.analytics.error}</p> : null}
					</div>
				) : null}
			</section>
			<section className="card space-y-3 p-4 text-sm">
				<h2 className="font-medium">Find evidence</h2>
				<div className="flex flex-wrap gap-2">
					<input className="input min-w-0 flex-1" value={topic} onChange={(event) => setTopic(event.target.value)} placeholder="Topic or query" aria-label="Topic or query" />
					<button className="btn border-primary bg-primary/15" type="button" disabled={busy || !topic.trim()} onClick={() => void post('discover', { source: 'search', topic }, 'search', 'Search results were saved as inferred coverage. No keyword volume was added.')}>{pending === 'search' ? 'Searching…' : 'Search the public web'}</button>
					<button className="btn" type="button" disabled={busy || !topic.trim()} onClick={() => void post('discover', { source: 'community', topic }, 'community', 'Public discussion links were saved. No demand volume was added.')}>{pending === 'community' ? 'Searching discussions…' : 'Search public discussions'}</button>
					<button className="btn" type="button" disabled={busy} onClick={() => void post('discover', { source: 'search_console' }, 'gsc', 'Search Console queries were saved as observed demand.')}>{pending === 'gsc' ? 'Reading Search Console…' : 'Read Search Console'}</button>
					<button className="btn" type="button" disabled={busy} onClick={() => void post('discover', { source: 'themes' }, 'themes', 'Approved themes were saved as strategic suggestions, not as measured demand.')}>{pending === 'themes' ? 'Reading themes…' : 'Use approved themes'}</button>
				</div>
			</section>
			<section className="card space-y-3 p-4 text-sm">
				<h2 className="font-medium">Campaign</h2>
				<p className="text-text-soft">Auto-publish cannot be turned on here. Capacity is the most that may be published when validated articles exist.</p>
				<div className="flex flex-wrap gap-2">
					<input className="input" value={campaignName} onChange={(event) => setCampaignName(event.target.value)} placeholder="Campaign name" aria-label="Campaign name" />
					<label>Up to <input className="input w-20" type="number" min={0} value={capacity} onChange={(event) => setCapacity(Number(event.target.value))} aria-label="Maximum articles per week" /> per week</label>
					<button className="btn" type="button" disabled={busy || !campaignName.trim()} onClick={() => void post('create_campaign', { name: campaignName, weeklyCapacity: capacity, approvalMode: 'auto_draft', objective: 'Validate opportunities before drafting.', audience: 'The brand audience' }, 'campaign', 'Campaign saved in auto-draft. Publishing remains manual.')}>{pending === 'campaign' ? 'Saving campaign…' : 'Save auto-draft campaign'}</button>
				</div>
				{(queue?.campaigns ?? []).map((campaign) => (
					<p key={campaign.id}>{campaign.name} · {campaign.approvalMode.replace('_', ' ')} · up to {campaign.weeklyCapacity} a week · auto-publish {campaign.autoPublishEnabled ? 'on' : 'off'}</p>
				))}
			</section>
			<section className="space-y-3">
				<h2 className="font-medium">Record an idea without pretending it is demand</h2>
				<div className="flex flex-wrap gap-2">
					<input className="input" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Title" aria-label="Opportunity title" />
					<input className="input min-w-0 flex-1" value={problem} onChange={(event) => setProblem(event.target.value)} placeholder="Audience problem" aria-label="Audience problem" />
					<button className="btn" type="button" disabled={busy || !title.trim() || !problem.trim()} onClick={() => void post('record', { title, audienceProblem: problem, demandClass: 'unvalidated' }, 'record', 'Saved as an unvalidated idea. It cannot be approved until it has evidence.')}>{pending === 'record' ? 'Saving…' : 'Save unvalidated idea'}</button>
				</div>
			</section>
			{pending === 'load' ? <p className="text-sm">Loading opportunities…</p> : null}
			<section className="space-y-3">
				{(queue?.opportunities ?? []).map((item) => (
					<article key={item.id} className="card space-y-2 p-4 text-sm">
						<div className="flex flex-wrap items-start justify-between gap-2">
							<div>
								<h3 className="font-medium">{item.title}</h3>
								<p className="text-text-soft">{item.audienceProblem}</p>
							</div>
							<p className="text-right">Score {item.score} · {item.evidenceConfidence} confidence</p>
						</div>
						<p>{DEMAND_LABEL[item.demandClass]} · {item.discoverySource} · {item.recommendedAction} · {item.status.replaceAll('_', ' ')}</p>
						<p>{item.overlap.rationale}</p>
						<button className="btn" type="button" onClick={() => setOpenId(openId === item.id ? null : item.id)}>{openId === item.id ? 'Hide evidence' : 'Inspect evidence'}</button>
						{openId === item.id ? (
								<div className="space-y-2 border-t border-edge/50 pt-2">
								{item.scoreDetail.components.map((component) => (
									<p key={component.key}><span className="text-text-soft">{component.key} ({Math.round(component.weight * 100)}%).</span> {component.rationale}</p>
								))}
								{item.evidence.length ? item.evidence.map((evidence) => (
									<p key={evidence.id}>{evidence.url ? <a className="underline" href={evidence.url}>{evidence.url}</a> : 'No URL'} {evidence.excerpt}</p>
								)) : <p className="text-text-soft">No source URLs or measurements are stored.</p>}
							</div>
						) : null}
						<div className="flex flex-wrap gap-2">
							<button className="btn" type="button" disabled={busy} onClick={() => void post('decide', { id: item.id, status: 'approved' }, item.id, 'Approved for later production. No article was created and nothing was published.')}>Approve</button>
							<button className="btn" type="button" disabled={busy} onClick={() => void post('decide', { id: item.id, status: 'rejected' }, item.id, 'Rejected. It will not be produced.')}>Reject</button>
							<button className="btn" type="button" disabled={busy} onClick={() => void post('decide', { id: item.id, status: 'deferred' }, item.id, 'Deferred.')}>Defer</button>
							<button className="btn" type="button" disabled={busy} onClick={() => void post('decide', { id: item.id, status: 'needs_research' }, item.id, 'Marked for more research.')}>Request research</button>
						</div>
					</article>
				))}
				{queue && queue.opportunities.length === 0 ? <p className="text-sm text-text-soft">No opportunities yet. Search, read Search Console, or save a theme before drafting.</p> : null}
			</section>
		</div>
	);
}
