'use client';

import { useCallback, useEffect, useState } from 'react';
import type { ContentCampaign, ContentOpportunity, DemandClass, EvidenceConfidence, OpportunityAction, OpportunityStatus, ProductionJob, ProviderAvailability } from '@/lib/campaigns/types';
import { queuePage } from '@/lib/campaigns/queue';
import { opportunityKind, presentOpportunity } from '@/lib/campaigns/presentation';
import { productionCapacity, productionHoldReason } from '@/lib/campaigns/productionPolicy';

type Brand = { id: string; name: string };
type Queue = {
	opportunities: ContentOpportunity[];
	campaigns: ContentCampaign[];
	jobs: ProductionJob[];
	providers: ProviderAvailability[];
	operations?: {
		mode: string;
		paused: boolean;
		autonomousPublishingEnabled: boolean;
		weeklyMaximum: number;
		maxConcurrentJobs?: number;
		maxCostUsdPerArticle: number;
		planned?: number;
		discovered: number;
		inProduction: number;
		lastRun?: { at: string | null; ok: boolean | null; error: string | null; processed: number | null } | null;
		awaitingApproval: number;
		attention: number;
		label?: string;
		publishingDays?: number[];
		publishingTimezone?: string | null;
		indexingMonitoring?: boolean;
		minimumScore?: number;
		costUsd: number;
		themes: string[];
		signals: Array<{ title: string; kind: string; reason: string }>;
	};
};

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
	const [budget, setBudget] = useState(1);
	const [publishingDays, setPublishingDays] = useState('2,4');
	const [publishingTimezone, setPublishingTimezone] = useState('Asia/Dubai');
	const [minimumScore, setMinimumScore] = useState(0.7);
	const [indexingMonitoring, setIndexingMonitoring] = useState(true);
	const [openId, setOpenId] = useState<string | null>(null);
	const [q, setQ] = useState('');
	const [demand, setDemand] = useState<DemandClass | ''>('');
	const [actionFilter, setActionFilter] = useState<OpportunityAction | ''>('');
	const [statusFilter, setStatusFilter] = useState<OpportunityStatus | 'active' | ''>('active');
	const [lane, setLane] = useState<'all' | 'new' | 'refresh'>('all');
	const [confidence, setConfidence] = useState<EvidenceConfidence | ''>('');
	const [sort, setSort] = useState<'score' | 'updated' | 'title'>('score');
	const [page, setPage] = useState(1);
	const [selected, setSelected] = useState<string[]>([]);
	const [from, setFrom] = useState('');
	const [to, setTo] = useState('');
	const [board, setBoard] = useState<Array<{ id: string; title: string; publicationPhase?: string; publicationError?: string | null; status: string }>>([]);
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
		const next = body as Queue;
		setQueue(next);
		if (next.operations?.publishingDays?.length) setPublishingDays(next.operations.publishingDays.join(','));
		if (next.operations?.publishingTimezone) setPublishingTimezone(next.operations.publishingTimezone);
		if (typeof next.operations?.minimumScore === 'number') setMinimumScore(next.operations.minimumScore);
		if (typeof next.operations?.indexingMonitoring === 'boolean') setIndexingMonitoring(next.operations.indexingMonitoring);
		const articles = await fetch(`/api/articles?brandId=${encodeURIComponent(id)}&pageSize=50`);
		const listed = await articles.json();
		setBoard(Array.isArray(listed.articles) ? listed.articles : []);
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
				<nav className="mt-3 flex flex-wrap gap-3 text-sm" aria-label="Content operations">
					<a className="underline" href="#approved">Approved opportunities</a>
					<a className="underline" href="#production">Production jobs</a>
					<a className="underline" href="#awaiting">Articles awaiting approval</a>
					<a className="underline" href="/content/articles?view=published">Published articles</a>
				</nav>
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
					<button className="btn" type="button" disabled={busy} onClick={() => void post('discover', { source: 'market' }, 'market', 'External research was saved as inferred demand. No keyword volume was added.')}>{pending === 'market' ? 'Researching the market…' : 'Research beyond Search Console'}</button>
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
			<section id="operations" className="card space-y-3 p-4 text-sm">
				<h2 className="font-medium">Campaign controls</h2>
				<p className="text-text-soft">Pause, resume, and the weekly settings are here. Discovery and provider checks stay further down the page. The worker cannot publish, and it does not change published articles.</p>
				{queue?.operations ? (
					<div className="grid gap-2 md:grid-cols-4">
						<p>Mode {queue.operations.mode.replaceAll('_', ' ')} · {queue.operations.paused ? 'paused' : 'running'}</p>
						<p>Planned {queue.operations.planned ?? 0}</p>
						<p>Generating {queue.operations.inProduction}</p>
						<p>Awaiting approval {queue.operations.awaitingApproval}</p>
						<p>Needs attention {queue.operations.attention}</p>
						<p>Model cost ${queue.operations.costUsd.toFixed(2)}</p>
						<p>Publishing {queue.operations.autonomousPublishingEnabled ? 'on' : 'off'}</p>
						<p>{queue.operations.label ?? 'Paused'}. {queue.operations.publishingDays?.length ? `Publishing days ${queue.operations.publishingDays.join(', ')} in ${queue.operations.publishingTimezone ?? 'UTC'}.` : 'No fixed publishing days are configured.'}</p>
						<p>{queue.operations.indexingMonitoring ? 'Indexing is monitored. A sitemap listing is not treated as indexed.' : 'Indexing monitoring is off.'}</p>
						<p>Last worker run {queue.operations.lastRun?.at ? new Date(queue.operations.lastRun.at).toLocaleString() : 'not recorded'}{queue.operations.lastRun?.ok === false ? ` · failed${queue.operations.lastRun.error ? `: ${queue.operations.lastRun.error}` : ''}` : ''}</p>
					</div>
				) : null}
				{queue?.operations ? (() => {
					const capacity = productionCapacity(queue.jobs ?? [], Date.now(), queue.operations.weeklyMaximum);
					const concurrent = (queue.jobs ?? []).filter((job) => job.status === 'queued' || job.status === 'running').length;
					const publishedCount = board.filter((article) => article.publicationPhase === 'verified_live' || article.publicationPhase === 'published' || article.status === 'published').length;
					return <p>{productionHoldReason({ paused: queue.operations.paused, remaining: capacity.remaining, concurrent, maxConcurrent: queue.operations.maxConcurrentJobs ?? 1, nextSlotAt: capacity.nextSlotAt })} Started this week {capacity.started}. Completed or awaiting approval {capacity.completed}. Published {publishedCount}. Failed {capacity.failed}, which does not use a slot. {capacity.nextSlotAt ? `Next open slot ${new Date(capacity.nextSlotAt).toLocaleString()}.` : 'A production slot is open.'}</p>;
				})() : null}
				{queue?.operations?.themes?.length ? <p>Themes: {queue.operations.themes.join(', ')}</p> : null}
				{(queue?.operations?.signals ?? []).map((signal) => <p key={signal.title}>{signal.kind}: {signal.title}. {signal.reason}</p>)}
				<div className="flex flex-wrap gap-2">
					<label>Up to <input className="input w-20" type="number" min={0} max={14} value={capacity} onChange={(event) => setCapacity(Number(event.target.value))} aria-label="Weekly production maximum" /> per week</label>
					<label>Budget $<input className="input w-24" type="number" min={0.1} max={5} step={0.1} value={budget} onChange={(event) => setBudget(Number(event.target.value))} aria-label="Maximum model budget per article" /></label>
					<label>Publishing days <input className="input w-28" value={publishingDays} onChange={(event) => setPublishingDays(event.target.value)} aria-label="Publishing weekdays as 0-6" placeholder="2,4" /></label>
					<label>Timezone <input className="input w-40" value={publishingTimezone} onChange={(event) => setPublishingTimezone(event.target.value)} aria-label="Publishing timezone" placeholder="Asia/Dubai" /></label>
					<label>Min score <input className="input w-24" type="number" min={0} max={1} step={0.05} value={minimumScore} onChange={(event) => setMinimumScore(Number(event.target.value))} aria-label="Minimum opportunity score" /></label>
					<label className="flex items-center gap-2"><input type="checkbox" checked={indexingMonitoring} onChange={(event) => setIndexingMonitoring(event.target.checked)} /> Monitor indexing (Search Console only)</label>
				</div>
				{(queue?.campaigns ?? []).map((campaign) => (
					<div key={campaign.id} className="flex flex-wrap gap-2">
						<button className="btn" type="button" disabled={busy} onClick={() => void post('apply_pilot', { campaignId: campaign.id }, campaign.id, 'Folian pilot saved and paused. Nothing was published.')}>Apply Folian pilot</button>
						<button className="btn" type="button" disabled={busy} onClick={() => void post('pause_operation', { campaignId: campaign.id }, campaign.id, 'Automation paused. Nothing was published.')}>Pause</button>
						<button className="btn" type="button" disabled={busy} onClick={() => void post('resume_operation', { campaignId: campaign.id }, campaign.id, 'Automation resumed with approval required. Nothing was published.')}>Resume</button>
						<button
							className="btn"
							type="button"
							disabled={busy}
							onClick={() => void post('update_operation', {
								campaignId: campaign.id,
								weeklyMaximum: capacity,
								maxCostUsdPerArticle: budget,
								publishingDays: publishingDays.split(/[\s,]+/).map((day) => Number(day)).filter((day) => Number.isInteger(day) && day >= 0 && day <= 6),
								publishingTimezone,
								minimumScore,
								indexingMonitoring,
							}, campaign.id, 'Schedule and limits saved. Publishing stays off.')}
						>
							Save schedule and limits
						</button>
					</div>
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
			<section id="awaiting" className="card space-y-2 p-4 text-sm">
				<h2 className="font-medium">Articles awaiting approval</h2>
				<p className="text-text-soft">Approval, scheduling, and live verification stay separate. Nothing here publishes a page.</p>
				{board.filter((article) => article.publicationPhase && article.publicationPhase !== 'ready_for_approval' || article.status === 'review' || article.status === 'approved').slice(0, 12).map((article) => (
					<p key={article.id}>
						<a href={`/content/articles/${article.id}`}>{article.title}</a>
						{' · '}{article.publicationPhase?.replaceAll('_', ' ') ?? article.status}
						{article.publicationError ? ` · ${article.publicationError}` : ''}
					</p>
				))}
				{board.length === 0 ? <p className="text-text-soft">No articles are waiting for publication.</p> : null}
			</section>
			<section id="production" className="card space-y-2 p-4 text-sm">
				<h2 className="font-medium">Production jobs</h2>
				<p className="text-text-soft">Auto-draft can prepare an article. It cannot publish the site.</p>
				{(queue?.jobs ?? []).map((job) => (
					<article key={job.id} className="border-t border-edge/50 pt-2">
						<p>{job.stage} · {job.status.replaceAll('_', ' ')} · attempt {job.attempt} · cost ${job.costUsd.toFixed(4)}</p>
						<p>{job.note.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, 'this article')}</p>
						{job.error ? <p role="alert">{job.error}</p> : null}
						{job.articleId ? <p><a className="underline" href={`/content/articles/${job.articleId}`}>Open the article</a> · {job.stage.replaceAll('_', ' ')}</p> : null}
						<button className="btn" type="button" disabled={busy || job.status === 'ready_for_approval' || job.status === 'paused'} onClick={() => void post('advance_production', { jobId: job.id }, job.id, 'The next production stage ran. Nothing was published.')}>{pending === job.id ? 'Running stage…' : 'Run next stage'}</button>
					</article>
				))}
				{queue && queue.jobs.length === 0 ? <p className="text-text-soft">No production jobs.</p> : null}
			</section>
			{pending === 'load' ? <p className="text-sm">Loading opportunities…</p> : null}
			<OpportunityTable
				rows={(queue?.opportunities ?? []).filter((row) => lane === 'all' || opportunityKind(row, board.filter((article) => article.publicationPhase === 'verified_live' || article.publicationPhase === 'published' || article.status === 'published').map((article) => article.title)) === lane)}
				jobs={queue?.jobs ?? []}
				paused={queue?.operations?.paused ?? queue?.campaigns?.[0]?.status === 'paused'}
				lane={lane}
				onLane={setLane}
				q={q}
				demand={demand}
				actionFilter={actionFilter}
				statusFilter={statusFilter}
				confidence={confidence}
				sort={sort}
				page={page}
				from={from}
				to={to}
				selected={selected}
				openId={openId}
				busy={busy}
				onQ={setQ}
				onDemand={setDemand}
				onActionFilter={setActionFilter}
				onStatus={setStatusFilter}
				onConfidence={setConfidence}
				onSort={setSort}
				onPage={setPage}
				onFrom={setFrom}
				onTo={setTo}
				onSelected={setSelected}
				onOpen={setOpenId}
				onDecide={(id, status) => void post('decide', { id, status }, id, status === 'archived' ? 'Archived. The evidence was kept.' : 'Updated. Nothing was published.')}
				onBulkArchive={() => void post('archive_ids', { ids: selected }, 'archive', `Archived ${selected.length} opportunities. Evidence was kept.`).then(() => setSelected([]))}
			/>
		</div>
	);
}

