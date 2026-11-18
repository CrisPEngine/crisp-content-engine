import { contentHash } from './revisions';
import type { ArticleRecord } from './types';

/** Observed cost of one full-document timeline rewrite. Targeted patches do not call a model. */
export const FULL_DOCUMENT_REWRITE_COST_USD = 0.033;

export const EDITORIAL_LIMITS = {
	maxCorrectionAttempts: 2,
	maxModelCalls: 4,
	maxCostUsd: 0.5,
} as const;

export type EditorialContextKind = 'introduction' | 'historical_example' | 'product_mention' | 'repetition' | 'link' | 'full_review';

export type EditorialSpecialist = 'research' | 'strategy' | 'writing' | 'editorial_review' | 'fact_verification' | 'seo' | 'publication';

export const EDITORIAL_SPECIALISTS: Record<EditorialContextKind, EditorialSpecialist> = {
	introduction: 'writing',
	historical_example: 'fact_verification',
	product_mention: 'strategy',
	repetition: 'editorial_review',
	link: 'seo',
	full_review: 'editorial_review',
};

export type EditorialContextSnapshot = {
	version: 1;
	articleId: string;
	revisionId: string | null;
	revisionNumber: number | null;
	contentHash: string;
	updatedAt: string;
	audience: string;
	searchIntent: string;
	angle: string | null;
	outline: string[];
	fictionalExamples: string[];
	activeFindingCodes: string[];
	resolvedFindingCodes: string[];
	acceptedDecisionIds: string[];
	references: {
		researchId: string | null;
		researchVersion: number | null;
		sourceCount: number;
		claimCount: number;
		briefPresent: boolean;
		capabilityIds: string[];
		verifiedNames: string[];
	};
};

export type EditorialOperationRecord = {
	operation: 'targeted_patch' | 'full_rewrite' | 'full_review';
	model: string | null;
	inputTokens: number | null;
	outputTokens: number | null;
	cachedInputTokens: number | null;
	estimatedCostUsd: number | null;
	contextCharacters: number;
	revisionId: string | null;
	findingCode?: string | null;
	result: 'accepted' | 'rejected';
	at: string;
};

export type SelectedEditorialContext = {
	kind: EditorialContextKind;
	specialist: EditorialSpecialist;
	revisionId: string | null;
	audience: string;
	searchIntent: string;
	angle: string | null;
	sectionHeading: string | null;
	passage: string;
	adjacent: string | null;
	finding: { code: string; instruction: string; evidence: string | null } | null;
	sources: Array<{ title: string; url: string | null }>;
	claims: string[];
	verifiedNames: string[];
	contextCharacters: number;
};

