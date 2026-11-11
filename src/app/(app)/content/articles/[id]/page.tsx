'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BriefPanel, type BriefValues } from '@/components/articles/BriefPanel';
import { JobPanel } from '@/components/articles/JobPanel';
import { LifecycleBadges, type Lifecycle } from '@/components/articles/LifecycleBadges';
import { ResearchPanel } from '@/components/articles/ResearchPanel';
import { ReviewPanel, type RevisionResult } from '@/components/articles/ReviewPanel';
import { DraftWorkspace } from '@/components/articles/DraftWorkspace';
import { ImagePanel } from '@/components/articles/ImagePanel';
import { RevisionHistory } from '@/components/articles/RevisionDiff';
import { validateArticleStructure } from '@/lib/articles/structure';
import type { ArticleRecord, ArticleRevisionRef } from '@/lib/articles/types';

type ArticleDetail = {
	article: ArticleRecord;
	model: { role: string; resolved: string };
	job: { status: string; error: string | null } | null;
	nextStep?: { stage: string; action: string; detail: string };
	lifecycle: Lifecycle;
	revisions: ArticleRevisionRef[];
	approvalGate: { ok: true } | { ok: false; code: string; message: string };
	revisionResult: RevisionResult;
	taxonomy: { categories: Array<{ id: string; name: string; description?: string }>; contentTypes: string[]; requiredMetadata?: string[] } | null;
};

type Toast = { kind: 'ok' | 'error'; text: string; at: number };

const STAGES = ['Brief', 'Research', 'Draft', 'Review', 'Category', 'Images', 'CMS', 'Approval'] as const;

function stageState(article: ArticleRecord, lifecycle: Lifecycle, taxonomy: ArticleDetail['taxonomy']): Record<(typeof STAGES)[number], boolean> {
	const workspace = article.workspace;
	const editorial = workspace?.editorial;
	const reviewed = Boolean(editorial?.reviewedRevisionId && editorial.reviewedRevisionId === workspace?.revision?.id);
	const openCritical = (editorial?.findings ?? []).some((finding) => finding.severity === 'critical' && (finding.decision === 'pending' || finding.decision === 'accepted'));
	return {
		Brief: Boolean(workspace?.briefApprovedAt),
		Research: workspace?.research?.status === 'approved',
		Draft: Boolean(article.body.trim()),
		Review: reviewed && !openCritical,
		Category: article.categories.length > 0 && (!taxonomy || taxonomy.categories.some((category) => category.id === article.categories[0])),
		Images: Boolean(workspace?.media.deliveryVerified) || /^\s*(none|no images?)\s*$/i.test(workspace?.imageRequirements ?? ''),
		CMS: lifecycle.submittedToCms && lifecycle.cmsCurrent,
		Approval: lifecycle.approved,
	};
}

function briefValues(article: ArticleRecord): BriefValues {
	const workspace = article.workspace;
	const brief = workspace?.brief;
	return {
		topic: article.topic,
		workingTitle: workspace?.workingTitle ?? '',
		primaryKeyword: article.primaryKeyword ?? article.seo.primaryKeyword ?? '',
		searchIntent: article.searchIntent,
		audience: article.audience ?? '',
		contentType: workspace?.contentType ?? 'guide',
		targetWords: article.targetWords,
		destinationId: workspace?.destinationId ?? '',
		imageRequirements: workspace?.imageRequirements ?? '',
		researchRequirements: workspace?.researchRequirements ?? '',
		internalLinking: workspace?.internalLinking ?? '',
		categoryId: article.categories[0] ?? '',
		brief: {
			secondaryKeywords: brief?.secondaryKeywords ?? '',
			questions: brief?.questions ?? '',
			avoid: brief?.avoid ?? '',
			tone: brief?.tone ?? '',
			cta: brief?.cta ?? '',
			requiredLinks: brief?.requiredLinks ?? '',
			referenceMaterial: brief?.referenceMaterial ?? '',
			instructions: brief?.instructions ?? '',
			clusterRole: brief?.clusterRole ?? '',
			readerOutcome: brief?.readerOutcome ?? '',
			distinctiveContribution: brief?.distinctiveContribution ?? '',
			productConnection: brief?.productConnection ?? '',
			differentiateFrom: brief?.differentiateFrom ?? '',
		},
	};
}

function running(status: string | undefined | null) {
	return status === 'queued' || status === 'processing' || status === 'retrying';
}