function OpportunityTable(props: {
	rows: ContentOpportunity[];
	jobs: ProductionJob[];
	paused: boolean;
	lane: 'all' | 'new' | 'refresh';
	onLane: (value: 'all' | 'new' | 'refresh') => void;
	q: string;
	demand: DemandClass | '';
	actionFilter: OpportunityAction | '';
	statusFilter: OpportunityStatus | 'active' | '';
	confidence: EvidenceConfidence | '';
	sort: 'score' | 'updated' | 'title';
	page: number;
	from: string;
	to: string;
	selected: string[];
	openId: string | null;
	busy: boolean;
	onQ: (value: string) => void;
	onDemand: (value: DemandClass | '') => void;
	onActionFilter: (value: OpportunityAction | '') => void;
	onStatus: (value: OpportunityStatus | 'active' | '') => void;
	onConfidence: (value: EvidenceConfidence | '') => void;
	onSort: (value: 'score' | 'updated' | 'title') => void;
	onPage: (value: number) => void;
	onFrom: (value: string) => void;
	onTo: (value: string) => void;
	onSelected: (value: string[]) => void;
	onOpen: (value: string | null) => void;
	onDecide: (id: string, status: OpportunityStatus) => void;
	onBulkArchive: () => void;
}) {
	const result = queuePage(props.rows, {
		q: props.q,
		demand: props.demand,
		action: props.actionFilter,
		status: props.statusFilter,
		confidence: props.confidence,
		sort: props.sort,
		page: props.page,
		from: props.from ? new Date(props.from).toISOString() : '',
		to: props.to ? new Date(props.to).toISOString() : '',
	});
	const counts = props.rows.reduce<Record<string, number>>((acc, row) => {
		acc[row.status] = (acc[row.status] ?? 0) + 1;
		return acc;
	}, {});
	const open = props.rows.find((row) => row.id === props.openId) ?? null;
	const history = open ? props.jobs.filter((job) => job.opportunityId === open.id) : [];
	function toggle(id: string) {
		props.onSelected(props.selected.includes(id) ? props.selected.filter((item) => item !== id) : [...props.selected, id]);
	}
	return (
		<section id="approved" className="space-y-3">
			<div className="flex flex-wrap gap-2 text-sm">
				<button className="btn" type="button" aria-pressed={props.lane === 'all'} onClick={() => props.onLane('all')}>All opportunities</button>
				<button className="btn" type="button" aria-pressed={props.lane === 'new'} onClick={() => props.onLane('new')}>New article opportunities</button>
				<button className="btn" type="button" aria-pressed={props.lane === 'refresh'} onClick={() => props.onLane('refresh')}>Existing article improvements</button>
			</div>
			<div className="grid grid-cols-2 gap-2 md:grid-cols-4">
				{['discovered', 'needs_research', 'approved', 'archived'].map((status) => (
					<article key={status} className="card p-3 text-sm">
						<p className="text-text-dim">{status.replaceAll('_', ' ')}</p>
						<p className="text-xl font-semibold">{counts[status] ?? 0}</p>
					</article>
				))}
			</div>
			<div className="grid gap-2 md:grid-cols-4">
				<input className="input md:col-span-2" value={props.q} onChange={(event) => { props.onQ(event.target.value); props.onPage(1); }} placeholder="Search opportunities" aria-label="Search opportunities" />
				<select className="input" value={props.demand} onChange={(event) => props.onDemand(event.target.value as DemandClass | '')} aria-label="Evidence classification">
					<option value="">All evidence</option>
					<option value="observed">Observed</option>
					<option value="inferred">Inferred</option>
					<option value="strategic">Strategic</option>
					<option value="unvalidated">Unvalidated</option>
				</select>
				<select className="input" value={props.actionFilter} onChange={(event) => props.onActionFilter(event.target.value as OpportunityAction | '')} aria-label="Recommended action">
					<option value="">All actions</option>
					<option value="create">Create</option>
					<option value="update">Update</option>
					<option value="research">Research</option>
					<option value="reject">Reject</option>
				</select>
				<select className="input" value={props.statusFilter} onChange={(event) => props.onStatus(event.target.value as OpportunityStatus | 'active')} aria-label="Status">
					<option value="active">Active</option>
					<option value="discovered">Discovered</option>
					<option value="needs_research">Needs research</option>
					<option value="approved">Approved</option>
					<option value="deferred">Deferred</option>
					<option value="rejected">Rejected</option>
					<option value="in_production">In production</option>
					<option value="archived">Archived</option>
				</select>
				<select className="input" value={props.confidence} onChange={(event) => props.onConfidence(event.target.value as EvidenceConfidence | '')} aria-label="Confidence">
					<option value="">All confidence</option>
					<option value="high">High</option>
					<option value="medium">Medium</option>
					<option value="low">Low</option>
					<option value="none">None</option>
				</select>
				<input className="input" type="date" value={props.from} onChange={(event) => props.onFrom(event.target.value)} aria-label="Discovered from" />
				<input className="input" type="date" value={props.to} onChange={(event) => props.onTo(event.target.value)} aria-label="Discovered to" />
				<select className="input" value={props.sort} onChange={(event) => props.onSort(event.target.value as 'score' | 'updated' | 'title')} aria-label="Sort">
					<option value="score">Score</option>
					<option value="updated">Last updated</option>
					<option value="title">Title</option>
				</select>
			</div>
			<div className="flex flex-wrap items-center gap-2 text-sm">
				<button className="btn" type="button" disabled={props.busy || props.selected.length === 0} onClick={props.onBulkArchive}>Archive {props.selected.length} selected</button>
				<span className="text-text-soft">{result.total} shown · page {result.page} of {result.pages}</span>
			</div>
			<div className="card overflow-x-auto">
				<table className="w-full text-left text-sm">
					<thead className="text-text-soft">
						<tr>
							<th className="p-2"></th>
							<th className="p-2">Opportunity</th>
							<th className="p-2">Source</th>
							<th className="p-2">Evidence</th>
							<th className="p-2">Score</th>
							<th className="p-2">Confidence</th>
							<th className="p-2">Action</th>
							<th className="p-2">What happens next</th>
							<th className="p-2">Updated</th>
						</tr>
					</thead>
					<tbody>
						{result.rows.map((row) => {
							const job = props.jobs.find((item) => item.opportunityId === row.id) ?? null;
							const view = presentOpportunity({ opportunity: row, job, campaignPaused: props.paused });
							return (
							<tr key={row.id} className="border-t border-edge/40">
								<td className="p-2"><input type="checkbox" checked={props.selected.includes(row.id)} onChange={() => toggle(row.id)} aria-label={`Select ${row.title}`} /></td>
								<td className="p-2">{job?.articleId ? <a className="underline" href={`/content/articles/${job.articleId}`}>{row.title}</a> : <button className="text-left font-medium text-accent underline" type="button" onClick={() => props.onOpen(props.openId === row.id ? null : row.id)}>{row.title}</button>}</td>
								<td className="p-2">{row.discoverySource}</td>
								<td className="p-2">{DEMAND_LABEL[row.demandClass]}</td>
								<td className="p-2">{row.score}</td>
								<td className="p-2">{row.evidenceConfidence}</td>
								<td className="p-2">{row.recommendedAction === 'update' ? 'Improve existing article' : row.recommendedAction}</td>
								<td className="p-2"><span className="font-medium">{view.label}</span>{view.stage ? ` · ${view.stage}` : ''}<span className="block text-text-soft">{view.next}</span></td>
								<td className="p-2 whitespace-nowrap">{new Date(row.updatedAt).toLocaleDateString()}</td>
							</tr>
							);
						})}
					</tbody>
				</table>
				{result.total === 0 ? <p className="p-3 text-sm text-text-soft">No opportunities match these filters.</p> : null}
			</div>
			<div className="flex gap-2">
				<button className="btn" type="button" disabled={result.page <= 1} onClick={() => props.onPage(result.page - 1)}>Previous</button>
				<button className="btn" type="button" disabled={result.page >= result.pages} onClick={() => props.onPage(result.page + 1)}>Next</button>
			</div>
			{open ? (
				<aside className="card space-y-2 p-4 text-sm">
					<h2 className="font-medium">{open.title}</h2>
					<p><span className="text-text-dim">Audience problem. </span>{open.audienceProblem}</p>
					<p><span className="text-text-dim">Search intent. </span>{open.searchIntent || 'Not classified'}</p>
					<p><span className="text-text-dim">Proposed angle. </span>{open.title}</p>
					<p><span className="text-text-dim">Overlap. </span>{open.overlap.rationale}</p>
					<p><span className="text-text-dim">Recommendation. </span>{open.recommendedAction}{open.scoreDetail.blockReason ? `. ${open.scoreDetail.blockReason}` : ''}</p>
					{open.scoreDetail.components.map((component) => <p key={component.key}><span className="text-text-dim">{component.key}. </span>{component.rationale}</p>)}
					{open.evidence.map((evidence) => (
						<p key={evidence.id}>
							{evidence.url ? <a className="underline" href={evidence.url}>{evidence.url}</a> : 'No URL'}
							{evidence.metrics ? ` · ${evidence.metrics.impressions} impressions · CTR ${(evidence.metrics.ctr * 100).toFixed(2)}% · position ${evidence.metrics.position.toFixed(1)}${evidence.metrics.scope ? ` · ${evidence.metrics.scope}` : ''}` : ''}
							<span className="block text-text-soft">{evidence.excerpt}</span>
						</p>
					))}
					{history.length ? history.map((job) => <p key={job.id}>Production {job.stage} · {job.status.replaceAll('_', ' ')} · ${job.costUsd.toFixed(4)} · {job.note}{job.articleId ? <> · <a className="underline" href={`/content/articles/${job.articleId}`}>Open the article</a></> : null}</p>) : <p className="text-text-soft">No production job yet. {presentOpportunity({ opportunity: open, campaignPaused: props.paused }).next}</p>}
					<div className="flex flex-wrap gap-2">
						<button className="btn" type="button" disabled={props.busy} onClick={() => props.onDecide(open.id, 'approved')}>Approve</button>
						<button className="btn" type="button" disabled={props.busy} onClick={() => props.onDecide(open.id, 'rejected')}>Reject</button>
						<button className="btn" type="button" disabled={props.busy} onClick={() => props.onDecide(open.id, 'deferred')}>Defer</button>
						<button className="btn" type="button" disabled={props.busy} onClick={() => props.onDecide(open.id, 'needs_research')}>Request research</button>
						<button className="btn" type="button" disabled={props.busy} onClick={() => props.onDecide(open.id, 'archived')}>Archive</button>
					</div>
				</aside>
			) : null}
		</section>
	);
}