function headings(body: string): string[] {
	return [...body.matchAll(/^##\s+(.+)$/gm)].map((match) => match[1]?.trim() ?? '').filter(Boolean);
}

export function sectionText(body: string, heading: string | null): string {
	if (!heading) return body.slice(0, Math.min(body.length, 1200));
	const start = body.search(new RegExp(`^##\\s+${heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'm'));
	if (start < 0) return '';
	const rest = body.slice(start);
	const next = rest.slice(1).search(/^##\s+/m);
	return (next < 0 ? rest : rest.slice(0, next + 1)).trim();
}

function namesIn(body: string): string[] {
	return [...new Set([...body.matchAll(/\b[A-Z][a-z]{2,}\b/g)].map((match) => match[0] ?? ''))].filter((name) =>
		['Mara', 'Ivo'].includes(name),
	);
}

export function buildEditorialSnapshot(article: ArticleRecord, at = new Date().toISOString()): EditorialContextSnapshot {
	const workspace = article.workspace;
	const findings = workspace?.editorial.findings ?? [];
	return {
		version: 1,
		articleId: article.id,
		revisionId: workspace?.revision?.id ?? null,
		revisionNumber: workspace?.revision?.number ?? null,
		contentHash: workspace?.revision?.contentHash ?? contentHash(article.body),
		updatedAt: at,
		audience: article.audience || '',
		searchIntent: article.searchIntent || '',
		angle: workspace?.brief?.instructions?.slice(0, 240) ?? null,
		outline: headings(article.body),
		fictionalExamples: namesIn(article.body),
		activeFindingCodes: findings.filter((finding) => finding.decision === 'pending').map((finding) => finding.code),
		resolvedFindingCodes: findings.filter((finding) => finding.decision === 'resolved_auto' || finding.decision === 'applied').map((finding) => finding.code),
		acceptedDecisionIds: (workspace?.editorialDesk?.proposals ?? []).filter((proposal) => proposal.status === 'accepted' || proposal.status === 'applied').map((proposal) => proposal.id),
		references: {
			researchId: workspace?.researchId ?? null,
			researchVersion: workspace?.research?.version ?? null,
			sourceCount: workspace?.research?.sources.length ?? 0,
			claimCount: article.research.claims.length,
			briefPresent: Boolean(workspace?.brief),
			capabilityIds: workspace?.intelligence?.capabilityIds ?? [],
			verifiedNames: workspace?.intelligence?.verifiedNames ?? [],
		},
	};
}

export function snapshotMatchesRevision(snapshot: EditorialContextSnapshot | null | undefined, article: ArticleRecord): boolean {
	if (!snapshot) return false;
	return snapshot.revisionId === (article.workspace?.revision?.id ?? null) && snapshot.contentHash === (article.workspace?.revision?.contentHash ?? contentHash(article.body));
}

export function selectEditorialContext(article: ArticleRecord, kind: EditorialContextKind, findingCode?: string): SelectedEditorialContext {
	const workspace = article.workspace;
	const finding = (workspace?.editorial.findings ?? []).find((item) => item.decision === 'pending' && (!findingCode || item.code === findingCode)) ?? null;
	const heading = finding?.section ?? (kind === 'introduction' ? null : headings(article.body).at(-1) ?? null);
	const passage = kind === 'introduction' ? article.body.slice(0, article.body.search(/^##\s+/m) > 0 ? article.body.search(/^##\s+/m) : 800).trim() : sectionText(article.body, heading).slice(0, 1800);
	const claims = article.research.claims
		.map((claim) => claim.text)
		.filter((text) => {
			if (kind === 'historical_example') return /historical|real-world|real life|public event/i.test(text);
			if (kind === 'product_mention') return /Folian|story memory/i.test(text);
			return false;
		})
		.slice(0, 4);
	const sources = (workspace?.research?.sources ?? [])
		.filter((source) => !source.excluded)
		.slice(0, kind === 'full_review' ? 8 : 3)
		.map((source) => ({ title: source.title, url: source.url ?? null }));
	const selected: SelectedEditorialContext = {
		kind,
		specialist: EDITORIAL_SPECIALISTS[kind],
		revisionId: workspace?.revision?.id ?? null,
		audience: article.audience || '',
		searchIntent: article.searchIntent || '',
		angle: workspace?.brief?.instructions?.slice(0, 240) ?? null,
		sectionHeading: heading,
		passage,
		adjacent: kind === 'introduction' ? headings(article.body)[0] ?? null : null,
		finding: finding ? { code: finding.code, instruction: finding.instruction, evidence: finding.evidence?.[0] ?? null } : null,
		sources: kind === 'introduction' || kind === 'link' || kind === 'repetition' ? [] : sources,
		claims,
		verifiedNames: kind === 'product_mention' || kind === 'full_review' ? workspace?.intelligence?.verifiedNames ?? [] : [],
		contextCharacters: 0,
	};
	selected.contextCharacters = JSON.stringify(selected).length;
	return selected;
}

export function instructionRequests(instruction: string, pattern: RegExp): boolean {
	return instruction.split(/(?<=[.!?])\s+/).some((sentence) => pattern.test(sentence) && !/\b(do not|don't|never|without)\b/i.test(sentence));
}

export function editorialLimitReason(operations: EditorialOperationRecord[], findingCode?: string): string | null {
	const calls = operations.filter((item) => item.operation !== 'targeted_patch').length;
	const cost = operations.reduce((sum, item) => sum + (item.estimatedCostUsd ?? 0), 0);
	if (calls >= EDITORIAL_LIMITS.maxModelCalls) return 'The model-call limit for this article is reached. A person needs to review it.';
	if (cost >= EDITORIAL_LIMITS.maxCostUsd) return 'The editorial cost limit for this article is reached. A person needs to review it.';
	if (findingCode) {
		const attempts = operations.filter((item) => item.operation === 'targeted_patch' && item.findingCode === findingCode);
		if (attempts.some((item) => item.result === 'accepted')) return 'This finding already has an accepted correction. A person needs to review a further change.';
		if (attempts.filter((item) => item.result === 'rejected').length >= EDITORIAL_LIMITS.maxCorrectionAttempts) return 'This correction has been attempted too many times. A person needs to review it.';
	}
	return null;
}

export function recordEditorialOperation(article: ArticleRecord, record: Omit<EditorialOperationRecord, 'at'>): EditorialOperationRecord {
	const saved = { ...record, at: new Date().toISOString() };
	const workspace = article.workspace;
	if (workspace) workspace.editorialOperations = [...(workspace.editorialOperations ?? []), saved].slice(-20);
	return saved;
}

export function costComparison(targetedCostUsd: number): { targetedCostUsd: number; fullRewriteCostUsd: number; savedUsd: number } {
	return {
		targetedCostUsd,
		fullRewriteCostUsd: FULL_DOCUMENT_REWRITE_COST_USD,
		savedUsd: Math.round((FULL_DOCUMENT_REWRITE_COST_USD - targetedCostUsd) * 1_000_000) / 1_000_000,
	};
}
