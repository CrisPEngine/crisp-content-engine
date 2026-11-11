import type { IntelligenceAi } from '@/lib/intelligence/pipeline';
import type { BrandBrain } from '@/lib/intelligence/types';
import type { DestinationTaxonomy } from '@/lib/publishing/destinationTaxonomy';
import { mergeEditorialReviews, runDeterministicArticleReview, runLlmEditorialReview } from './editorialReview';
import { editorialStatusFromFindings, ensureWorkspace, imagesRequired, isOpenFinding, reviewCycleLimit, splitLines, toEditorialFindings, wordTargetFor } from './meta';
import { getNativeContentStore } from '@/lib/media/store';
import { buildQualityContext } from './reviewContext';
import { ensureRevision } from './revisions';
import { validateArticleStructure } from './structure';
import type { ArticleRecord } from './types';
import { linkedToolSlugsFromBody } from './linkPresence';

const HISTORY_LIMIT = 12;

/** Reviews the current revision and records which revision and content hash the findings belong to. */
export async function reviewCurrentRevision(input: {
	article: ArticleRecord;
	brain: BrandBrain;
	taxonomy: DestinationTaxonomy | null;
	ai: IntelligenceAi;
	ownerUserId: string;
	/** Other articles for the same brand, for overlap and internal link checks. */
	siblings?: ArticleRecord[];
}): Promise<void> {
	const { article } = input;
	const workspace = ensureWorkspace(article);
	article.workspace = workspace;
	const revision = ensureRevision(article);
	if (!revision) throw new Error('There is no saved draft to review.');
	const brief = workspace.brief;
	const structure = validateArticleStructure(article.body);
	const sourceCount = article.research.sources.filter((source) => source.url).length;
	const words = wordTargetFor(article);
	const siblings = input.siblings ?? (await getNativeContentStore().listArticles(input.ownerUserId, article.brandId).catch(() => []));
	const deterministic = runDeterministicArticleReview({
		body: article.body,
		wordCount: revision.wordCount,
		targetWords: words.requested,
		tolerancePct: words.tolerancePct,
		categoryName: workspace.taxonomyRef?.categoryName ?? null,
		quality: buildQualityContext({ article, siblings, brain: input.brain, taxonomy: input.taxonomy }),
		categoryId: article.categories[0] ?? null,
		taxonomy: input.taxonomy,
		sourceCount,
		claimsExternalResearch: article.research.usedExternalResearch === true,
		toolSlugs: workspace.researchSummary.relatedTools.map((tool) => tool.slug),
		linkedToolSlugs: linkedToolSlugsFromBody(article.body, input.taxonomy?.tools ?? []),
		brandName: input.brain.identity.name,
		title: article.title,
		seoTitle: article.seo.seoTitle,
		metaDescription: article.seo.metaDescription,
		requiredLinks: splitLines(brief?.requiredLinks),
		imageRequired: imagesRequired(workspace.imageRequirements),
		heroReady: Boolean(workspace.media.heroUrl && workspace.media.deliveryVerified && workspace.media.heroAssetId),
	});
	const llm = await runLlmEditorialReview({
		ai: input.ai,
		ownerUserId: input.ownerUserId,
		brain: input.brain,
		topic: article.topic,
		searchIntent: article.searchIntent,
		body: article.body,
		categoryId: article.categories[0] ?? null,
		targetWords: words.requested,
		structure,
		brief: {
			title: article.title,
			topic: article.topic,
			searchIntent: article.searchIntent,
			audience: article.audience,
			primaryKeyword: article.primaryKeyword,
			contentType: workspace.contentType,
			secondaryKeywords: brief?.secondaryKeywords,
			questions: brief?.questions,
			avoid: brief?.avoid,
			tone: brief?.tone,
			cta: brief?.cta,
			instructions: brief?.instructions,
		},
		research: article.research.claims.map((claim) => ({ text: claim.text, source: claim.sourceUrl ?? claim.sourceLabel })),
	});
	const merged = mergeEditorialReviews(deterministic, llm);
	const findings = toEditorialFindings(merged.findings, revision.id);
	const now = new Date().toISOString();
	const previous = workspace.editorial.findings;
	for (const finding of findings) {
		const rejectedBefore = previous.find(
			(old) =>
				old.decision === 'rejected' &&
				old.rejectable !== false &&
				old.code === finding.code &&
				old.source === finding.source &&
				(old.section ?? null) === (finding.section ?? null),
		);
		if (rejectedBefore && finding.rejectable !== false) {
			finding.decision = 'rejected';
			finding.decidedAt = rejectedBefore.decidedAt ?? now;
			finding.note = 'Rejected on an earlier revision.';
		}
	}
	const history = [...(workspace.editorial.history ?? [])];
	if (previous.length) {
		const nextKeys = new Set(findings.map((finding) => `${finding.code}::${finding.source}::${finding.section ?? ''}`));
		history.push({
			revisionId: workspace.editorial.reviewedRevisionId ?? 'legacy',
			revisionNumber: workspace.editorial.reviewedRevisionNumber ?? 0,
			contentHash: workspace.editorial.reviewedContentHash ?? '',
			ranAt: workspace.editorial.lastRunAt ?? now,
			findings: previous.map((finding) => {
				if (!isOpenFinding(finding)) return finding;
				const key = `${finding.code}::${finding.source}::${finding.section ?? ''}`;
				if (!nextKeys.has(key)) {
					return {
						...finding,
						decision: 'resolved_auto' as const,
						decidedAt: now,
						note: `Resolved automatically on review of revision ${revision.number}.`,
					};
				}
				return { ...finding, decision: 'superseded' as const, note: `Superseded by the review of revision ${revision.number}.` };
			}),
		});
	}
	const maxCycles = reviewCycleLimit();
	const openCritical = findings.some((finding) => finding.severity === 'critical' && isOpenFinding(finding));
	const exhausted = openCritical && workspace.editorial.cyclesUsed >= maxCycles;
	workspace.editorial = {
		...workspace.editorial,
		status: editorialStatusFromFindings(findings, exhausted),
		maxCycles,
		findings,
		lastRunAt: now,
		exhausted,
		reviewedRevisionId: revision.id,
		reviewedRevisionNumber: revision.number,
		reviewedContentHash: revision.contentHash,
		history: history.slice(-HISTORY_LIMIT),
	};
	article.review = {
		materialPassed: false,
		note: openCritical
			? `Review of revision ${revision.number} found critical issues. Approval stays blocked until they are resolved.`
			: `Review of revision ${revision.number} found no open critical issues. A person still has to approve.`,
		coherenceFindings: findings.map((finding) => `${finding.dimension}:${finding.code}`),
	};
	syncApprovalWithReviewedRevision(article, revision.id);
}

/** Withdraw approval only when the reviewed body revision differs from the approved one. */
export function syncApprovalWithReviewedRevision(article: ArticleRecord, reviewedRevisionId: string): void {
	const approvedRevisionId = article.workspace?.approvedRevisionId;
	if (article.status === 'approved' && approvedRevisionId && approvedRevisionId !== reviewedRevisionId) {
		article.status = 'review';
		article.approval = { required: true, approver: 'human', status: 'pending' };
		if (article.workspace) {
			article.workspace.approvedAt = null;
			article.workspace.approvedRevisionId = null;
		}
	}
}
