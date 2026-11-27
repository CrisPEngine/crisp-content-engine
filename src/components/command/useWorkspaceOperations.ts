'use client';

import { useEffect, useState } from 'react';
import { productionCapacity } from '@/lib/campaigns/productionPolicy';
import { buildContentOverview, type OverviewArticle, type OverviewJob, type OverviewOpportunity } from '@/lib/content/overview';

type Brand = { id: string; name: string };
type Operations = { paused?: boolean; autonomousPublishingEnabled?: boolean; weeklyMaximum?: number };

export type WorkspaceOperations = {
	brandName: string;
	brandId: string;
	view: ReturnType<typeof buildContentOverview>;
	jobs: OverviewJob[];
	opportunities: OverviewOpportunity[];
	articles: OverviewArticle[];
};

export function useWorkspaceOperations() {
	const [data, setData] = useState<WorkspaceOperations | null>(null);
	const [error, setError] = useState('');

	useEffect(() => {
		let cancelled = false;
		fetch('/api/intelligence/brands')
			.then((response) => response.json())
			.then(async (body: { brands?: Brand[] }) => {
				const brand = (body.brands ?? []).find((item) => /folian/i.test(item.name)) ?? body.brands?.[0];
				if (!brand) {
					if (!cancelled) setError('No workspace is available.');
					return;
				}
				const [queue, listed] = await Promise.all([
					fetch(`/api/campaigns?brandId=${encodeURIComponent(brand.id)}`).then((response) => response.json()),
					fetch(`/api/articles?brandId=${encodeURIComponent(brand.id)}&pageSize=100`).then((response) => response.json()),
				]);
				const operations = (queue.operations ?? {}) as Operations;
				const jobs = (queue.jobs ?? []) as OverviewJob[];
				const opportunities = (queue.opportunities ?? []) as OverviewOpportunity[];
				const articles = (Array.isArray(listed.articles) ? listed.articles : []) as OverviewArticle[];
				const capacity = productionCapacity(
					jobs.flatMap((job) => (job.createdAt ? [{ createdAt: job.createdAt, status: job.status, workType: job.workType }] : [])),
					Date.now(),
					operations.weeklyMaximum ?? 0,
				);
				if (cancelled) return;
				setData({
					brandName: brand.name,
					brandId: brand.id,
					jobs,
					opportunities,
					articles,
					view: buildContentOverview({
						paused: operations.paused ?? queue.campaigns?.[0]?.status !== 'active',
						publishingEnabled: operations.autonomousPublishingEnabled === true,
						started: capacity.started,
						remaining: capacity.remaining,
						nextSlotAt: capacity.nextSlotAt,
						weeklyMaximum: operations.weeklyMaximum ?? 0,
						opportunities,
						jobs,
						articles,
					}),
				});
			})
			.catch(() => {
				if (!cancelled) setError('Workspace activity could not be loaded.');
			});
		return () => {
			cancelled = true;
		};
	}, []);

	return { data, error };
}
