import type { DestinationTaxonomy } from '@/lib/publishing/destinationTaxonomy';
import type { BrandBrain } from '@/lib/intelligence/types';
import type { IntelligenceAi } from '@/lib/intelligence/pipeline';
import { runQualityChecks, type QualityContext } from './quality';
import { plainText, validateArticleStructure, type StructureReport } from './structure';
import type { FindingFix } from './types';

export type ReviewFinding = {
	severity: 'critical' | 'major' | 'minor';
	code: string;
	instruction: string;
	source: 'deterministic' | 'llm';
	dimension?: string;
	/** False for structural defects that every revision is re-checked against. */
	rejectable?: boolean;
	section?: string | null;
	evidence?: string[];
	explanation?: string | null;
	proposedFix?: string | null;
	fix?: FindingFix | null;
};

export type EditorialReview = {
	ready: boolean;
	findings: ReviewFinding[];
};

export const MAX_REVIEW_CHARS = 120_000;

const STRUCTURE_DIMENSION: Record<string, string> = {
	duplicate_adjacent_heading: 'writing_quality',
	duplicate_heading: 'writing_quality',
	empty_section: 'topic_completeness',
	truncated_ending: 'publication_readiness',
	ends_with_heading: 'publication_readiness',
	unclosed_code_fence: 'publication_readiness',
	missing_sections: 'topic_completeness',
	empty_document: 'publication_readiness',
	flattened_table: 'publication_readiness',
	malformed_table: 'publication_readiness',
	unbalanced_emphasis: 'publication_readiness',
};

export type DeterministicReviewInput = {
	body: string;
	wordCount: number;
	targetWords: number;
	categoryId: string | null;
	taxonomy: DestinationTaxonomy | null;
	sourceCount: number;
	claimsExternalResearch: boolean;
	toolSlugs: string[];
	/** Tool slugs already linked in the current body (absolute or relative URLs). */
	linkedToolSlugs?: string[];
	brandName?: string;
	title?: string;
	seoTitle?: string;
	metaDescription?: string;
	requiredLinks?: string[];
	imageRequired?: boolean;
	heroReady?: boolean;
	expectedSections?: number;
	/** Allowed deviation from the requested length, in percent. Defaults to 20. */
	tolerancePct?: number;
	/** Category name stored when it was chosen, to detect a rename in the CMS. */
	categoryName?: string | null;
	quality?: Omit<QualityContext, 'body' | 'wordCount'>;
};

function lengthFinding(actual: number, target: number, tolerancePct = 20): ReviewFinding | null {
	if (!target || !actual) return null;
	const deviation = (actual - target) / target;
	if (Math.abs(deviation) <= tolerancePct / 100) return null;
	const percent = Math.round(Math.abs(deviation) * 100);
	const under = deviation < 0;
	return {
		severity: 'major',
		code: under ? 'too_short' : 'too_long',
		source: 'deterministic',
		dimension: 'topic_completeness',
		evidence: [`${actual.toLocaleString()} words; requested ${target.toLocaleString()} ± ${tolerancePct}%.`],
		instruction: under
			? `The draft has ${actual.toLocaleString()} words against a target of ${target.toLocaleString()} (${percent}% under). That is acceptable if every question in the brief is answered. If a reader question is unanswered, add depth there. Do not add filler to reach the number.`
			: `The draft has ${actual.toLocaleString()} words against a target of ${target.toLocaleString()} (${percent}% over). Cut repetition and digressions; keep every step the reader needs.`,
	};
}

function paragraphsOf(body: string): string[] {
	return body
		.split(/\n\s*\n/)
		.map((part) => part.trim())
		.filter((part) => part && !part.startsWith('#'));
}

const STAT_RE = /\b\d+(?:\.\d+)?\s?(?:%|percent\b|per cent\b)|\b\d+(?:\.\d+)?\s?(?:million|billion)\b|\b(?:studies|research|surveys?|data) (?:show|shows|found|finds|suggests?)\b|\baccording to\b/i;

