'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BriefPanel, type BriefValues } from '@/components/articles/BriefPanel';
import { WorkspaceErrorBoundary } from '@/components/articles/WorkspaceErrorBoundary';
import { WorkspaceFrame } from '@/components/articles/WorkspaceFrame';
import { JobPanel } from '@/components/articles/JobPanel';
import { LifecycleBadges, type Lifecycle } from '@/components/articles/LifecycleBadges';
import { ResearchPanel } from '@/components/articles/ResearchPanel';
import { EditorialDeskPanel } from '@/components/articles/EditorialDeskPanel';
import { EditorialReviewBoard } from '@/components/articles/EditorialReviewBoard';
import type { RevisionResult } from '@/components/articles/ReviewPanel';
import { DraftWorkspace } from '@/components/articles/DraftWorkspace';
import { ImagePanel } from '@/components/articles/ImagePanel';
import { RevisionHistory } from '@/components/articles/RevisionDiff';
import { validateArticleStructure } from '@/lib/articles/structure';
import { reviewPrimary } from '@/lib/articles/reviewWorkflow';
import { summariseRevisionChange } from '@/lib/articles/revisionSummary';
import { findingGroup, findingTitle, passageAnchor, stageTone, workspaceStageFromLocation, type WorkspaceStageId } from '@/lib/articles/workspaceNavigation';
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
			setExternalId(article.workspace?.externalId ?? article.workspace?.cms?.externalId ?? '');
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
	const [stage, setStage] = useState<WorkspaceStageId>('draft');
	const [contextOpen, setContextOpen] = useState(true);
	const [reading, setReading] = useState(true);
	const [anchor, setAnchor] = useState<string | null>(null);
	const [justApplied, setJustApplied] = useState(false);
	const [changeSnippets, setChangeSnippets] = useState<string[]>([]);
	const [showChanges, setShowChanges] = useState(false);
	const [revisionSummary, setRevisionSummary] = useState<{
		current: number;
		previous: number;
		previousWords: number;
		nextWords: number;
		applied: number;
		resolved: number;
		remaining: number;
		bullets: string[];
	} | null>(null);
	useEffect(() => {
		if (!articleId) return;
		const stored = window.localStorage.getItem(`cce-stage:${articleId}`);
		setStage(workspaceStageFromLocation(window.location.search, stored));
	}, [articleId]);
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

	const tones = {
		brief: stageTone('brief', { briefApproved: stages.Brief, briefNeedsReapproval: Boolean(workspace?.briefChangedAfterApproval), researchApproved: stages.Research, researchChanged: research?.status === 'changed_since_approval', hasDraft: stages.Draft, reviewCurrent: stages.Review, reviewBlocked: !stages.Review && stages.Draft, imagesReady: stages.Images, seoReady: Boolean(article.seo.seoTitle && article.seo.metaDescription), cmsCurrent: stages.CMS }),
		research: stageTone('research', { briefApproved: stages.Brief, briefNeedsReapproval: false, researchApproved: stages.Research, researchChanged: research?.status === 'changed_since_approval', hasDraft: stages.Draft, reviewCurrent: stages.Review, reviewBlocked: false, imagesReady: stages.Images, seoReady: true, cmsCurrent: stages.CMS }),
		draft: stageTone('draft', { briefApproved: true, briefNeedsReapproval: false, researchApproved: true, researchChanged: false, hasDraft: stages.Draft, reviewCurrent: true, reviewBlocked: false, imagesReady: true, seoReady: true, cmsCurrent: true }),
		review: stageTone('review', { briefApproved: true, briefNeedsReapproval: false, researchApproved: true, researchChanged: false, hasDraft: true, reviewCurrent: stages.Review, reviewBlocked: stages.Draft && !stages.Review, imagesReady: true, seoReady: true, cmsCurrent: true }),
		images: stageTone('images', { briefApproved: true, briefNeedsReapproval: false, researchApproved: true, researchChanged: false, hasDraft: true, reviewCurrent: true, reviewBlocked: false, imagesReady: stages.Images, seoReady: true, cmsCurrent: true }),
		seo: stageTone('seo', { briefApproved: true, briefNeedsReapproval: false, researchApproved: true, researchChanged: false, hasDraft: true, reviewCurrent: true, reviewBlocked: false, imagesReady: true, seoReady: Boolean(article.seo.seoTitle && article.seo.metaDescription && article.seo.slug), cmsCurrent: true }),
		publish: stageTone('publish', { briefApproved: true, briefNeedsReapproval: false, researchApproved: true, researchChanged: false, hasDraft: true, reviewCurrent: true, reviewBlocked: false, imagesReady: true, seoReady: true, cmsCurrent: stages.CMS && detail.lifecycle.cmsCurrent }),
	};
	const editorialBrief = workspace?.editorialBrief?.current;
	const acceptedProposals = (workspace?.editorialDesk?.proposals ?? []).filter((item) => item.status === 'accepted');
	const critique = workspace?.editorialDesk?.critique;
	const previousRevision = detail.revisions.find((item) => item.number === (workspace?.revision?.number ?? 0) - 1);
	const savedChange = !revisionSummary && workspace?.revision?.source === 'improvement' && previousRevision && bodies[previousRevision.id]
		? summariseRevisionChange(bodies[previousRevision.id], article.body)
		: null;
	const visibleSummary = revisionSummary ?? (savedChange && workspace?.revision ? {
		current: workspace.revision.number,
		previous: previousRevision?.number ?? workspace.revision.number - 1,
		previousWords: previousRevision?.wordCount ?? savedChange.previousWords,
		nextWords: article.wordCount,
		applied: (workspace.revision.note?.match(/proposal-/g) ?? []).length || savedChange.added,
		resolved: (critique?.findings ?? []).filter((item) => item.status === 'resolved').length,
		remaining: (critique?.findings ?? []).filter((item) => item.status === 'open').length,
		bullets: savedChange.bullets,
	} : null);
	const visibleSnippets = showChanges ? (changeSnippets.length ? changeSnippets : savedChange?.addedSnippets ?? []) : [];
	const reviewStale = Boolean(workspace?.revision && critique && critique.revisionId !== workspace.revision.id);
	const blockingOpen = (critique?.findings ?? []).filter((finding) => finding.status === 'open' && finding.severity === 'critical').length;
	const reviewAction = reviewPrimary({
		hasCritique: Boolean(critique),
		reviewStale,
		accepted: acceptedProposals.length,
		hasPreview: Boolean(workspace?.editorialDesk?.preview),
		justApplied,
		blockingOpen,
	});
	function chooseStage(next: WorkspaceStageId) {
		if (unsaved && next !== stage && !window.confirm('You have unsaved changes. Switch stage without saving?')) return;
		setStage(next);
		window.localStorage.setItem(`cce-stage:${articleId}`, next);
		const url = new URL(window.location.href);
		url.searchParams.set('stage', next);
		window.history.replaceState(null, '', url);
	}
	const primary: Record<WorkspaceStageId, { label: string; run: () => void; disabled?: boolean }> = {
		brief: { label: editorialBrief?.status === 'approved' ? 'Brief approved' : 'Approve brief', disabled: busy || !editorialBrief || editorialBrief.status === 'approved', run: () => void actBool('approve_editorial_brief', {}, 'Editorial brief approved.') },
		research: { label: research?.status === 'approved' ? 'Research approved' : 'Review research', disabled: busy || !research?.version || research.status === 'approved', run: () => void actBool('approve_research', {}, 'Research approved. Generation will use this version.') },
		draft: { label: reading ? 'Edit article' : 'Read article', run: () => setReading((value) => !value) },
		review: {
			label: reviewAction.label,
			disabled: busy,
			run: () => {
				if (reviewAction.action === 'stay') return;
				if (reviewAction.action === 'draft') chooseStage('draft');
				else if (reviewAction.action === 'images') chooseStage('images');
				else if (reviewAction.action === 'preview') void actBool('preview_editorial_proposals', {}, 'Preview ready. Confirm to save these edits. The draft has not changed yet.');
				else if (reviewAction.action === 'apply') {
					const beforeBody = article.body;
					const beforeNumber = workspace?.revision?.number ?? 0;
					const openBefore = (critique?.findings ?? []).filter((item) => item.status === 'open').length;
					void act('apply_editorial_proposals', {}, 'Editorial edits applied successfully.').then((result) => {
						if (!result.ok) return;
						const saved = result.payload?.article as ArticleRecord | undefined;
						const change = summariseRevisionChange(beforeBody, saved?.body ?? beforeBody);
						const remaining = (saved?.workspace?.editorialDesk?.critique?.findings ?? []).filter((item) => item.status === 'open').length;
						setRevisionSummary({
							current: saved?.workspace?.revision?.number ?? beforeNumber,
							previous: beforeNumber,
							previousWords: change.previousWords,
							nextWords: saved?.wordCount ?? change.nextWords,
							applied: acceptedProposals.length,
							resolved: Math.max(0, openBefore - remaining),
							remaining,
							bullets: change.bullets,
						});
						setChangeSnippets(change.addedSnippets);
						setShowChanges(true);
						setJustApplied(true);
						setReading(true);
						setToast({ kind: 'ok', text: `Editorial edits applied successfully. Revision ${beforeNumber} → Revision ${saved?.workspace?.revision?.number ?? ''}.`, at: Date.now() });
						chooseStage('draft');
					});
				} else void actBool('critique_article', {}, 'Editorial pass complete. The draft was not rewritten.');
			},
		},
		images: { label: 'Review images', run: () => chooseStage('images') },
		seo: { label: seoDirty ? 'Save metadata' : 'Metadata saved', disabled: !seoDirty, run: () => document.getElementById('save-article')?.click() },
		publish: { label: workspace?.cms.lastSyncAt ? 'Update CMS draft' : 'Send to CMS as draft', disabled: busy || !workspace?.destinationId || unsaved, run: () => void actBool('submit_draft', {}, 'Draft sent to the CMS. It is not published.') },
	};

	return (
		<WorkspaceErrorBoundary>
		<WorkspaceFrame
			stage={stage}
			onStage={chooseStage}
			tones={tones}
			title={article.title}
			meta={
				<>
					<Link className="underline" href="/content/articles">Articles</Link>
					<span>{article.status}</span>
					<span>{article.wordCount.toLocaleString()} words</span>
					<span>{workspace?.revision ? `Revision ${workspace.revision.number}` : 'No revision'}</span>
					<span>Saved {new Date(article.updatedAt).toLocaleString()}</span>
					{unsaved ? <span className="text-warning">Unsaved changes</span> : null}
				</>
			}
			primaryLabel={primary[stage].label}
			onPrimary={primary[stage].run}
			primaryDisabled={primary[stage].disabled}
			contextOpen={contextOpen}
			onToggleContext={() => setContextOpen((value) => !value)}
			context={
				<div className="space-y-4 text-sm">
					{detail.nextStep ? (
						<div>
							<p className="text-xs uppercase text-text-dim">Next</p>
							<p className="font-medium">{detail.nextStep.action}</p>
							<p className="text-text-soft">{detail.nextStep.detail}</p>
						</div>
					) : null}
					{stage === 'brief' && editorialBrief ? (
						<div className="space-y-2">
							<p className="font-medium">Confirmed</p>
							<ul className="list-disc pl-4">{editorialBrief.confirmed.length ? editorialBrief.confirmed.map((item) => <li key={item}>{item}</li>) : <li>No confirmed research yet.</li>}</ul>
							<p className="font-medium">Proposed direction</p>
							<ul className="list-disc pl-4">{editorialBrief.proposed.map((item) => <li key={item}>{item}</li>)}</ul>
						</div>
					) : null}
					{stage === 'research' ? <p>Generation uses the approved research snapshot. A follow-up stays unapproved until you approve it here.</p> : null}
					{stage === 'draft' ? (
						<div className="space-y-2">
							<p>Read the article, then switch to Edit only when you want to change the Markdown source.</p>
							<button className="btn" type="button" disabled={busy || Boolean(generateBlocked)} onClick={() => void actBool('preview_improve', {}, '')}>Improve article</button>
							{generateBlocked ? <p className="text-text-soft">{generateBlocked}</p> : null}
						</div>
					) : null}
					{stage === 'review' && critique ? (
						<div className="space-y-3">
							<p>{critique.overall}</p>
							{(['Blocking', 'Important', 'Suggested improvements'] as const).map((group) => {
								const items = critique.findings.filter((finding) => findingGroup(finding.severity) === group);
								if (!items.length) return null;
								return (
									<div key={group}>
										<p className="font-medium">{group}</p>
										<ul className="space-y-2">
											{items.map((finding) => {
												const located = passageAnchor(article.body, finding);
												return (
													<li key={finding.id}>
														<button type="button" className="text-left underline" onClick={() => { setAnchor(located); chooseStage('draft'); setReading(true); }}>
															{findingTitle(finding.category)}
														</button>
														<p className="text-text-soft">{finding.explanation}</p>
														<p>{finding.recommendation}</p>
														<p className="text-xs text-text-dim">{finding.status}{located ? '' : ' · not tied to one passage'}</p>
													</li>
												);
											})}
										</ul>
									</div>
								);
							})}
							{acceptedProposals.length ? (
								<div>
									<p className="font-medium">Apply {acceptedProposals.length} accepted change{acceptedProposals.length === 1 ? '' : 's'}</p>
									<ul className="list-disc pl-4">{acceptedProposals.map((item) => <li key={item.id}>{item.action}</li>)}</ul>
								</div>
							) : null}
						</div>
					) : null}
					{stage === 'publish' ? <p>CCE sends a draft. A person publishes it in the destination CMS.</p> : null}
					<LifecycleBadges lifecycle={detail.lifecycle} />
				</div>
			}
		>
		<div className="space-y-6">

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

			<div className={stage === 'brief' ? 'space-y-6' : 'hidden'}>
			{editorialBrief ? (
				<article className="mx-auto max-w-3xl space-y-3">
					<p className="text-xs uppercase text-text-dim">Editorial brief · version {editorialBrief.version} · {editorialBrief.status.replaceAll('_', ' ')}</p>
					<h2 className="text-3xl font-semibold">{editorialBrief.publishedH1 || editorialBrief.title}</h2>
					<p><span className="text-text-soft">Primary keyword.</span> {editorialBrief.primaryKeyword}</p>
					<p><span className="text-text-soft">Secondary keywords.</span> {editorialBrief.supportingKeywords.join(', ') || 'None yet'}</p>
					<p><span className="text-text-soft">Search intent.</span> {editorialBrief.searchIntent}</p>
					<p><span className="text-text-soft">Audience.</span> {editorialBrief.audience}</p>
					<p><span className="text-text-soft">Objective.</span> {editorialBrief.outcome}</p>
					<p><span className="text-text-soft">SEO title.</span> {editorialBrief.seoTitle || editorialBrief.title}</p>
					<p><span className="text-text-soft">Words.</span> {editorialBrief.targetWords}</p>
					<p><span className="text-text-soft">Product.</span> {editorialBrief.brandRelevance}</p>
					<p><span className="text-text-soft">CTA.</span> {editorialBrief.cta}</p>
					{editorialBrief.sections.map((section) => (
						<div key={`${section.level}-${section.heading}`}>
							<h3 className="font-medium">{section.level === 3 ? 'H3' : 'H2'} · {section.heading}</h3>
							<p className="text-text-soft">{section.proposedDirection}</p>
							{section.confirmedEvidence.length ? <p>Confirmed: {section.confirmedEvidence.join(' · ')}</p> : <p>No confirmed evidence for this section.</p>}
						</div>
					))}
				</article>
			) : <p className="text-sm">Generate an editorial brief when the topic request below is ready.</p>}
			{workspace ? (
				<EditorialDeskPanel desk={workspace.editorialDesk} brief={workspace.editorialBrief} body={article.body} busy={busy} act={actBool} focus="brief" />
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
			</div>

			<div className={stage === 'research' ? 'space-y-6' : 'hidden'}>
			<ResearchPanel key={`${research?.version ?? 0}-${research?.status ?? 'empty'}`} research={research} busy={busy} pending={pending} act={actBool} />
			</div>

			<div className={stage === 'draft' || stage === 'seo' ? 'space-y-4' : 'hidden'}>
			{stage === 'draft' && visibleSummary ? (
				<section className="card mx-auto max-w-3xl space-y-2 p-4 text-sm">
					<h2 className="font-medium">Revision {visibleSummary.current} saved successfully</h2>
					<p>{visibleSummary.applied} editorial change{visibleSummary.applied === 1 ? '' : 's'} applied.</p>
					<ul className="list-disc pl-5">
						{visibleSummary.bullets.map((bullet) => <li key={bullet}>{bullet}</li>)}
					</ul>
					<p className="text-text-soft">
						Previous revision {visibleSummary.previous} ({visibleSummary.previousWords.toLocaleString()} words) · current revision {visibleSummary.current} ({visibleSummary.nextWords.toLocaleString()} words)
						· {visibleSummary.resolved} finding{visibleSummary.resolved === 1 ? '' : 's'} resolved · {visibleSummary.remaining} remaining
					</p>
					<div className="flex flex-wrap gap-2">
						<button className="btn" type="button" onClick={() => { setShowChanges(true); setReading(true); document.getElementById('change-0')?.scrollIntoView({ behavior: 'smooth', block: 'center' }); }}>View changes in article</button>
						<button className="btn" type="button" onClick={() => setShowChanges(false)}>Clean reading</button>
						<button className="btn" type="button" onClick={() => chooseStage('review')}>View editorial findings</button>
					</div>
				</section>
			) : null}
			{stage === 'draft' ? (
				<div className="mx-auto flex max-w-3xl items-center justify-between">
					<p className="text-sm text-text-soft">{reading ? 'Reading view' : 'Markdown source'}{showChanges ? ' · changes highlighted' : ''}</p>
					<button className="btn" type="button" onClick={() => setReading((value) => !value)}>{reading ? 'Edit source' : 'Read article'}</button>
				</div>
			) : (
				<div className="mx-auto max-w-3xl text-sm">
					<p className="text-text-soft">These fields are recommendations and page metadata. CCE does not have search-volume or ranking data for this article.</p>
					{article.primaryKeyword ? <p>Primary keyword: {article.primaryKeyword}</p> : null}
					<p>Search intent: {article.searchIntent}</p>
				</div>
			)}
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
				surface={stage === 'seo' ? 'seo' : 'draft'}
				reading={reading}
				anchor={anchor}
				highlights={visibleSnippets}
			/>
			</div>
			<details className={`card p-4 text-sm ${stage === 'draft' || stage === 'review' ? '' : 'hidden'}`}>
				<summary className="font-medium">Revision history</summary>
				<div className="pt-2">
					<RevisionHistory key={workspace?.revision?.id ?? 'none'} revisions={detail.revisions} bodies={bodies} currentId={workspace?.revision?.id ?? null} onRestore={(revisionId) => actBool('restore_revision', { revisionId }, 'Previous revision restored as a new revision. Nothing was published.')} />
				</div>
			</details>
			{workspace && stage === 'draft' ? (
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

			<div className={stage === 'review' ? 'space-y-6' : 'hidden'}>
			{workspace ? (
				<EditorialReviewBoard
					critique={critique ?? null}
					proposals={workspace.editorialDesk?.proposals ?? []}
					preview={workspace.editorialDesk?.preview ?? null}
					body={article.body}
					currentRevision={workspace.revision?.number ?? null}
					reviewedRevision={workspace.editorial.reviewedRevisionNumber ?? null}
					reviewStale={reviewStale}
					busy={busy}
					act={actBool}
					validationFindings={workspace.editorial.findings}
					currentRevisionId={workspace.revision?.id ?? null}
					onResearch={() => chooseStage('research')}
				/>
			) : null}
			</div>
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

			<div className={stage === 'images' ? 'space-y-6' : 'hidden'}>
			{workspace ? (
				<ImagePanel
					articleId={articleId}
					title={article.title}
					topic={article.topic}
					imageRequirements={workspace.imageRequirements}
					media={workspace.media}
					busy={busy}
					pending={pending}
					act={actBool}
					meta={media}
					onMetaChange={setMedia}
				/>
			) : null}
			</div>

			<div className={stage === 'publish' ? 'space-y-6' : 'hidden'}>
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

			<section className="card p-4 space-y-3" id="cms">
				<h2 className="font-medium">CMS draft</h2>
				<p className="text-sm text-text-soft">CCE sends drafts only. Publishing happens in the CMS, by a person. Each article gets its own unique CMS external ID for this destination.</p>
				<div className="flex flex-wrap gap-2 items-end">
					<label className="text-sm grow">External ID
						<input
							className="input w-full"
							value={externalId}
							disabled={Boolean(workspace?.externalId || workspace?.cms.externalId)}
							onChange={(event) => setExternalId(event.target.value)}
							placeholder="Auto-assigned on send, e.g. cce_your-article-slug"
						/>
					</label>
					<button className="btn" type="button" disabled={busy || !workspace?.destinationId} onClick={() => actBool('ensure_cms_external_id', {}, 'Unique CMS external ID assigned for this article.')}>
						{pending === 'ensure_cms_external_id' ? 'Assigning…' : workspace?.externalId || workspace?.cms.externalId ? 'ID assigned' : 'Assign unique ID'}
					</button>
					<button className="btn" type="button" disabled={busy || !(externalId.trim() || workspace?.externalId) || !workspace?.destinationId} onClick={() => actBool('lookup_draft', { externalId: externalId || workspace?.externalId })}>Look up in CMS</button>
					{!(workspace?.externalId || workspace?.cms.externalId) && externalId.trim() ? (
						<button className="btn" type="button" disabled={busy} onClick={() => void patch({ externalId }, 'link', 'External ID linked. Updates go to that CMS entry.')}>Link</button>
					) : null}
				</div>
				{(workspace?.externalId || workspace?.cms.externalId) ? (
					<p className="text-xs text-text-soft">Linked to <code>{workspace?.externalId || workspace?.cms.externalId}</code>. This ID is unique to this article and cannot be reused by another article.</p>
				) : (
					<p className="text-xs text-text-soft">No CMS identity yet. Assign a unique ID, or send the draft and CCE will allocate one automatically. Do not reuse another article’s ID.</p>
				)}
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
				{workspace?.cms.lastSubmission ? (
					<div className={`text-sm border rounded p-3 space-y-1 ${workspace.cms.lastSubmission.ok ? 'border-edge/60' : 'border-danger/60'}`}>
						<p className="font-medium">Last submission {workspace.cms.lastSubmission.ok ? 'succeeded' : 'failed'}</p>
						<p>
							{workspace.cms.lastSubmission.destinationName || workspace.cms.lastSubmission.destinationId}
							{' · '}{workspace.cms.lastSubmission.httpMethod}
							{' · '}{workspace.cms.lastSubmission.action}
							{' · '}{workspace.cms.lastSubmission.externalId}
							{workspace.cms.lastSubmission.cmsRevision != null ? ` · revision ${workspace.cms.lastSubmission.cmsRevision}` : ''}
							{workspace.cms.lastSubmission.cmsStatus ? ` · status ${workspace.cms.lastSubmission.cmsStatus}` : ''}
						</p>
						{workspace.cms.lastSubmission.error ? <p className="text-danger" role="alert">{workspace.cms.lastSubmission.error}</p> : null}
						{(workspace.cms.lastSubmission.adminUrl || workspace.cms.lastSubmission.previewUrl) ? (
							<p>
								{workspace.cms.lastSubmission.adminUrl ? <a className="underline" href={workspace.cms.lastSubmission.adminUrl} target="_blank" rel="noreferrer">Open CMS draft</a> : null}
								{workspace.cms.lastSubmission.adminUrl && workspace.cms.lastSubmission.previewUrl ? ' · ' : null}
								{workspace.cms.lastSubmission.previewUrl ? <a className="underline" href={workspace.cms.lastSubmission.previewUrl} target="_blank" rel="noreferrer">Preview</a> : null}
							</p>
						) : null}
					</div>
				) : null}
				{detail.lifecycle.submittedToCms && !detail.lifecycle.cmsCurrent ? <p className="text-sm text-warning">The CMS has an older revision than CCE.</p> : null}
				{workspace?.cms.lastError ? <p className="text-sm text-danger" role="alert">{workspace.cms.lastError}</p> : null}
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
		</div>
		</WorkspaceFrame>
		</WorkspaceErrorBoundary>
	);
}
