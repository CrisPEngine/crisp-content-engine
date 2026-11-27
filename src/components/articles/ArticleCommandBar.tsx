'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { StatusBadge, toneForStatus } from '@/components/command/StatusBadge';
import { presentArticleHeadline } from '@/lib/command/status';

type JobMatch = { stage: string; status: string; opportunityTitle: string | null };

export function ArticleCommandBar({
	brandId,
	articleId,
	approval,
	published,
	submittedToCms,
	decisionCount,
	onAttention,
}: {
	brandId: string;
	articleId: string;
	approval: string;
	published: boolean;
	submittedToCms: boolean;
	decisionCount: number;
	onAttention?: (needsAttention: boolean) => void;
}) {
	const [job, setJob] = useState<JobMatch | null>(null);
	const attentionRef = useRef(onAttention);
	attentionRef.current = onAttention;

	useEffect(() => {
		let cancelled = false;
		fetch(`/api/campaigns?brandId=${encodeURIComponent(brandId)}`)
			.then((response) => response.json())
			.then((body: { jobs?: Array<{ articleId: string | null; stage: string; status: string; opportunityId: string }>; opportunities?: Array<{ id: string; title: string }> }) => {
				const match = (body.jobs ?? []).find((item) => item.articleId === articleId);
				if (cancelled) return;
				if (!match) {
					attentionRef.current?.(false);
					return;
				}
				const opportunity = (body.opportunities ?? []).find((item) => item.id === match.opportunityId);
				setJob({ stage: match.stage, status: match.status, opportunityTitle: opportunity?.title ?? null });
				attentionRef.current?.(match.status === 'needs_attention');
			})
			.catch(() => attentionRef.current?.(false));
		return () => {
			cancelled = true;
		};
	}, [articleId, brandId]);

	const needsAttention = job?.status === 'needs_attention';
	const headline = presentArticleHeadline({ needsAttention, decisionCount, approval, published });
	const publication = published ? 'Published' : submittedToCms ? 'CMS draft sent, not published' : 'Not published';

	return (
		<section className="card-info space-y-3" aria-label="Article status">
			<div className="flex flex-wrap items-center gap-2">
				<StatusBadge label={headline.label} tone={toneForStatus(headline.label)} />
				<span className="text-sm text-text-soft">{publication}</span>
			</div>
			<p className="text-base">{headline.detail}</p>
			{job?.opportunityTitle ? <p className="text-sm text-text-soft">Opportunity: {job.opportunityTitle}</p> : null}
			<Link href="?stage=publish#approval" className="btn-primary w-fit">Open approval controls →</Link>
		</section>
	);
}
