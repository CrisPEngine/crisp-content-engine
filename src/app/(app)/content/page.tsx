'use client';

import { useEffect, useState, type ReactNode } from 'react';

type Brand = { id: string; name: string };
type Job = { id: string; opportunityId: string; articleId: string | null; stage: string; status: string; note: string; error: string | null };
type Opportunity = { id: string; title: string; status: string; recommendedAction: string };
type Article = { id: string; title: string; status: string; publicationPhase?: string; publicationError?: string | null };

export default function ContentOverviewPage() {
	const [brandId, setBrandId] = useState('');
	const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
	const [jobs, setJobs] = useState<Job[]>([]);
	const [articles, setArticles] = useState<Article[]>([]);
	const [paused, setPaused] = useState(true);
	const [error, setError] = useState('');

	useEffect(() => {
		fetch('/api/intelligence/brands')
			.then((response) => response.json())
			.then(async (body: { brands?: Brand[] }) => {
				const folian = (body.brands ?? []).find((brand) => /folian/i.test(brand.name)) ?? body.brands?.[0];
				if (!folian) return;
				setBrandId(folian.id);
				const [queue, listed] = await Promise.all([
					fetch(`/api/campaigns?brandId=${encodeURIComponent(folian.id)}`).then((response) => response.json()),
					fetch(`/api/articles?brandId=${encodeURIComponent(folian.id)}&pageSize=50`).then((response) => response.json()),
				]);
				setOpportunities(queue.opportunities ?? []);
				setJobs(queue.jobs ?? []);
				setPaused(queue.operations?.paused ?? queue.campaigns?.[0]?.status !== 'active');
				setArticles(Array.isArray(listed.articles) ? listed.articles : []);
			})
			.catch(() => setError('Content operations could not be loaded.'));
	}, []);

	const approved = opportunities.filter((item) => item.status === 'approved');
	const attention = jobs.filter((job) => job.status === 'needs_attention');
	const failed = jobs.filter((job) => job.status === 'failed');
	const producing = jobs.filter((job) => job.status === 'queued' || job.status === 'running');
	const review = articles.filter((article) => article.status === 'review' || article.publicationPhase === 'ready_for_approval');
	const scheduled = articles.filter((article) => article.publicationPhase === 'scheduled');
	const published = articles.filter((article) => article.publicationPhase === 'verified_live' || article.publicationPhase === 'published' || article.status === 'published');
	const titleFor = (job: Job) => opportunities.find((item) => item.id === job.opportunityId)?.title ?? 'Article in production';

	return (
		<div className="mx-auto max-w-5xl space-y-6 p-4">
			<header>
				<p className="text-xs text-text-dim">Content</p>
				<h1 className="text-2xl font-semibold">Overview</h1>
				<p className="text-sm text-text-soft">The campaign is {paused ? 'paused' : 'active'}. Approved opportunities stay waiting while it is paused. Publishing stays off until you approve an article and publish it in the website. A failed job does not use a weekly slot.</p>
			</header>
			{error ? <p className="card border-danger/60 p-3 text-sm" role="alert">{error}</p> : null}
			{brandId ? null : <p className="text-sm">Loading the content queue…</p>}
			<Section title="Needs attention" empty="Nothing needs attention." href="/campaigns#production">
				{attention.map((job) => <Item key={job.id} href={job.articleId ? `/content/articles/${job.articleId}` : '/campaigns#production'} title={titleFor(job)} detail={job.error || job.note} />)}
			</Section>
			<Section title="Approved opportunities" empty="No opportunities are waiting to start." href="/campaigns#approved">
				{approved.map((item) => <Item key={item.id} href="/campaigns#approved" title={item.title} detail={paused ? 'Approved. Production does not start while the campaign is paused.' : item.recommendedAction === 'update' ? 'Improve an existing article' : 'New article'} />)}
			</Section>
			<Section title="In production" empty="No article is being researched or written." href="/campaigns#production">
				{producing.map((job) => <Item key={job.id} href={job.articleId ? `/content/articles/${job.articleId}` : '/campaigns#production'} title={titleFor(job)} detail={job.stage} />)}
			</Section>
			<Section title="Awaiting review" empty="No articles are waiting for review." href="/content/articles?view=review">
				{review.map((article) => <Item key={article.id} href={`/content/articles/${article.id}`} title={article.title} detail="Review article" />)}
			</Section>
			<Section title="Scheduled" empty="Nothing is scheduled." href="/content/schedule">
				{scheduled.map((article) => <Item key={article.id} href={`/content/articles/${article.id}`} title={article.title} detail="Scheduled" />)}
			</Section>
			<Section title="Production failures" empty="No production jobs have failed." href="/campaigns#production">
				{failed.map((job) => <Item key={job.id} href={job.articleId ? `/content/articles/${job.articleId}` : '/campaigns#production'} title={titleFor(job)} detail={job.error || job.note || 'The job failed. It does not use a weekly slot.'} />)}
			</Section>
			<Section title="Published" empty="No published articles are in this list yet." href="/content/published">
				{published.map((article) => <Item key={article.id} href={`/content/articles/${article.id}`} title={article.title} detail="Published" />)}
			</Section>
		</div>
	);
}

function Section(props: { title: string; empty: string; href: string; children: ReactNode }) {
	const items = Array.isArray(props.children) ? props.children.filter(Boolean) : props.children ? [props.children] : [];
	return (
		<section className="card space-y-2 p-4 text-sm">
			<div className="flex items-center justify-between gap-3">
				<h2 className="font-medium">{props.title}</h2>
				<a className="underline" href={props.href}>Open</a>
			</div>
			{items.length ? props.children : <p className="text-text-soft">{props.empty}</p>}
		</section>
	);
}

function Item(props: { href: string; title: string; detail: string }) {
	return <p><a className="font-medium underline" href={props.href}>{props.title}</a><span className="block text-text-soft">{props.detail}</span></p>;
}
