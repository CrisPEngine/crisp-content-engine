'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

type Brand = { id: string; name?: string };
type ArticleRow = {
	id: string;
	brandId: string;
	title: string;
	destination: string | null;
	category: string | null;
	contentType: string;
	status: string;
	scheduleStatus: string;
	wordCount: number;
	updatedAt: string;
	assignedModel: string | null;
	editorialStatus: string;
	publishedUrl: string | null;
	generationStatus: string;
	generationError: string | null;
	revisionNumber: number | null;
	submittedToCms: boolean;
	approved: boolean;
};

function rowBadges(row: ArticleRow): string[] {
	const badges: string[] = [];
	if (row.generationStatus === 'queued' || row.generationStatus === 'processing') badges.push('Generating');
	if (row.generationStatus === 'failed') badges.push('Generation failed');
	if (row.revisionNumber) badges.push(`Saved in CCE · rev ${row.revisionNumber}`);
	if (row.submittedToCms) badges.push('Submitted to CMS');
	if (row.approved) badges.push('Approved');
	if (row.scheduleStatus === 'scheduled' || row.scheduleStatus === 'due') badges.push('Scheduled');
	if (row.status === 'published') badges.push('Published');
	return badges;
}
type FailedJob = { jobId: string; articleId: string | null; error: string; createdAt: string };

function responseOk(body: { error?: string }): boolean {
	return !body?.error;
}

const VIEWS = [
	['all', 'All'],
	['drafts', 'Drafts'],
	['review', 'In review'],
	['approved', 'Approved'],
	['scheduled', 'Scheduled'],
	['published', 'Published'],
	['archived', 'Archived'],
	['failed', 'Failed jobs'],
] as const;