export default function ArticleWorkspacePage() {
	const params = useParams();
	const articleId = typeof params.id === 'string' ? params.id : '';
	const [detail, setDetail] = useState<ArticleDetail | null>(null);
	const [loadError, setLoadError] = useState('');
	const [toast, setToast] = useState<Toast | null>(() =>
		typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('existing') === '1'
			? { kind: 'ok', text: 'This article already existed, so it was opened instead of creating a duplicate.', at: Date.now() }
			: null,
	);
	const [pending, setPending] = useState('');
	const [body, setBody] = useState('');
	const [seo, setSeo] = useState({ seoTitle: '', metaDescription: '', slug: '', excerpt: '' });
	const [briefDirty, setBriefDirty] = useState(false);
	const [externalId, setExternalId] = useState('');
	const [lookup, setLookup] = useState<null | { externalId: string; draft: { exists: boolean; revision?: number; status?: string; title?: string; category?: string | null } }>(null);
	const [cmsPreview, setCmsPreview] = useState<null | {
		label?: string;
		note?: string;
		blocking?: Array<{ message: string }>;
		issues?: Array<{ severity: string; message: string; count: number }>;
		canonical?: { wordCount?: number; blocks?: unknown[] };
	}>(null);
	const [categoryChoice, setCategoryChoice] = useState('');
	const [publishAt, setPublishAt] = useState('');
	const [publishedUrl, setPublishedUrl] = useState('');
	const [media, setMedia] = useState({ heroAlt: '', ogAlt: '', credit: '', license: '' });
	const [destinations, setDestinations] = useState<Array<{ key: string; name: string; enabled: boolean; id?: string; taxonomy?: { categories?: Array<{ id: string; name: string }>; contentTypes?: string[] } | null }>>([]);
	const serverBody = useRef<string | null>(null);
	const bodyRef = useRef('');
	useEffect(() => {
		bodyRef.current = body;
	}, [body]);

	const wasRunning = useRef(false);

	const apply = useCallback((payload: ArticleDetail, reset: boolean) => {
		setDetail(payload);
		const article = payload.article;
		const generationState = article.workspace?.generation;
		const revisionState = article.workspace?.revisionJob;
		const nowRunning = running(generationState?.status) || running(payload.job?.status) || running(revisionState?.status);
		let resetEditors = reset;
		if (wasRunning.current && !nowRunning) {
			const failed = generationState?.status === 'failed' || revisionState?.status === 'failed';
			setToast({ kind: failed ? 'error' : 'ok', text: failed ? 'The job failed. The details are shown below.' : 'The job finished. The page is up to date.', at: Date.now() });
			resetEditors = true;
		}
		wasRunning.current = nowRunning;
		if (resetEditors || serverBody.current === null || bodyRef.current === serverBody.current) setBody(article.body);
		serverBody.current = article.body;
		if (resetEditors) {
			setSeo({ seoTitle: article.seo.seoTitle, metaDescription: article.seo.metaDescription, slug: article.seo.slug, excerpt: article.excerpt });
			setMedia({
				heroAlt: article.workspace?.media.heroAlt ?? '',
				ogAlt: article.workspace?.media.ogAlt ?? '',
				credit: article.workspace?.media.credit ?? '',
				license: article.workspace?.media.license ?? '',
			});
			setExternalId(article.workspace?.externalId ?? '');
		}
	}, []);

	const load = useCallback(async (resetEditors = false) => {
		if (!articleId) return;
		const response = await fetch(`/api/articles/${articleId}`, { cache: 'no-store' });
		const payload = await response.json().catch(() => ({}));
		if (!response.ok) {
			setLoadError(payload.error ?? 'Article could not be loaded.');
			return;
		}
		apply(payload as ArticleDetail, resetEditors);
	}, [articleId, apply]);

	useEffect(() => {
		void Promise.resolve().then(() => load(true));
	}, [load]);

	const brandId = detail?.article.brandId;
	useEffect(() => {
		if (!brandId) return;
		void fetch(`/api/websites?brandId=${encodeURIComponent(brandId)}`)
			.then((response) => response.json())
			.then((payload) => setDestinations(Array.isArray(payload.destinations) ? payload.destinations : []))
			.catch(() => setDestinations([]));
	}, [brandId]);

	const generation = detail?.article.workspace?.generation;
	const revisionJob = detail?.article.workspace?.revisionJob;
	const jobRunning = running(generation?.status) || running(detail?.job?.status) || running(revisionJob?.status);
	useEffect(() => {
		if (!jobRunning) return;
		const timer = setInterval(() => void load(false), 3000);
		return () => clearInterval(timer);
	}, [jobRunning, load]);

	const bodyDirty = Boolean(detail) && body !== detail?.article.body;
	const seoDirty = Boolean(detail) && (seo.seoTitle !== detail?.article.seo.seoTitle || seo.metaDescription !== detail?.article.seo.metaDescription || seo.slug !== detail?.article.seo.slug || seo.excerpt !== detail?.article.excerpt);
	const unsaved = bodyDirty || seoDirty || briefDirty;
	useEffect(() => {
		if (!unsaved) return;
		const warn = (event: BeforeUnloadEvent) => event.preventDefault();
		window.addEventListener('beforeunload', warn);
		return () => window.removeEventListener('beforeunload', warn);
	}, [unsaved]);

	const act = useCallback(async (action: string, extra?: Record<string, unknown>, success?: string): Promise<{ ok: boolean; payload?: Record<string, unknown> }> => {
		setPending(action);
		const response = await fetch(`/api/articles/${articleId}/actions`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ action, ...extra }),
		});
		const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
		setPending('');
		if (!response.ok) {
			setToast({ kind: 'error', text: String(payload.error ?? 'That action failed.'), at: Date.now() });
			await load(false);
			return { ok: false, payload };
		}
		if (action === 'media' && extra?.assetId == null) {
			const saved = payload.article as { workspace?: { media?: { heroUrl?: string | null; ogUrl?: string | null; deliveryVerified?: boolean; deliveryError?: string | null } } } | undefined;
			const mediaState = saved?.workspace?.media;
			const role = extra?.role === 'og' ? 'og' : 'hero';
			const ready = role === 'og' ? Boolean(mediaState?.ogUrl) : Boolean(mediaState?.heroUrl && mediaState?.deliveryVerified);
			if (!ready) {
				setToast({
					kind: 'error',
					text: mediaState?.deliveryError || (role === 'og' ? 'Social image generation did not finish.' : 'Hero image is not verified for the destination yet.'),
					at: Date.now(),
				});
				await load(false);
				return { ok: false, payload };
			}
		}
		if (action === 'lookup_draft') setLookup(payload as typeof lookup);
		if (action === 'destination_preview') setCmsPreview((payload.preview as typeof cmsPreview) ?? null);
		const text = typeof payload.message === 'string' ? payload.message : success;
		if (text) setToast({ kind: 'ok', text, at: Date.now() });
		await load(
			action !== 'research_edit' &&
				action !== 'preview_structural_repair' &&
				action !== 'preview_improve' &&
				action !== 'destination_preview' &&
				action !== 'suggest_titles',
		);
		return { ok: true, payload };
	}, [articleId, load]);

	const actBool = useCallback(
		async (action: string, extra?: Record<string, unknown>, success?: string) => (await act(action, extra, success)).ok,
		[act],
	);

	async function patch(fields: Record<string, unknown>, label: string, success: string): Promise<boolean> {
		setPending(label);
		const response = await fetch(`/api/articles/${articleId}`, {
			method: 'PATCH',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(fields),
		});
		const payload = await response.json().catch(() => ({}));
		setPending('');
		if (!response.ok) {
			setToast({ kind: 'error', text: payload.error ?? 'Save failed. Your changes are still on this page.', at: Date.now() });
			return false;
		}
		const revision = (payload.article as ArticleRecord | undefined)?.workspace?.revision;
		setToast({ kind: 'ok', text: fields.body !== undefined && revision ? `${success} Revision ${revision.number}.` : success, at: Date.now() });
		await load(true);
		return true;
	}

	const structure = useMemo(() => (body.trim() ? validateArticleStructure(body) : null), [body]);
	const bodies = useMemo(() => {
		const map: Record<string, string> = {};
		for (const version of detail?.article.versions ?? []) if (version.revisionId) map[version.revisionId] = version.body;
		const current = detail?.article.workspace?.revision?.id;
		if (current) map[current] = detail!.article.body;
		return map;
	}, [detail]);

	if (!detail) return <div className="mx-auto max-w-4xl p-6">{loadError || 'Loading article…'}</div>;
	const article = detail.article;
	const workspace = article.workspace;
	const busy = pending !== '';
	const stages = stageState(article, detail.lifecycle, detail.taxonomy);
	const currentStage = STAGES.find((stage) => !stages[stage]);
	const research = workspace?.research;
	const generateBlocked = !workspace?.briefApprovedAt
		? 'Approve the brief first.'
		: research?.status !== 'approved'
			? research?.status === 'changed_since_approval' ? 'Research changed since approval. Approve the current version first.' : 'Approve the research first.'
			: article.approval.status === 'approved'
				? 'The article is approved. Remove approval by editing before regenerating.'
				: '';
	const target = article.targetWords;
	const suggestion = workspace?.categorySuggestion;
	const categoryName = (id: string) => detail.taxonomy?.categories.find((category) => category.id === id)?.name ?? id;
	const gate = detail.approvalGate;

	return (
		<div className="mx-auto max-w-5xl p-6 space-y-6">
			<header className="space-y-3">
				<Link className="text-sm underline" href="/content/articles">Articles</Link>
				<h1 className="text-2xl font-semibold">{article.title}</h1>
				<LifecycleBadges lifecycle={detail.lifecycle} />
				<ol className="flex flex-wrap gap-1 text-xs" aria-label="Workflow stages">
					{STAGES.map((stage, index) => (
						<li
							key={stage}
							aria-current={stage === currentStage ? 'step' : undefined}
							className={`rounded px-2 py-1 border ${stages[stage] ? 'border-accent/50 bg-accent/10' : stage === currentStage ? 'border-primary bg-primary/15 font-medium' : 'border-edge text-text-dim'}`}
						>
							{index + 1}. {stage}{stages[stage] ? ' ✓' : ''}
						</li>
					))}
				</ol>
				{detail.nextStep ? (
					<div className="card p-4">
						<p className="text-sm text-text-soft">Next step · {detail.nextStep.stage}</p>
						<p className="font-medium">{detail.nextStep.action}</p>
						<p className="text-sm text-text-soft">{detail.nextStep.detail}</p>
					</div>
				) : null}
				{unsaved ? <p className="text-sm text-warning">You have unsaved changes on this page.</p> : null}
			</header>

			<div aria-live="polite" className="sticky top-2 z-10">
				{toast ? (
					<div className={`card p-3 text-sm flex justify-between gap-3 ${toast.kind === 'error' ? 'border-danger/60' : 'border-accent/60'}`} role={toast.kind === 'error' ? 'alert' : 'status'}>
						<span>{toast.kind === 'ok' ? '✓ ' : ''}{toast.text}</span>
						<button type="button" className="text-xs underline" onClick={() => setToast(null)}>Dismiss</button>
					</div>
				) : null}
			</div>

			{running(generation?.status) || running(detail.job?.status) ? (
				<JobPanel title="Writing the draft" stage={generation?.stage ?? null} startedAt={generation?.startedAt ?? null} updatedAt={generation?.updatedAt ?? null} status={generation?.status ?? 'queued'} />
			) : null}
			{running(revisionJob?.status) ? (
				<JobPanel title="Applying accepted recommendations" stage={revisionJob?.stage ?? null} startedAt={revisionJob?.startedAt ?? null} updatedAt={revisionJob?.updatedAt ?? null} status={revisionJob?.status ?? 'queued'} />
			) : null}
			{generation?.status === 'failed' && generation.error ? (
				<div className="card p-4 text-sm border-danger/60" role="alert">
					<p className="font-medium">Generation failed</p>
					<p>{generation.error}</p>
					<button className="btn mt-2" type="button" disabled={busy || Boolean(generateBlocked)} onClick={() => actBool('retry', {}, 'Generation restarted.')}>Retry</button>
				</div>
			) : null}
			{revisionJob?.status === 'failed' && revisionJob.error ? (
				<div className="card p-4 text-sm border-danger/60" role="alert">
					<p className="font-medium">The revision failed and nothing was saved</p>
					<p>{revisionJob.error}</p>
				</div>
			) : null}

			<BriefPanel
				key={JSON.stringify(briefValues(article))}
				initial={briefValues(article)}
				destinations={destinations}
				contentTypes={detail.taxonomy?.contentTypes ?? null}
				categories={detail.taxonomy?.categories ?? null}
				wordTarget={workspace?.wordTarget ?? null}
				actualWordCount={article.wordCount}
				approvedAt={workspace?.briefApprovedAt ?? null}
				changedAfterApproval={Boolean(workspace?.briefChangedAfterApproval)}
				suggestions={workspace?.briefSuggestions?.suggestions ?? []}
				busy={busy}
				pending={pending}
				act={actBool}
				onDirtyChange={setBriefDirty}
				save={(values) => patch({ ...values }, 'save_brief', 'Brief saved in CCE.')}
			/>

			<ResearchPanel key={`${research?.version ?? 0}-${research?.status ?? 'empty'}`} research={research} busy={busy} pending={pending} act={actBool} />

			<DraftWorkspace
				articleId={articleId}
				body={body}
				setBody={setBody}
				seo={seo}
				setSeo={setSeo}
				targetWords={target}
				structure={structure}
				revisionNumber={workspace?.revision?.number ?? null}
				generateBlocked={generateBlocked}
				jobRunning={jobRunning}
				busy={busy}
				pending={pending}
				articleBody={article.body}
				publishedTitle={article.title}
				workingTitle={workspace?.workingTitle || article.title}
				initialSeo={{
					seoTitle: article.seo.seoTitle,
					metaDescription: article.seo.metaDescription,
					slug: article.seo.slug,
					excerpt: article.excerpt,
				}}
				act={act}
				onSaved={() => load(true)}
			/>
			<details className="card p-4 text-sm">
				<summary className="font-medium">Revision history</summary>
				<div className="pt-2">
					<RevisionHistory key={workspace?.revision?.id ?? 'none'} revisions={detail.revisions} bodies={bodies} currentId={workspace?.revision?.id ?? null} />
				</div>
			</details>
			{workspace ? (
				<details className="card p-4 text-sm">
					<summary className="font-medium">Generation details</summary>
					<p className="pt-2">Model role {detail.model.role}: {workspace.generation.model || detail.model.resolved}</p>
					{workspace.generation.promptTokens || workspace.generation.completionTokens ? (
						<p>Tokens {workspace.generation.promptTokens} in / {workspace.generation.completionTokens} out
							{workspace.generation.estimatedCostUsd != null ? ` · estimated $${workspace.generation.estimatedCostUsd}` : ''}
						</p>
					) : null}
					{workspace.generation.researchVersion ? <p>Written from research version {workspace.generation.researchVersion}</p> : null}
				</details>
			) : null}

			{workspace ? (
				<ReviewPanel
					editorial={workspace.editorial}
					currentRevision={workspace.revision ? { id: workspace.revision.id, number: workspace.revision.number } : null}
					revisionResult={detail.revisionResult}
					revisionRunning={running(revisionJob?.status)}
					approved={article.approval.status === 'approved'}
					busy={busy}
					pending={pending}
					act={actBool}
				/>
			) : null}
			{detail.revisionResult?.baseRevisionId &&
			detail.revisionResult.resultRevisionId &&
			bodies[detail.revisionResult.baseRevisionId] &&
			bodies[detail.revisionResult.resultRevisionId] ? (
				<details className="card p-4 text-sm">
					<summary className="font-medium">Before and after the last applied revision</summary>
					<div className="pt-2">
						<RevisionHistory
							key={detail.revisionResult.resultRevisionId}
							revisions={detail.revisions.filter(
								(revision) =>
									revision.id === detail.revisionResult!.baseRevisionId || revision.id === detail.revisionResult!.resultRevisionId,
							)}
							bodies={bodies}
							currentId={detail.revisionResult.resultRevisionId}
						/>
					</div>
				</details>
			) : null}

			<section className="card p-4 space-y-3" id="category">
				<h2 className="font-medium">Category</h2>
				{!workspace?.destinationId ? <p className="text-sm">Choose a website destination in the brief first.</p> : null}
				{workspace?.destinationId && !detail.taxonomy ? <p className="text-sm">This destination has no synced categories. Sync them in <Link className="underline" href="/connections/websites">Websites & CMS</Link>.</p> : null}
				<p className="text-sm">Selected: {article.categories[0] ? `${categoryName(article.categories[0])} (${article.categories[0]})` : 'None'}</p>
				{article.categories[0] && detail.taxonomy && !detail.taxonomy.categories.some((category) => category.id === article.categories[0]) ? (
					<p className="text-sm text-danger">This category no longer exists in the CMS. Choose another.</p>
				) : null}
				{suggestion ? (
					<div className="rounded border border-edge/60 p-2 text-sm space-y-1">
						<p>Suggested: <strong>{categoryName(suggestion.categoryId)}</strong> ({suggestion.categoryId}) · from {suggestion.source === 'ai' ? 'the model' : suggestion.source === 'mapping' ? 'a topic mapping' : 'the destination default'}</p>
						<p className="text-xs text-text-soft">{suggestion.reason}</p>
						<button className="btn" type="button" disabled={busy} onClick={() => actBool('classify', { categoryId: suggestion.categoryId }, 'Category set.')}>Use suggestion</button>
					</div>
				) : null}
				{detail.taxonomy ? (
					<div className="flex flex-wrap gap-2 items-end">
						<label className="text-sm">Choose a category
							<select className="input ml-2" value={categoryChoice || article.categories[0] || ''} onChange={(event) => setCategoryChoice(event.target.value)}>
								<option value="">—</option>
								{detail.taxonomy.categories.map((category) => <option key={category.id} value={category.id}>{category.name} ({category.id})</option>)}
							</select>
						</label>
						<button className="btn" type="button" disabled={busy || !categoryChoice || categoryChoice === article.categories[0]} onClick={() => actBool('classify', { categoryId: categoryChoice }, 'Category set.')}>Set category</button>
						<button className="btn" type="button" disabled={busy} onClick={() => actBool('classify', {}, 'Suggestion ready. The category is not changed until you use it.')}>Suggest a category</button>
					</div>
				) : null}
			</section>

			{workspace ? (
				<ImagePanel
					articleId={articleId}
					imageRequirements={workspace.imageRequirements}
					media={workspace.media}
					busy={busy}
					pending={pending}
					act={actBool}
					meta={media}
					onMetaChange={setMedia}
				/>
			) : null}

			<section className="card p-4 space-y-3" id="cms">
				<h2 className="font-medium">CMS draft</h2>
				<p className="text-sm text-text-soft">CCE sends drafts only. Publishing happens in the CMS, by a person.</p>
				<div className="flex flex-wrap gap-2 items-end">
					<label className="text-sm grow">External ID
						<input className="input w-full" value={externalId} disabled={Boolean(workspace?.externalId)} onChange={(event) => setExternalId(event.target.value)} placeholder="cce_pillar_novel-first-draft" />
					</label>
					<button className="btn" type="button" disabled={busy || !externalId.trim() || !workspace?.destinationId} onClick={() => actBool('lookup_draft', { externalId })}>Look up in CMS</button>
					{!workspace?.externalId ? (
						<button className="btn" type="button" disabled={busy || !externalId.trim()} onClick={() => void patch({ externalId }, 'link', 'External ID linked. Updates go to that CMS entry.')}>Link</button>
					) : null}
				</div>
				{workspace?.externalId ? <p className="text-xs text-text-soft">Linked to {workspace.externalId}. The link cannot be changed, so a second CMS entry is never created.</p> : null}
				{lookup ? (
					<p className="text-sm">
						{lookup.draft.exists
							? `Found “${lookup.draft.title}” in the CMS · revision ${lookup.draft.revision} · ${lookup.draft.status}${lookup.draft.category ? ` · category ${lookup.draft.category}` : ''}`
							: `No CMS entry with ID ${lookup.externalId}. Sending creates one.`}
					</p>
				) : null}
				{workspace?.cms.lastSyncAt ? (
					<p className="text-sm">
						Last sent {new Date(workspace.cms.lastSyncAt).toLocaleString()}
						{workspace.cms.revision != null ? ` · CMS revision ${workspace.cms.revision}` : ''}
						{workspace.cms.mode === 'proposal' ? ' · sent as a proposal for the CMS editor to accept' : ''}
						{workspace.cms.remoteStatus ? ` · CMS status ${workspace.cms.remoteStatus}` : ''}
						{workspace.cms.draftUrl ? <> · <a className="underline" href={workspace.cms.draftUrl} target="_blank" rel="noreferrer">Open in CMS</a></> : null}
					</p>
				) : null}
				{detail.lifecycle.submittedToCms && !detail.lifecycle.cmsCurrent ? <p className="text-sm text-warning">The CMS has an older revision than CCE.</p> : null}
				{workspace?.cms.lastError ? <p className="text-sm text-danger">{workspace.cms.lastError}</p> : null}
				<div className="flex flex-wrap gap-2">
					<button className="btn" type="button" disabled={busy || !workspace?.destinationId} onClick={() => actBool('destination_preview', {}, 'CMS compatibility preview ready.')}>
						{pending === 'destination_preview' ? 'Checking…' : 'Preview CMS mapping'}
					</button>
					<button className="btn" type="button" disabled={busy || jobRunning || !workspace?.destinationId || unsaved || Boolean(cmsPreview?.blocking?.length)} onClick={() => actBool('submit_draft', {}, 'Draft sent to the CMS. It is not published.')}>
						{pending === 'submit_draft' ? 'Sending…' : workspace?.cms.lastSyncAt ? 'Update CMS draft' : 'Send to CMS as draft'}
					</button>
				</div>
				{unsaved ? <span className="text-xs text-text-soft">Save your changes first.</span> : null}
				{cmsPreview ? (
					<div className="text-sm space-y-1 border-t border-edge/50 pt-3">
						<p className="font-medium">{cmsPreview.label ?? 'CMS compatibility preview'}</p>
						<p className="text-text-soft">{cmsPreview.note}</p>
						<p className="text-xs text-text-soft">Canonical blocks: {cmsPreview.canonical?.blocks?.length ?? 0} · words: {cmsPreview.canonical?.wordCount ?? '—'}. This is not a live website render.</p>
						{(cmsPreview.blocking?.length ?? 0) > 0 ? (
							<p className="text-danger" role="alert">Blocking: {cmsPreview.blocking!.map((issue) => issue.message).join(' ')}</p>
						) : (
							<p>No blocking compatibility issues.</p>
						)}
						{(cmsPreview.issues ?? []).filter((issue) => issue.severity !== 'blocking').length ? (
							<ul className="list-disc pl-5 text-text-soft">
								{cmsPreview.issues!.filter((issue) => issue.severity !== 'blocking').map((issue) => (
									<li key={`${issue.severity}-${issue.message}`}>{issue.message}{issue.count > 1 ? ` (${issue.count})` : ''}</li>
								))}
							</ul>
						) : null}
					</div>
				) : null}
			</section>

			<section className="card p-4 space-y-3" id="approval">
				<h2 className="font-medium">Approval and schedule</h2>
				<p className="text-sm">
					Approval: {article.approval.status}
					{workspace?.approvedAt ? ` · ${new Date(workspace.approvedAt).toLocaleString()}` : ''}
					{' · '}Schedule: {workspace?.schedule.status}
				</p>
				{!gate.ok ? <p className="text-sm text-warning">{gate.message}</p> : null}
				{workspace?.schedule.blockedReason ? <p className="text-sm">{workspace.schedule.blockedReason}</p> : null}
				<div className="flex flex-wrap gap-2">
					<button className="btn" type="button" disabled={busy || article.approval.status === 'approved'} onClick={() => actBool('request_approval', {}, 'Approval requested.')}>Request approval</button>
					<button className="btn" type="button" disabled={busy || !gate.ok || article.approval.status === 'approved'} onClick={() => actBool('approve', {}, `Revision ${workspace?.revision?.number ?? ''} approved.`)}>Approve article</button>
				</div>
				<details className="text-sm space-y-2">
					<summary>Schedule and record publication</summary>
					<p>Scheduling records the intended time. It does not publish and does not create a social post.</p>
					<label className="block">Publication date and time
						<input className="input w-full" type="datetime-local" value={publishAt} onChange={(event) => setPublishAt(event.target.value)} />
					</label>
					<button className="btn" type="button" disabled={busy || !publishAt} onClick={() => actBool('schedule', { publishAt: new Date(publishAt).toISOString(), destinationId: workspace?.destinationId }, 'Schedule saved.')}>Schedule publication</button>
					<label className="block">Published URL, after you publish in the CMS
						<input className="input w-full" value={publishedUrl} onChange={(event) => setPublishedUrl(event.target.value)} placeholder="https://" />
					</label>
					<button className="btn" type="button" disabled={busy || !publishedUrl} onClick={() => actBool('record_publication', { url: publishedUrl }, 'Published URL recorded.')}>Record published URL</button>
				</details>
				{article.publication?.url ? <p className="text-sm"><a className="underline" href={article.publication.url}>Published URL</a></p> : null}
			</section>
		</div>
	);
}
