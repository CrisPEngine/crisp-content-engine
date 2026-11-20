import { sameSearchIntent } from './lanes';
import type { ContentOpportunity } from './types';

const UNSAFE_CATEGORIES = new Set(['accuracy', 'research', 'product', 'citations', 'brand']);
const TARGETED_CATEGORIES = new Set(['examples', 'structure', 'repetition', 'writing', 'seo', 'usefulness']);
const MATERIAL_FINDINGS = new Set(['intro-weak', 'opening-guide', 'definition-thin', 'cta-weak', 'answers-indirect', 'example-conflict']);

export type EditorialWork = {
	acceptIds: string[];
	escalate: string | null;
};

export function classifyEditorialWork(input: {
	proposals: Array<{ id: string; status: string; needsResearch?: boolean; needsBrandVerification?: boolean; sourceFindingId?: string | null }>;
	findings: Array<{ id: string; severity: string; category: string; status: string }>;
	correctionAttempts: number;
	maxCorrections?: number;
}): EditorialWork {
	const maxCorrections = input.maxCorrections ?? 2;
	const openCritical = input.findings.filter((finding) => finding.status === 'open' && finding.severity === 'critical');
	const unsafe = openCritical.filter((finding) => UNSAFE_CATEGORIES.has(finding.category));
	if (unsafe.length) {
		return { acceptIds: [], escalate: `${unsafe.length} critical finding${unsafe.length === 1 ? '' : 's'} need a person: ${unsafe.map((finding) => finding.category).join(', ')}.` };
	}
	if (input.correctionAttempts >= maxCorrections) {
		return { acceptIds: [], escalate: 'The automatic correction limit is used. A person needs to review the remaining findings.' };
	}
	const acceptIds = input.proposals.filter((proposal) => {
		if (proposal.status !== 'proposed') return false;
		if (proposal.needsResearch || proposal.needsBrandVerification) return false;
		const finding = input.findings.find((item) => item.id === proposal.sourceFindingId);
		if (!finding || finding.status !== 'open' || UNSAFE_CATEGORIES.has(finding.category)) return false;
		if (MATERIAL_FINDINGS.has(finding.id) || finding.severity === 'minor') return true;
		return TARGETED_CATEGORIES.has(finding.category);
	}).map((proposal) => proposal.id);
	if (openCritical.length && acceptIds.length === 0) {
		return { acceptIds: [], escalate: `${openCritical.length} critical finding${openCritical.length === 1 ? '' : 's'} remain. Automatic correction did not cover them.` };
	}
	return { acceptIds, escalate: null };
}

export function remainingCapacity(weeklyCapacity: number, startedThisWeek: number): number {
	return Math.max(0, Math.floor(weeklyCapacity) - Math.max(0, startedThisWeek));
}

export function selectProductionOpportunities(input: {
	opportunities: ContentOpportunity[];
	opportunityIdsInProduction: string[];
	remaining: number;
}): ContentOpportunity[] {
	if (input.remaining <= 0) return [];
	const used = new Set(input.opportunityIdsInProduction);
	const active = input.opportunities.filter((item) => used.has(item.id));
	return input.opportunities
		.filter((item) => item.status === 'approved' && (item.recommendedAction === 'create' || item.recommendedAction === 'update') && !item.scoreDetail.promotionBlocked && item.demandClass !== 'unvalidated' && !used.has(item.id))
		.filter((item) => !active.some((existing) => sameSearchIntent(existing.title, item.title)))
		.sort((left, right) => right.score - left.score || left.updatedAt.localeCompare(right.updatedAt))
		.slice(0, input.remaining);
}