export default function ArticlesPage() {
	const [brands, setBrands] = useState<Brand[]>([]);
	const [brandId, setBrandId] = useState('');
	const [view, setView] = useState<(typeof VIEWS)[number][0]>('all');
	const [rows, setRows] = useState<ArticleRow[]>([]);
	const [failed, setFailed] = useState<FailedJob[]>([]);
	const [message, setMessage] = useState('');
	const [query, setQuery] = useState('');
	const [sort, setSort] = useState('updated');
	const [page, setPage] = useState(1);
	const [pages, setPages] = useState(1);
	const [total, setTotal] = useState(0);
	const [selected, setSelected] = useState<string[]>([]);
	const [confirm, setConfirm] = useState<'archive' | 'delete' | ''>('');

	useEffect(() => {
		void fetch('/api/intelligence/brands')
			.then((response) => response.json())
			.then((body) => {
				if (!responseOk(body)) {
					setMessage('Sign in to see articles.');
					return;
				}
				const list = Array.isArray(body.brands) ? body.brands : [];
				setBrands(list);
				if (list[0]?.id) setBrandId(list[0].id);
				else setMessage('No brand is available for this account.');
			})
			.catch(() => setMessage('Sign in to see articles.'));
	}, []);

	useEffect(() => {
		if (!brandId && view !== 'failed') return;
		const params = new URLSearchParams({ view, sort, page: String(page), pageSize: '20' });
		if (brandId) params.set('brandId', brandId);
		if (query.trim()) params.set('q', query.trim());
		void fetch(`/api/articles?${params.toString()}`)
			.then((response) => response.json())
			.then((body) => {
				setRows(Array.isArray(body.articles) ? body.articles : []);
				setFailed(Array.isArray(body.failedJobs) ? body.failedJobs : []);
				setPages(body.pages ?? 1);
				setTotal(body.total ?? 0);
				if (body.error) setMessage(body.error);
			})
			.catch(() => setMessage('Articles could not be loaded.'));
	}, [brandId, view, query, sort, page]);

	const brandName = (id: string) => brands.find((brand) => brand.id === id)?.name || id;
	async function libraryAction(action: string, extra: Record<string, unknown>) {
		setMessage('');
		const response = await fetch('/api/articles', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action, ...extra }) });
		const body = await response.json();
		if (!response.ok) {
			setMessage(body.error ?? 'That library action failed. Nothing was published.');
			return;
		}
		setConfirm('');
		setSelected([]);
		setPage(1);
		setMessage(action.includes('delete') ? `Deleted ${body.deleted?.length ?? 1} draft${(body.deleted?.length ?? 1) === 1 ? '' : 's'}. Shared media was kept.` : 'The library was updated. Published URLs were not changed.');
		const params = new URLSearchParams({ view, sort, page: '1', pageSize: '20' });
		if (brandId) params.set('brandId', brandId);
		const reload = await fetch(`/api/articles?${params.toString()}`);
		const next = await reload.json();
		setRows(Array.isArray(next.articles) ? next.articles : []);
		setTotal(next.total ?? 0);
		setPages(next.pages ?? 1);
	}

	return (
		<div className="mx-auto max-w-6xl p-6 space-y-6">
			<div className="flex flex-wrap items-end justify-between gap-3">
				<div>
					<h1 className="text-2xl font-semibold">Articles</h1>
					<p className="text-text-soft">Research, draft, review, and send a website article to the connected CMS.</p>
				</div>
				<Link className="btn" href="/content/articles/new">New article</Link>
			</div>
			<div className="flex flex-wrap gap-2">
				<select className="input" value={brandId} onChange={(event) => setBrandId(event.target.value)}>
					{brands.map((brand) => (
						<option key={brand.id} value={brand.id}>{brand.name || brand.id}</option>
					))}
				</select>
				<input className="input" value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder="Search title or status" aria-label="Search articles" />
				<select className="input" value={sort} onChange={(event) => setSort(event.target.value)} aria-label="Sort articles">
					<option value="updated">Updated</option>
					<option value="title">Title</option>
					<option value="status">Status</option>
				</select>
				{VIEWS.map(([id, label]) => (
					<button key={id} className="btn" type="button" onClick={() => setView(id)} aria-pressed={view === id}>
						{label}
					</button>
				))}
			</div>
			{message ? <p className="text-sm">{message}</p> : null}
			<div className="flex flex-wrap items-center gap-2 text-sm">
				<span>{total} articles · {selected.length} selected</span>
				<button className="btn" type="button" disabled={!selected.length} onClick={() => setConfirm('archive')}>Archive selected</button>
				<button className="btn" type="button" disabled={!selected.length} onClick={() => setConfirm('delete')}>Delete unpublished drafts</button>
				{view === 'archived' ? <button className="btn" type="button" disabled={!selected.length} onClick={() => void libraryAction('restore_many', { ids: selected })}>Restore selected</button> : null}
			</div>
			{confirm ? (
				<div className="card space-y-2 p-3 text-sm" role="alertdialog" aria-label="Confirm library action">
					<p>{confirm === 'archive' ? `Archive ${selected.length} articles. This does not unpublish them.` : `Delete ${selected.length} selected drafts if they are unpublished and not linked to a CMS record. Published articles are skipped.`}</p>
					<button className="btn" type="button" onClick={() => void libraryAction(confirm === 'archive' ? 'archive_many' : 'delete_drafts', { ids: selected })}>Confirm</button>
					<button className="btn" type="button" onClick={() => setConfirm('')}>Cancel</button>
				</div>
			) : null}
			<div className="card overflow-x-auto">
				<table className="w-full text-sm">
					<thead>
						<tr className="text-left text-text-soft">
							<th className="p-3"></th>
							<th className="p-3">Title</th>
							<th className="p-3">Brand</th>
							<th className="p-3">Destination</th>
							<th className="p-3">Category</th>
							<th className="p-3">Type</th>
							<th className="p-3">Status</th>
							<th className="p-3">Words</th>
							<th className="p-3">Updated</th>
							<th className="p-3">Model</th>
							<th className="p-3">Review</th>
							<th className="p-3">URL</th>
						</tr>
					</thead>
					<tbody>
						{rows.map((row) => (
							<tr key={row.id} className="border-t border-white/10">
								<td className="p-3"><input type="checkbox" checked={selected.includes(row.id)} onChange={() => setSelected((current) => current.includes(row.id) ? current.filter((id) => id !== row.id) : [...current, row.id])} aria-label={`Select ${row.title}`} /></td>
								<td className="p-3"><Link className="underline" href={`/content/articles/${row.id}`}>{row.title}</Link></td>
								<td className="p-3">{brandName(row.brandId)}</td>
								<td className="p-3">{row.destination || '—'}</td>
								<td className="p-3">{row.category || '—'}</td>
								<td className="p-3">{row.contentType}</td>
								<td className="p-3">
									<div className="flex flex-wrap gap-1">
										{(rowBadges(row).length ? rowBadges(row) : [row.status]).map((badge) => (
											<span key={badge} className="rounded-full border border-edge px-2 py-0.5 text-xs whitespace-nowrap">{badge}</span>
										))}
									</div>
								</td>
								<td className="p-3">{row.wordCount}</td>
								<td className="p-3">{new Date(row.updatedAt).toLocaleString()}</td>
								<td className="p-3">{row.assignedModel || '—'}</td>
								<td className="p-3">{row.editorialStatus}</td>
								<td className="p-3">{row.publishedUrl ? <a href={row.publishedUrl}>Open</a> : '—'}</td>
							</tr>
						))}
					</tbody>
				</table>
				{rows.length === 0 ? <p className="p-4 text-sm text-text-soft">No articles in this view.</p> : null}
			</div>
			<div className="flex gap-2">
				<button className="btn" type="button" disabled={page <= 1} onClick={() => setPage((current) => current - 1)}>Previous</button>
				<button className="btn" type="button" disabled={page >= pages} onClick={() => setPage((current) => current + 1)}>Next</button>
			</div>
			{view === 'failed' ? (
				<div className="space-y-2">
					{failed.map((job) => (
						<article key={job.jobId} className="card p-4 text-sm">
							<p>{job.error}</p>
							{job.articleId ? <Link className="underline" href={`/content/articles/${job.articleId}`}>Open article</Link> : null}
						</article>
					))}
				</div>
			) : null}
		</div>
	);
}