export function runDeterministicArticleReview(input: DeterministicReviewInput): EditorialReview {
	const findings: ReviewFinding[] = [];
	const structure = validateArticleStructure(input.body, { expectedSections: input.expectedSections });
	for (const issue of structure.issues) {
		findings.push({
			severity: issue.severity,
			code: issue.code,
			source: 'deterministic',
			dimension: STRUCTURE_DIMENSION[issue.code] ?? 'publication_readiness',
			instruction: `${issue.message} Fix the document structure.`,
			rejectable: false,
		});
	}
	const length = lengthFinding(input.wordCount, input.targetWords, input.tolerancePct);
	if (length) findings.push(length);

	if (input.taxonomy) {
		const allowed = input.taxonomy.categories.map((item) => item.id);
		const current = input.categoryId ? input.taxonomy.categories.find((item) => item.id === input.categoryId) : undefined;
		if (!input.categoryId) {
			findings.push({
				severity: allowed.length ? 'critical' : 'major',
				code: 'category_missing',
				source: 'deterministic',
				dimension: 'category_accuracy',
				instruction: 'Choose a category that the destination returned before sending the draft.',
				explanation: 'The destination files articles by category. Without one, the draft cannot be placed on the site.',
				rejectable: !allowed.length,
			});
		} else if (current && input.categoryName && current.name !== input.categoryName) {
			findings.push({
				severity: 'major',
				code: 'category_renamed',
				source: 'deterministic',
				dimension: 'category_accuracy',
				evidence: [`Chosen as “${input.categoryName}”; the CMS now calls it “${current.name}”.`],
				instruction: `The category was renamed in the CMS to “${current.name}”. Confirm it is still the right category, or choose another.`,
			});
		} else if (!allowed.includes(input.categoryId)) {
			findings.push({
				severity: 'critical',
				code: 'unknown_category',
				source: 'deterministic',
				dimension: 'category_accuracy',
				instruction: `The category “${input.categoryId}” does not exist in the destination. Choose one of: ${allowed.join(', ')}.`,
				rejectable: false,
			});
		}
	}
	if (input.claimsExternalResearch && input.sourceCount === 0) {
		findings.push({
			severity: 'critical',
			code: 'uncited_research',
			source: 'deterministic',
			dimension: 'sources',
			instruction: 'Remove claims that cite external research, or attach the stored source URL. Do not invent citations.',
		});
	}

	const paragraphs = paragraphsOf(input.body);
	const seenParagraphs = new Set<string>();
	for (const paragraph of paragraphs) {
		const key = paragraph.toLowerCase();
		if (seenParagraphs.has(key) && paragraph.length > 80) {
			findings.push({
				severity: 'major',
				code: 'repetition',
				source: 'deterministic',
				dimension: 'writing_quality',
				instruction: `Remove the repeated paragraph beginning “${plainText(paragraph).slice(0, 80)}…”.`,
			});
			break;
		}
		seenParagraphs.add(key);
	}
	const sentenceCounts = new Map<string, { text: string; count: number }>();
	for (const sentence of plainText(input.body).split(/(?<=[.!?])\s+/)) {
		if (sentence.length < 60) continue;
		const key = sentence.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
		const entry = sentenceCounts.get(key) ?? { text: sentence, count: 0 };
		entry.count += 1;
		sentenceCounts.set(key, entry);
	}
	const repeatedSentences = [...sentenceCounts.values()].filter((entry) => entry.count > 1);
	if (repeatedSentences.length && !findings.some((finding) => finding.code === 'repetition')) {
		findings.push({
			severity: 'major',
			code: 'repeated_sentences',
			source: 'deterministic',
			dimension: 'writing_quality',
			instruction: `These sentences appear more than once: ${repeatedSentences.slice(0, 2).map((entry) => `“${entry.text.slice(0, 90)}”`).join('; ')}. Keep one and vary or cut the rest.`,
		});
	}

	const unsupported = paragraphs.filter((paragraph) => STAT_RE.test(paragraph) && !/\]\(https?:\/\//.test(paragraph));
	if (unsupported.length) {
		findings.push({
			severity: input.sourceCount === 0 ? 'critical' : 'major',
			code: 'unsupported_claim',
			source: 'deterministic',
			dimension: 'accuracy',
			instruction: `${unsupported.length} paragraph${unsupported.length === 1 ? '' : 's'} state a statistic or cite research without a linked source, for example “${plainText(unsupported[0]).slice(0, 120)}…”. Link an approved source or remove the claim.`,
		});
	}

	if (input.brandName?.trim() && !input.quality?.promotedNames?.includes(input.brandName)) {
		const pattern = new RegExp(`\\b${input.brandName.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
		const mentions = (plainText(input.body).match(pattern) ?? []).length;
		const perThousand = input.wordCount ? (mentions / input.wordCount) * 1000 : 0;
		if (mentions > 6 && perThousand > 2.5) {
			findings.push({
				severity: 'major',
				code: 'promotional_overuse',
				source: 'deterministic',
				dimension: 'brand_voice',
				instruction: `${input.brandName} is named ${mentions} times. Keep brand mentions to where they help the reader, usually the close and one practical example.`,
			});
		}
	}

	const meta = (input.metaDescription ?? '').trim();
	const metaProblems: string[] = [];
	if (!input.title?.trim()) metaProblems.push('the title is empty');
	if (!meta) metaProblems.push('the meta description is empty');
	else if (/^#|##/.test(meta)) metaProblems.push('the meta description contains markdown');
	else if (meta.length > 160) metaProblems.push(`the meta description is ${meta.length} characters (keep it under 160)`);
	if ((input.seoTitle ?? '').length > 70) metaProblems.push(`the SEO title is ${input.seoTitle?.length} characters (keep it under 70)`);
	if (metaProblems.length) {
		findings.push({
			severity: 'major',
			code: 'metadata_incomplete',
			source: 'deterministic',
			dimension: 'seo',
			instruction: `Fix the metadata: ${metaProblems.join('; ')}.`,
		});
	}

	const missingLinks = (input.requiredLinks ?? []).filter((link) => link.trim() && !input.body.includes(link.trim()));
	if (missingLinks.length) {
		findings.push({
			severity: 'major',
			code: 'missing_required_link',
			source: 'deterministic',
			dimension: 'internal_linking',
			instruction: `Link these required pages where they are relevant: ${missingLinks.join(', ')}.`,
		});
	}
	for (const tool of input.taxonomy?.tools ?? []) {
		if (!tool.linkWhenTopicMatches) continue;
		if (!new RegExp(tool.linkWhenTopicMatches, 'i').test(input.body)) continue;
		// Satisfaction is body-link based. researchSummary.relatedTools must not clear this finding.
		if (input.linkedToolSlugs?.includes(tool.slug)) continue;
		findings.push({
			severity: 'minor',
			code: 'missing_destination_resource',
			source: 'deterministic',
			dimension: 'internal_linking',
			instruction: `Link ${tool.label} where the draft discusses that topic.`,
			evidence: tool.routePath ? [`Expected a link containing ${tool.routePath}`] : undefined,
		});
	}

	if (input.imageRequired && !input.heroReady) {
		findings.push({
			severity: 'major',
			code: 'image_not_ready',
			source: 'deterministic',
			dimension: 'publication_readiness',
			instruction: 'Generate or choose a hero image and verify that the destination can fetch it.',
		});
	}

	const cmsProblems: string[] = [];
	if (/<\s*(script|iframe|style|div|span)\b/i.test(input.body)) cmsProblems.push('raw HTML');
	if (/^#\s+/m.test(input.body)) cmsProblems.push('an H1 inside the body (the CMS renders the title as H1)');
	if (/!\[[^\]]*\]\((?!https:\/\/)[^)]*\)/.test(input.body)) cmsProblems.push('an inline image without an https URL');
	if (cmsProblems.length) {
		findings.push({
			severity: 'major',
			code: 'cms_incompatible_markup',
			source: 'deterministic',
			dimension: 'publication_readiness',
			instruction: `Remove ${cmsProblems.join(', ')}. The CMS accepts headings, paragraphs, lists, quotes and links.`,
		});
	}

	if (input.quality) {
		findings.push(...runQualityChecks({ ...input.quality, body: input.body, wordCount: input.wordCount }));
	}

	const ready = !findings.some((finding) => finding.severity === 'critical');
	return { ready, findings };
}

export type ReviewBrief = {
	title: string;
	topic: string;
	searchIntent: string;
	audience?: string;
	primaryKeyword?: string;
	contentType: string;
	secondaryKeywords?: string;
	questions?: string;
	avoid?: string;
	tone?: string;
	cta?: string;
	instructions?: string;
};

const TRUNCATION_RE = /truncat|mid-sentence|mid sentence|cut off|cuts off|ends abruptly|incomplete (ending|sentence)|unfinished sentence/i;

export async function runLlmEditorialReview(input: {
	ai: IntelligenceAi;
	ownerUserId: string;
	brain: BrandBrain;
	topic: string;
	searchIntent: string;
	body: string;
	categoryId: string | null;
	brief?: ReviewBrief;
	targetWords?: number;
	research?: Array<{ text: string; source: string }>;
	structure?: StructureReport;
}): Promise<EditorialReview> {
	if (process.env.VITEST === 'true') return { ready: true, findings: [] };
	if (input.body.length > MAX_REVIEW_CHARS) {
		throw new Error(`The article is ${input.body.length.toLocaleString()} characters, which is more than one review pass can read (${MAX_REVIEW_CHARS.toLocaleString()}). Split it before review.`);
	}
	const structure = input.structure ?? validateArticleStructure(input.body);
	type LlmFinding = {
		severity?: string;
		code?: string;
		instruction?: string;
		dimension?: string;
		section?: string;
		evidence?: string;
		explanation?: string;
		proposedFix?: string;
	};
	const completion = await input.ai.completeJson<{ ready?: boolean; findings?: LlmFinding[] }>(
		'REVIEW',
		[
			{
				role: 'system',
				content: [
					'Review the complete article against the approved brief. Return JSON with ready (boolean) and findings (array of severity, code, dimension, section, evidence, explanation, instruction, proposedFix).',
					'section is the exact H2 heading the finding is about, or empty when it concerns the whole article. evidence is a short exact quote from the article. explanation says why it matters to the reader. proposedFix is replacement text when a direct fix is possible, otherwise empty.',
					'Check that the article gives the reader something distinctive: worked examples, exercises or decisions they can act on. Flag sections that only restate general advice.',
					'Flag ideas restated across sections, community anecdotes presented as expert advice, and product mentions that do not help the step being described.',
					'dimension must be one of search_intent, topic_completeness, accuracy, sources, writing_quality, brand_voice, seo, category_accuracy, internal_linking, publication_readiness.',
					'severity critical means the article must not be published as is. Use it only for factual errors, unsupported claims stated as fact, missing answers to the brief questions, or content that contradicts the brief.',
					'You receive the full document. Structure, truncation and word count are checked separately; do not report them.',
					'Each instruction must say exactly what to change and where (quote the heading or a short phrase). Do not rewrite the article. Do not invent sources.',
				].join(' '),
			},
			{
				role: 'user',
				content: JSON.stringify({
					brief: input.brief ?? { topic: input.topic, searchIntent: input.searchIntent },
					categoryId: input.categoryId,
					targetWords: input.targetWords,
					actualWords: structure.wordCount,
					documentEndsWith: structure.finalSentence,
					voice: input.brain.voice,
					guardrails: input.brain.guardrails,
					approvedResearch: (input.research ?? []).slice(0, 30),
					body: input.body,
				}),
			},
		],
		'destination_editorial_review',
		input.ownerUserId,
	);
	const findings: ReviewFinding[] = (completion.data.findings ?? [])
		.filter((item) => item.instruction && item.code)
		.filter((item) => !(structure.endsCleanly && TRUNCATION_RE.test(`${item.code} ${item.instruction}`)))
		.filter((item) => !/word count|too short|too long|\b\d{3,5} words\b/i.test(`${item.code} ${item.instruction}`))
		.map((item) => ({
			severity: item.severity === 'critical' || item.severity === 'major' ? item.severity : 'minor',
			code: String(item.code),
			instruction: String(item.instruction),
			source: 'llm' as const,
			dimension: typeof item.dimension === 'string' ? item.dimension : undefined,
			section: typeof item.section === 'string' && item.section.trim() ? item.section.trim() : null,
			evidence: typeof item.evidence === 'string' && item.evidence.trim() ? [item.evidence.trim()] : undefined,
			explanation: typeof item.explanation === 'string' && item.explanation.trim() ? item.explanation.trim() : null,
			proposedFix: typeof item.proposedFix === 'string' && item.proposedFix.trim() ? item.proposedFix.trim() : null,
		}));
	const ready = !findings.some((finding) => finding.severity === 'critical');
	return { ready, findings };
}

export function mergeEditorialReviews(...reviews: EditorialReview[]): EditorialReview {
	const findings = reviews.flatMap((review) => review.findings);
	const ready = !findings.some((finding) => finding.severity === 'critical');
	return { ready, findings };
}
