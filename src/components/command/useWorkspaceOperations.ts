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

let inflightOperations: Promise<WorkspaceOperations> | null = null;

async function readJson(response: Response): Promise<unknown> {
	if (!response.ok) throw new Error(response.status === 401 ? 'unauthorized' : 'request failed');
	return response.json();
}

function loadOperations(): Promise<WorkspaceOperations> {
	if (inflightOperations) return inflightOperations;
	inflightOperations = (async () => {
		const body = await readJson(await fetch('/api/intelligence/brands')) as { brands?: Brand[] };
		const brand = (body.brands ?? []).find((item) => /folian/i.test(item.name)) ?? body.brands?.[0];
		if (!brand) throw new Error('empty');
		const [queue, listed] = await Promise.all([
			readJson(await fetch(`/api/campaigns?brandId=${encodeURIComponent(brand.id)}`)),
			readJson(await fetch(`/api/articles?brandId=${encodeURIComponent(brand.id)}&pageSize=100`)),
		]) as [{ operations?: Operations; jobs?: OverviewJob[]; opportunities?: OverviewOpportunity[]; campaigns?: Array<{ status?: string }> }, { articles?: OverviewArticle[] }];
		const operations = queue.operations ?? {};
		const jobs = queue.jobs ?? [];
		const opportunities = queue.opportunities ?? [];
		const articles = Array.isArray(listed.articles) ? listed.articles : [];
		const capacity = productionCapacity(
			jobs.flatMap((job) => (job.createdAt ? [{ createdAt: job.createdAt, status: job.status, workType: job.workType }] : [])),
			Date.now(),
			operations.weeklyMaximum ?? 0,
		);
		const next: WorkspaceOperations = {
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
		};
		return next;
	})().finally(() => {
		inflightOperations = null;
	});
	return inflightOperations;
}

export function useWorkspaceOperations() {
	const [data, setData] = useState<WorkspaceOperations | null>(null);
	const [error, setError] = useState('');

	useEffect(() => {
		let cancelled = false;
		loadOperations()
			.then((next) => {
				if (!cancelled) {
					setData(next);
					setError('');
				}
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
