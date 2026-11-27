'use client';

import Link from 'next/link';
import { PageHeader } from '@/components/command/PageHeader';
import { useWorkspaceOperations } from '@/components/command/useWorkspaceOperations';

export default function DemoJourneyPage() {
	const { data, error } = useWorkspaceOperations();
	const opportunity = data?.opportunities.find((item) => /revise one chapter/i.test(item.title) && item.status === 'approved')
		?? data?.opportunities.find((item) => item.status === 'approved' && item.recommendedAction !== 'update');
	const attention = data?.jobs.find((job) => job.status === 'needs_attention' && job.articleId);
	const approvalArticle = data?.articles.find((article) => /choose a book idea/i.test(article.title))
		?? data?.articles.find((article) => article.status === 'review' || article.status === 'draft');
	const attentionArticle = attention?.articleId ? data?.articles.find((article) => article.id === attention.articleId) : undefined;

	const steps = [
		{ title: 'Understand the business', detail: 'Open Brand Brain and read the positioning, audience and brand rules.', href: '/intelligence', action: 'Open Brand Brain' },
		opportunity
			? { title: 'Discover an opportunity', detail: `${opportunity.title}. Status: ${opportunity.status}. This view does not start production.`, href: '/campaigns#approved', action: 'View opportunity' }
			: { title: 'Discover an opportunity', detail: 'No approved create-opportunity was found in this workspace.', href: '/campaigns', action: 'Open campaigns' },
		attentionArticle
			? { title: 'Review the research and the quality gate', detail: `${attentionArticle.title}. The workflow stopped for a person at ${attention?.stage ?? 'editorial'}.`, href: `/content/articles/${attentionArticle.id}?stage=review`, action: 'Review findings' }
			: { title: 'Review the research and the quality gate', detail: 'No article is currently waiting on an editorial escalation.', href: '/workflows', action: 'Open workflows' },
		approvalArticle
			? { title: 'Human oversight', detail: `${approvalArticle.title}. This is a completed draft. Approval does not publish it.`, href: `/content/articles/${approvalArticle.id}?stage=publish#approval`, action: 'Open approval' }
			: { title: 'Human oversight', detail: 'No draft awaiting review was found.', href: '/content', action: 'Open content' },
		{ title: 'Platform vision', detail: 'Agents are capabilities. Workflows are the path from opportunity to approval. Planned capabilities stay labelled as planned.', href: '/agents', action: 'Open agents' },
	];

	return (
		<main className="mx-auto max-w-3xl space-y-6 p-4 md:p-8">
			<PageHeader eyebrow="Demonstration" title="A real Folian workflow" description="About three minutes. Do not resume the campaign, approve a live change, or publish. This page only links to records that already exist." />
			{error ? <p className="card border-danger/70 p-4" role="alert">{error}</p> : null}
			{!data && !error ? <p className="text-sm text-text-soft">Matching live records…</p> : null}
			<ol className="space-y-3">
				{steps.map((step, index) => (
					<li key={step.title} className="card-action space-y-2">
						<p className="text-sm text-text-dim">Step {index + 1}</p>
						<h2 className="text-lg font-semibold">{step.title}</h2>
						<p className="text-sm text-text-soft">{step.detail}</p>
						<Link className="btn-primary w-fit" href={step.href}>{step.action} →</Link>
					</li>
				))}
			</ol>
		</main>
	);
}
