'use client';

import { useEffect, useMemo, useState } from 'react';
import { ArticleReader } from './ArticleReader';
import { DiffView } from './RevisionDiff';
import type { StructuralRepairPreview } from '@/lib/articles/structuralRepair';
import { validateArticleStructure } from '@/lib/articles/structure';

type Act = (action: string, extra?: Record<string, unknown>, success?: string) => Promise<{ ok: boolean; payload?: Record<string, unknown> }>;

export type ImprovePreview = {
	proposedBody: string;
	summary: string;
	baseRevisionId: string;
};

type SeoState = { seoTitle: string; metaDescription: string; slug: string; excerpt: string };

const SEO_LIMITS = { seoTitle: 70, metaDescription: 160, excerpt: 320 } as const;

function fieldIssues(field: keyof typeof SEO_LIMITS, value: string): string[] {
	const issues: string[] = [];
	if (!value.trim()) issues.push('Required.');
	if (/##|```|^[-*+]\s/m.test(value)) issues.push('Use plain text only.');
	if (value.length > SEO_LIMITS[field]) issues.push(`Over ${SEO_LIMITS[field]} characters.`);
	return issues;
}

export function DraftWorkspace({
	articleId,
	body,
	setBody,
	seo,
	setSeo,
	targetWords,
	structure,
	revisionNumber,
	generateBlocked,
	jobRunning,
	busy,
	pending,
	articleBody,
	initialSeo,
	act,
	onSaved,
	publishedTitle,
	workingTitle,
	surface,
	reading,
	anchor,
	highlights,
}: {
	articleId: string;
	body: string;
	setBody: (value: string) => void;
	seo: SeoState;
	setSeo: (value: SeoState) => void;
	targetWords: number;
	structure: ReturnType<typeof validateArticleStructure> | null;
	revisionNumber: number | null;
	generateBlocked: string;
	jobRunning: boolean;
	busy: boolean;
	pending: string;
	articleBody: string;
	initialSeo: SeoState;
	act: Act;
	onSaved: () => Promise<void>;
	publishedTitle: string;
	workingTitle: string;
	surface: 'draft' | 'seo';
	reading: boolean;
	anchor: string | null;
	highlights?: string[];
}) {
	const [repair, setRepair] = useState<StructuralRepairPreview | null>(null);
	const [improve, setImprove] = useState<ImprovePreview | null>(null);
	const [title, setTitle] = useState(publishedTitle);
	const [suggestions, setSuggestions] = useState<Array<{ title: string; rationale: string }>>([]);
	const titleDirty = title.trim() !== publishedTitle.trim();
	useEffect(() => {
		setTitle(publishedTitle);
	}, [publishedTitle]);
	const bodyDirty = body !== articleBody;
	const seoDirty = JSON.stringify(seo) !== JSON.stringify(initialSeo);
	const actualWords = structure?.wordCount ?? 0;
	const deviation = targetWords ? Math.round(((actualWords - targetWords) / targetWords) * 100) : 0;
	const criticalStructure = structure?.issues.filter((issue) => issue.severity === 'critical').length ?? 0;
	const seoIssues = useMemo(
		() => ({
			seoTitle: fieldIssues('seoTitle', seo.seoTitle),
			metaDescription: fieldIssues('metaDescription', seo.metaDescription),
			excerpt: fieldIssues('excerpt', seo.excerpt),
		}),
		[seo],
	);

	async function saveDraft() {
		const response = await fetch(`/api/articles/${articleId}`, {
			method: 'PATCH',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				...(bodyDirty ? { body } : {}),
				...(titleDirty ? { title: title.trim() } : {}),
				...(seoDirty ? { seoTitle: seo.seoTitle, metaDescription: seo.metaDescription, excerpt: seo.excerpt, slug: seo.slug } : {}),
			}),
		});
		const payload = await response.json();
		if (!response.ok) {
			alert(payload.error ?? 'Save failed.');
			return;
		}
		await onSaved();
	}

	return (
		<section className="card p-4 space-y-4" id="draft">
			<div className="flex flex-wrap items-baseline justify-between gap-2">
				<div>
					<h2 className="font-medium">Draft</h2>
					<p className="text-xs text-text-soft">Structural validation is automatic. Editorial review and accepted recommendations are separate.</p>
				</div>
				<p className="text-sm">
					{revisionNumber ? `Revision ${revisionNumber}` : 'No revision yet'}
					{bodyDirty || seoDirty ? ' · unsaved edits' : ''}
				</p>
			</div>

			{surface === 'draft' ? <div className="flex flex-wrap gap-2 items-center">
				<button className="btn" type="button" disabled={busy || jobRunning || Boolean(generateBlocked)} onClick={() => void act('generate', {}, 'Generation started.')}>
					{pending === 'generate' ? 'Starting…' : articleBody.trim() ? 'Regenerate draft' : 'Generate draft'}
				</button>
				<button
					className="btn"
					type="button"
					disabled={busy || !articleBody.trim()}
					onClick={async () => {
						const { ok, payload } = await act('preview_structural_repair');
						if (ok && payload?.preview) {
							setRepair(payload.preview as StructuralRepairPreview);
							setImprove(null);
						}
					}}
				>
					{pending === 'preview_structural_repair' ? 'Checking…' : 'Fix structural issues'}
				</button>
				<button
					className="btn"
					type="button"
					disabled={busy || bodyDirty || !articleBody.trim()}
					onClick={async () => {
						const { ok, payload } = await act('preview_improve');
						if (ok && payload?.preview) {
							setImprove(payload.preview as ImprovePreview);
							setRepair(null);
						}
					}}
				>
					{pending === 'preview_improve' ? 'Preparing…' : 'Improve article with AI'}
				</button>
				{generateBlocked ? <span className="text-xs text-text-soft">{generateBlocked}</span> : null}
			</div> : null}

			{surface === 'draft' && structure ? (
				<div className="rounded border border-edge/60 p-3 text-sm space-y-1" aria-label="Structural validation">
					<p className="font-medium">Structural validation {structure.ok ? 'passed' : `${criticalStructure} critical issue${criticalStructure === 1 ? '' : 's'}`}</p>
					<p className="text-text-soft">
						{actualWords.toLocaleString()} words · target {targetWords.toLocaleString()}{targetWords ? ` (${deviation > 0 ? '+' : ''}${deviation}%)` : ''} · {structure.sectionCount} H2 sections
						{structure.endsCleanly ? ' · ends cleanly' : ' · ending needs attention'}
					</p>
					{structure.issues.map((issue, index) => (
						<p key={index} className={issue.severity === 'critical' ? 'text-danger' : 'text-warning'}>
							{issue.message}
						</p>
					))}
				</div>
			) : null}

			{surface === 'draft' && repair ? (
				<div className="rounded border border-edge/60 p-3 space-y-2 text-sm">
					<p className="font-medium">Structural repair preview</p>
					<p>
						Removes {repair.changes.length} duplicate heading line{repair.changes.length === 1 ? '' : 's'}.
						{' '}Words stay {repair.wordCountBefore.toLocaleString()} → {repair.wordCountAfter.toLocaleString()}.
					</p>
					<ul className="list-disc pl-5">{repair.changes.map((change, index) => <li key={index}>{change.message}</li>)}</ul>
					{repair.unresolved.length ? (
						<div>
							<p className="font-medium">Still open after repair</p>
							<ul className="list-disc pl-5">
								{repair.unresolved.map((item, index) => (
									<li key={index}>
										{item.message}
										{item.aiRepairSuggested ? ' Try Improve article with AI.' : ` ${item.reason}`}
									</li>
								))}
							</ul>
						</div>
					) : null}
					<DiffView before={repair.before} after={repair.after} />
					<div className="flex gap-2">
						<button
							className="btn"
							type="button"
							disabled={busy || !repair.canApply}
							onClick={async () => {
								const { ok } = await act('apply_structural_repair', {}, 'Structural repair saved as a new revision.');
								if (ok) {
									setRepair(null);
									await onSaved();
								}
							}}
						>
							Apply repair as new revision
						</button>
						<button className="btn" type="button" onClick={() => setRepair(null)}>Cancel</button>
					</div>
				</div>
			) : null}

			{surface === 'draft' && improve ? (
				<div className="rounded border border-edge/60 p-3 space-y-2 text-sm">
					<p className="font-medium">AI improvement preview</p>
					<p>{improve.summary}</p>
					<DiffView before={articleBody} after={improve.proposedBody} />
					<div className="flex gap-2">
						<button
							className="btn"
							type="button"
							disabled={busy}
							onClick={async () => {
								const { ok } = await act('apply_improve', { proposedBody: improve.proposedBody, baseRevisionId: improve.baseRevisionId }, 'Improvement saved. Review ran on the new revision.');
								if (ok) {
									setImprove(null);
									await onSaved();
								}
							}}
						>
							Apply as new revision and run review
						</button>
						<button className="btn" type="button" onClick={() => setImprove(null)}>Cancel</button>
					</div>
				</div>
			) : null}

			{surface === 'draft' && reading ? <ArticleReader title={title} body={body} anchor={anchor} highlights={highlights} /> : null}
			{surface === 'draft' && !reading ? (
				<textarea className="input w-full min-h-[28rem] font-mono resize-y" aria-label="Article body (Markdown)" value={body} onChange={(event) => setBody(event.target.value)} />
			) : null}

			{surface === 'seo' ? <div className="space-y-3">
				<div className="flex flex-wrap items-center justify-between gap-2">
					<h3 className="text-sm font-medium">Titles</h3>
					<button
						className="btn"
						type="button"
						disabled={busy}
						onClick={async () => {
							const { ok, payload } = await act('suggest_titles');
							if (ok && payload?.suggestions) setSuggestions(payload.suggestions as Array<{ title: string; rationale: string }>);
						}}
					>
						Suggest headlines
					</button>
				</div>
				<p className="text-xs text-text-soft">Working title (brief): {workingTitle || '—'} · Published H1 is separate from SEO title and slug.</p>
				<label className="block text-sm">
					Published article title / H1
					<input className="input w-full" value={title} onChange={(event) => setTitle(event.target.value)} />
				</label>
				{suggestions.length ? (
					<ul className="space-y-2 text-sm">
						{suggestions.map((suggestion) => (
							<li key={suggestion.title} className="rounded border border-edge/50 p-2">
								<p className="font-medium">{suggestion.title}</p>
								<p className="text-xs text-text-soft">{suggestion.rationale}</p>
								<button className="btn mt-1" type="button" onClick={() => setTitle(suggestion.title)}>
									Use as published title
								</button>
							</li>
						))}
					</ul>
				) : null}
				<div className="flex flex-wrap items-center justify-between gap-2">
					<h3 className="text-sm font-medium">SEO metadata</h3>
					<button
						className="btn"
						type="button"
						disabled={busy || bodyDirty}
						onClick={() => void act('regenerate_seo', { useAi: true }, 'SEO metadata regenerated. The article body was not changed.').then(async ({ ok }) => ok && onSaved())}
					>
						Regenerate SEO metadata
					</button>
				</div>
				<div className="grid gap-3 md:grid-cols-2">
					<label className="block text-sm">
						SEO title <span className={`text-xs ${seo.seoTitle.length > SEO_LIMITS.seoTitle ? 'text-danger' : 'text-text-soft'}`}>{seo.seoTitle.length}/{SEO_LIMITS.seoTitle}</span>
						{seoIssues.seoTitle.map((issue) => <span key={issue} className="block text-xs text-danger">{issue}</span>)}
						<input className="input w-full" value={seo.seoTitle} onChange={(event) => setSeo({ ...seo, seoTitle: event.target.value })} />
					</label>
					<label className="block text-sm">
						Slug <span className="text-xs text-text-soft">Stable after CMS sync unless you approve a URL change</span>
						<input className="input w-full" value={seo.slug} onChange={(event) => setSeo({ ...seo, slug: event.target.value })} />
					</label>
					<label className="block text-sm md:col-span-2">
						Meta description <span className={`text-xs ${seo.metaDescription.length > SEO_LIMITS.metaDescription ? 'text-danger' : 'text-text-soft'}`}>{seo.metaDescription.length}/{SEO_LIMITS.metaDescription}</span>
						{seoIssues.metaDescription.map((issue) => <span key={issue} className="block text-xs text-danger">{issue}</span>)}
						<textarea className="input w-full min-h-[4.5rem] resize-y" value={seo.metaDescription} onChange={(event) => setSeo({ ...seo, metaDescription: event.target.value })} />
					</label>
					<label className="block text-sm md:col-span-2">
						Excerpt <span className={`text-xs ${seo.excerpt.length > SEO_LIMITS.excerpt ? 'text-danger' : 'text-text-soft'}`}>{seo.excerpt.length}/{SEO_LIMITS.excerpt}</span>
						{seoIssues.excerpt.map((issue) => <span key={issue} className="block text-xs text-danger">{issue}</span>)}
						<textarea className="input w-full min-h-[5.5rem] resize-y" value={seo.excerpt} onChange={(event) => setSeo({ ...seo, excerpt: event.target.value })} />
					</label>
				</div>
			</div> : null}

			<div className="flex flex-wrap gap-2 items-center">
				<button id="save-article" className="btn" type="button" disabled={busy || jobRunning || (!bodyDirty && !seoDirty && !titleDirty)} onClick={() => void saveDraft()}>
					{pending === 'save' ? 'Saving…' : bodyDirty || seoDirty || titleDirty ? 'Save in CCE' : 'Saved in CCE'}
				</button>
				{bodyDirty ? <button className="btn" type="button" onClick={() => setBody(articleBody)}>Discard body edits</button> : null}
				{bodyDirty ? <span className="text-xs text-text-soft">Saving the body creates a new revision and marks editorial review outdated. Metadata-only saves do not.</span> : null}
			</div>
		</section>
	);
}
