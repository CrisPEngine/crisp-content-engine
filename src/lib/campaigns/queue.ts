import type { ContentOpportunity, DemandClass, EvidenceConfidence, OpportunityAction, OpportunityStatus } from './types';

export type QueueQuery = {
	q?: string;
	demand?: DemandClass | '';
	action?: OpportunityAction | '';
	status?: OpportunityStatus | 'active' | '';
	confidence?: EvidenceConfidence | '';
	from?: string;
	to?: string;
	sort?: 'updated' | 'score' | 'title';
	page?: number;
	pageSize?: number;
};

export function filterOpportunities(rows: ContentOpportunity[], query: QueueQuery): ContentOpportunity[] {
	const q = query.q?.trim().toLowerCase() ?? '';
	return rows.filter((row) => {
		if ((query.status ?? 'active') === 'active' && row.status === 'archived') return false;
		if (query.status && query.status !== 'active' && row.status !== query.status) return false;
		if (query.demand && row.demandClass !== query.demand) return false;
		if (query.action && row.recommendedAction !== query.action) return false;
		if (query.confidence && row.evidenceConfidence !== query.confidence) return false;
		if (query.from && row.createdAt < query.from) return false;
		if (query.to && row.createdAt > query.to) return false;
		if (!q) return true;
		return `${row.title} ${row.audienceProblem} ${row.searchIntent ?? ''}`.toLowerCase().includes(q);
	});
}

export function sortOpportunities(rows: ContentOpportunity[], sort: QueueQuery['sort'] = 'score'): ContentOpportunity[] {
	const copy = [...rows];
	if (sort === 'title') return copy.sort((a, b) => a.title.localeCompare(b.title));
	if (sort === 'updated') return copy.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
	return copy.sort((a, b) => b.score - a.score);
}

export function queuePage(rows: ContentOpportunity[], query: QueueQuery): { rows: ContentOpportunity[]; page: number; pages: number; total: number } {
	const filtered = sortOpportunities(filterOpportunities(rows, query), query.sort);
	const size = Math.min(50, Math.max(5, query.pageSize ?? 8));
	const pages = Math.max(1, Math.ceil(filtered.length / size));
	const page = Math.min(Math.max(1, query.page ?? 1), pages);
	return { rows: filtered.slice((page - 1) * size, page * size), page, pages, total: filtered.length };
}

export function shouldArchiveOpportunity(row: ContentOpportunity): boolean {
	if (row.status === 'approved' || row.status === 'in_production' || row.status === 'archived') return false;
	if (/\b(what should|who decides|refuse to do|be able to trust)\b/i.test(`${row.title} ${row.audienceProblem}`)) return true;
	return row.demandClass === 'inferred' && row.scoreDetail.promotionBlocked && row.recommendedAction === 'research';
}
