'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

type Finding = {
	id: string;
	severity: string;
	dimension: string;
	instruction: string;
	decision: string;
};

type ArticleDetail = {
	article: {
		id: string;
		title: string;
		topic: string;
		body: string;
		status: string;
		wordCount: number;
		targetWords: number;
		searchIntent: string;
		primaryKeyword?: string;
		audience?: string;
		categories: string[];
		approval: { status: string };
		publication: { url?: string } | null;
		research: {
			sources: Array<{ label: string; url?: string; retrievedAt?: string; kind: string }>;
			gaps: string[];
			claims: Array<{ text: string; sourceLabel: string }>;
		};
		outline: Array<{ id: string; heading: string; purpose: string }>;
		workspace?: {
			destinationId: string | null;
			contentType: string;
			briefApprovedAt: string | null;
			externalId: string | null;
			assignedModel: string | null;
			assignedModelRole: string;
			generation: { status: string; error: string | null; promptTokens: number; completionTokens: number; estimatedCostUsd: number | null; model: string | null };
			editorial: { status: string; cyclesUsed: number; maxCycles: number; exhausted: boolean; findings: Finding[] };
			media: {
				heroUrl: string | null;
				ogUrl: string | null;
				heroAlt: string;
				ogAlt: string;
				credit: string;
				license: string;
				deliveryVerified: boolean;
				deliveryError: string | null;
			};
			cms: { draftUrl: string | null; revision: number | null; lastError: string | null; lastSyncAt: string | null };
			schedule: { status: string; publishAt: string | null; blockedReason: string | null };
			researchSummary: {
				retrievedAt: string | null;
				searchIntent: string;
				competitors: Array<{ name: string; website?: string; claims: string[] }>;
				recommendedStructure: Array<{ heading: string; purpose: string }>;
				relatedArticleSlugs: string[];
				relatedTools: Array<{ slug: string; label: string }>;
			};
		};
	};
	model: { role: string; resolved: string };
	job: { status: string; error: string | null } | null;
	nextStep?: { stage: string; action: string; detail: string };
	taxonomy: { categories: Array<{ id: string; name: string }>; contentTypes: string[]; requiredMetadata?: string[] } | null;
};

