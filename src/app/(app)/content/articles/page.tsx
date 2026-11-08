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
};
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
	['failed', 'Failed jobs'],
] as const;

export default function ArticlesPage() {
	const [brands, setBrands] = useState<Brand[]>([]);
	const [brandId, setBrandId] = useState('');
	const [view, setView] = useState<(typeof VIEWS)[number][0]>('all');
	const [rows, setRows] = useState<ArticleRow[]>([]);
	const [failed, setFailed] = useState<FailedJob[]>([]);
	const [message, setMessage] = useState('');

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
		const params = new URLSearchParams({ view });
		if (brandId) params.set('brandId', brandId);
		void fetch(`/api/articles?${params.toString()}`)
			.then((response) => response.json())
			.then((body) => {
				setRows(Array.isArray(body.articles) ? body.articles : []);
				setFailed(Array.isArray(body.failedJobs) ? body.failedJobs : []);
				if (body.error) setMessage(body.error);
			})
			.catch(() => setMessage('Articles could not be loaded.'));
	}, [brandId, view]);

	const brandName = (id: string) => brands.find((brand) => brand.id === id)?.name || id;

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
				{VIEWS.map(([id, label]) => (
					<button key={id} className="btn" type="button" onClick={() => setView(id)} aria-pressed={view === id}>
						{label}
					</button>
				))}
			</div>
			{message ? <p className="text-sm">{message}</p> : null}
			<div className="card overflow-x-auto">
				<table className="w-full text-sm">
					<thead>
						<tr className="text-left text-text-soft">
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
								<td className="p-3"><Link className="underline" href={`/content/articles/${row.id}`}>{row.title}</Link></td>
								<td className="p-3">{brandName(row.brandId)}</td>
								<td className="p-3">{row.destination || '—'}</td>
								<td className="p-3">{row.category || '—'}</td>
								<td className="p-3">{row.contentType}</td>
								<td className="p-3">{row.scheduleStatus === 'scheduled' || row.scheduleStatus === 'due' ? row.scheduleStatus : row.status}</td>
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