export default function ArticleWorkspacePage() {
	const params = useParams();
	const articleId = typeof params.id === 'string' ? params.id : '';
	const [detail, setDetail] = useState<ArticleDetail | null>(null);
	const [message, setMessage] = useState('');
	const [pending, setPending] = useState('');
	const [body, setBody] = useState('');
	const [publishAt, setPublishAt] = useState('');
	const [publishedUrl, setPublishedUrl] = useState('');
	const [assetId, setAssetId] = useState('');

	const load = useCallback(async () => {
		if (!articleId) return;
		const response = await fetch(`/api/articles/${articleId}`);
		const payload = await response.json();
		if (!response.ok) {
			setMessage(payload.error ?? 'Article could not be loaded.');
			return;
		}
		setDetail(payload);
		setBody(payload.article?.body ?? '');
	}, [articleId]);

	useEffect(() => {
		if (!articleId) return;
		let cancelled = false;
		fetch(`/api/articles/${articleId}`)
			.then(async (response) => ({ ok: response.ok, payload: await response.json() }))
			.then(({ ok, payload }) => {
				if (cancelled) return;
				if (!ok) {
					setMessage(payload.error ?? 'Article could not be loaded.');
					return;
				}
				setDetail(payload);
				setBody(payload.article?.body ?? '');
			})
			.catch(() => {
				if (!cancelled) setMessage('Article could not be loaded.');
			});
		return () => {
			cancelled = true;
		};
	}, [articleId]);

	useEffect(() => {
		const status = detail?.article.workspace?.generation.status;
		const job = detail?.job?.status;
		if (status !== 'queued' && status !== 'processing' && job !== 'queued' && job !== 'processing' && job !== 'retrying') return;
		const timer = setInterval(() => void load(), 4000);
		return () => clearInterval(timer);
	}, [detail, load]);

	async function act(action: string, extra?: Record<string, unknown>) {
		setPending(action);
		setMessage('');
		const response = await fetch(`/api/articles/${articleId}/actions`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ action, ...extra }),
		});
		const payload = await response.json();
		setPending('');
		if (!response.ok) {
			setMessage(payload.error ?? 'That action failed.');
			await load();
			return;
		}
		if (typeof payload.message === 'string') setMessage(payload.message);
		else if (action === 'generate' || action === 'retry') setMessage('Generation is running in the background. This page will update.');
		await load();
	}

	async function saveBody() {
		setPending('save');
		const response = await fetch(`/api/articles/${articleId}`, {
			method: 'PATCH',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ body }),
		});
		const payload = await response.json();
		setPending('');
		setMessage(response.ok ? 'Saved in CCE.' : payload.error ?? 'Save failed.');
		await load();
	}

	if (!detail) return <div className="mx-auto max-w-4xl p-6">{message || 'Loading article…'}</div>;
	const article = detail.article;
	const workspace = article.workspace;
	const busy = pending !== '';

	return (
		<div className="mx-auto max-w-4xl p-6 space-y-6">
			<div>
				<Link className="text-sm underline" href="/content/articles">Articles</Link>
				<h1 className="text-2xl font-semibold">{article.title}</h1>
				<p className="text-text-soft">{article.status} · {article.wordCount} / {article.targetWords} words · review {workspace?.editorial.status ?? 'not_run'}</p>
				{detail.nextStep ? (
					<div className="card p-4">
						<p className="text-sm text-text-soft">Current stage</p>
						<p className="font-medium">{detail.nextStep.stage}</p>
						<p className="text-sm">Next: {detail.nextStep.action}</p>
						<p className="text-sm text-text-soft">{detail.nextStep.detail}</p>
					</div>
				) : null}
				{workspace?.generation.error ? <p className="text-sm">{workspace.generation.error}</p> : null}
				{message ? <p className="text-sm">{message}</p> : null}
				<details className="text-sm">
					<summary>Generation details</summary>
					<p>Model role {detail.model.role}: {workspace?.generation.model || detail.model.resolved}</p>
					{workspace?.generation.promptTokens || workspace?.generation.completionTokens ? (
						<p>Tokens {workspace.generation.promptTokens} in / {workspace.generation.completionTokens} out
							{workspace.generation.estimatedCostUsd != null ? ` · estimated $${workspace.generation.estimatedCostUsd}` : ''}
						</p>
					) : null}
				</details>
			</div>

			<section className="card p-4 space-y-2">
				<h2 className="font-medium">Brief</h2>
				<p className="text-sm">Topic: {article.topic}</p>
				<p className="text-sm">Search intent: {article.searchIntent}</p>
				<p className="text-sm">Audience: {article.audience || '—'}</p>
				<p className="text-sm">Keyword: {article.primaryKeyword || '—'}</p>
				<p className="text-sm">Destination: {workspace?.destinationId || '—'} · {workspace?.contentType}</p>
				<p className="text-sm">External ID: {workspace?.externalId || '—'}</p>
				<p className="text-sm">Brief {workspace?.briefApprovedAt ? `approved ${new Date(workspace.briefApprovedAt).toLocaleString()}` : 'not approved'}</p>
				<button className="btn" type="button" disabled={busy} onClick={() => act('approve_brief')}>{pending === 'approve_brief' ? 'Saving…' : 'Approve brief'}</button>
			</section>

			<section className="card p-4 space-y-2">
				<h2 className="font-medium">Research</h2>
				<button className="btn" type="button" disabled={busy} onClick={() => act('research')}>{pending === 'research' ? 'Researching…' : 'Research topic'}</button>
				<p className="text-sm">Retrieved: {workspace?.researchSummary.retrievedAt ? new Date(workspace.researchSummary.retrievedAt).toLocaleString() : 'Not run'}</p>
				<p className="text-sm">Search intent kept from the brief: {workspace?.researchSummary.searchIntent || article.searchIntent}</p>
				<ul className="text-sm list-disc pl-5">
					{article.research.sources.filter((source) => source.url).map((source) => (
						<li key={source.url}><a href={source.url}>{source.label}</a> {source.retrievedAt ? `· ${new Date(source.retrievedAt).toLocaleDateString()}` : ''}</li>
					))}
				</ul>
				{article.research.sources.every((source) => !source.url) ? <p className="text-sm">No external sources with URLs are stored.</p> : null}
				{article.research.gaps.map((gap) => <p className="text-sm" key={gap}>Gap: {gap}</p>)}
				{(workspace?.researchSummary.competitors ?? []).map((competitor) => (
					<p className="text-sm" key={competitor.name}>{competitor.name}{competitor.website ? ` · ${competitor.website}` : ''}: {competitor.claims.join(' ')}</p>
				))}
				<h3 className="text-sm font-medium">Recommended structure</h3>
				{(workspace?.researchSummary.recommendedStructure ?? article.outline).map((section) => (
					<p className="text-sm" key={section.heading}>{section.heading} — {section.purpose}</p>
				))}
				<p className="text-sm">Related articles: {(workspace?.researchSummary.relatedArticleSlugs ?? []).join(', ') || 'None stored'}</p>
				<p className="text-sm">Destination tools: {(workspace?.researchSummary.relatedTools ?? []).map((tool) => tool.label).join(', ') || 'None matched'}</p>
			</section>

			<section className="card p-4 space-y-2">
				<h2 className="font-medium">Draft</h2>
				<button className="btn" type="button" disabled={busy} onClick={() => act('generate')}>{pending === 'generate' ? 'Generating…' : 'Generate draft'}</button>
				{workspace?.generation.status === 'failed' ? (
					<button className="btn" type="button" disabled={busy} onClick={() => act('retry')}>Retry failed job</button>
				) : null}
				<p className="text-sm">Generation: {workspace?.generation.status}{detail.job ? ` · job ${detail.job.status}` : ''}</p>
				<textarea className="input w-full min-h-80" value={body} onChange={(event) => setBody(event.target.value)} />
				<button className="btn" type="button" disabled={busy} onClick={() => void saveBody()}>Save in CCE</button>
			</section>

			<section className="card p-4 space-y-2">
				<h2 className="font-medium">Editorial review</h2>
				<p className="text-sm">Cycles {workspace?.editorial.cyclesUsed ?? 0} / {workspace?.editorial.maxCycles ?? 0}. {workspace?.editorial.exhausted ? 'The cycle limit is used up. That is not approval.' : 'A person approves the article.'}</p>
				<button className="btn" type="button" disabled={busy} onClick={() => act('review')}>{pending === 'review' ? 'Reviewing…' : 'Run review'}</button>
				<button className="btn" type="button" disabled={busy} onClick={() => act('revise')}>Revise accepted recommendations</button>
				{(workspace?.editorial.findings ?? []).map((finding) => (
					<div key={finding.id} className="border-t border-white/10 pt-2 text-sm">
						<p>{finding.severity} · {finding.dimension}</p>
						<p>{finding.instruction}</p>
						<p>Decision: {finding.decision}</p>
						<button className="btn" type="button" disabled={busy} onClick={() => act('recommendation', { findingId: finding.id, decision: 'accepted' })}>Accept</button>
						<button className="btn" type="button" disabled={busy} onClick={() => act('recommendation', { findingId: finding.id, decision: 'rejected' })}>Reject</button>
					</div>
				))}
			</section>

			<section className="card p-4 space-y-2">
				<h2 className="font-medium">Category</h2>
				<p className="text-sm">Selected: {article.categories[0] || 'None'}</p>
				{detail.taxonomy?.requiredMetadata?.length ? <p className="text-sm">Destination requires: {detail.taxonomy.requiredMetadata.join(', ')}</p> : null}
				<button className="btn" type="button" disabled={busy} onClick={() => act('classify')}>Suggest from destination taxonomy</button>
				<div className="flex flex-wrap gap-2">
					{(detail.taxonomy?.categories ?? []).map((category) => (
						<button key={category.id} className="btn" type="button" disabled={busy} onClick={() => act('classify', { categoryId: category.id })}>{category.name}</button>
					))}
				</div>
			</section>

			<section className="card p-4 space-y-2">
				<h2 className="font-medium">Images</h2>
				<p className="text-sm">Delivery {workspace?.media.deliveryVerified ? 'verified' : 'not verified'}{workspace?.media.deliveryError ? ` · ${workspace.media.deliveryError}` : ''}</p>
				{workspace?.media.heroUrl ? <img src={workspace.media.heroUrl} alt={workspace.media.heroAlt || article.title} className="max-h-48 rounded" /> : null}
				<button className="btn" type="button" disabled={busy} onClick={() => act('media', { role: 'hero' })}>Generate hero</button>
				<button className="btn" type="button" disabled={busy} onClick={() => act('media', { role: 'og' })}>Generate social image</button>
				<label className="block text-sm">Hero alt
					<input className="input w-full" value={workspace?.media.heroAlt ?? ''} onChange={(event) => setDetail((current) => current && current.article.workspace ? { ...current, article: { ...current.article, workspace: { ...current.article.workspace, media: { ...current.article.workspace.media, heroAlt: event.target.value } } } } : current)} />
				</label>
				<label className="block text-sm">Credit
					<input className="input w-full" value={workspace?.media.credit ?? ''} onChange={(event) => setDetail((current) => current && current.article.workspace ? { ...current, article: { ...current.article, workspace: { ...current.article.workspace, media: { ...current.article.workspace.media, credit: event.target.value } } } } : current)} />
				</label>
				<label className="block text-sm">License
					<input className="input w-full" value={workspace?.media.license ?? ''} onChange={(event) => setDetail((current) => current && current.article.workspace ? { ...current, article: { ...current.article, workspace: { ...current.article.workspace, media: { ...current.article.workspace.media, license: event.target.value } } } } : current)} />
				</label>
				<button className="btn" type="button" disabled={busy} onClick={() => act('media_meta', { heroAlt: workspace?.media.heroAlt, ogAlt: workspace?.media.ogAlt, credit: workspace?.media.credit, license: workspace?.media.license })}>Save image details</button>
				<details className="text-sm">
					<summary>Use an existing library image</summary>
					<label className="block">Asset ID
						<input className="input w-full" value={assetId} onChange={(event) => setAssetId(event.target.value)} />
					</label>
					<button className="btn" type="button" disabled={busy || !assetId} onClick={() => act('media', { role: 'hero', assetId })}>Use library image</button>
				</details>
			</section>

			<section className="card p-4 space-y-2">
				<h2 className="font-medium">CMS, approval, and schedule</h2>
				<p className="text-sm">Approval: {article.approval.status}. Schedule: {workspace?.schedule.status}. This schedule is for the website article, not a social post.</p>
				{workspace?.cms.draftUrl ? <p className="text-sm"><a href={workspace.cms.draftUrl}>CMS draft</a> {workspace.cms.revision != null ? `· revision ${workspace.cms.revision}` : ''}</p> : null}
				{workspace?.cms.lastError ? <p className="text-sm">{workspace.cms.lastError}</p> : null}
				{workspace?.schedule.blockedReason ? <p className="text-sm">{workspace.schedule.blockedReason}</p> : null}
				<button className="btn" type="button" disabled={busy} onClick={() => act(workspace?.cms.lastSyncAt ? 'update_draft' : 'submit_draft')}>
					{pending === 'submit_draft' || pending === 'update_draft' ? 'Sending…' : workspace?.cms.lastSyncAt ? 'Update CMS draft' : 'Send to CMS as draft'}
				</button>
				<details className="text-sm space-y-2">
					<summary>Approval and schedule</summary>
					<p>Website publishing stays manual. These actions do not publish the article or create a social post.</p>
					<button className="btn" type="button" disabled={busy} onClick={() => act('request_approval')}>Request approval</button>
					<button className="btn" type="button" disabled={busy} onClick={() => act('approve')}>Approve article</button>
					<label className="block">Publication date and time
						<input className="input w-full" type="datetime-local" value={publishAt} onChange={(event) => setPublishAt(event.target.value)} />
					</label>
					<button className="btn" type="button" disabled={busy || !publishAt} onClick={() => act('schedule', { publishAt: new Date(publishAt).toISOString(), destinationId: workspace?.destinationId })}>Schedule publication</button>
					<label className="block">Published URL, after you publish in the CMS
						<input className="input w-full" value={publishedUrl} onChange={(event) => setPublishedUrl(event.target.value)} placeholder="https://" />
					</label>
					<button className="btn" type="button" disabled={busy || !publishedUrl} onClick={() => act('record_publication', { url: publishedUrl })}>Record published URL</button>
				</details>
				{article.publication?.url ? <p className="text-sm"><a href={article.publication.url}>Published URL</a></p> : null}
			</section>
		</div>
	);
}
