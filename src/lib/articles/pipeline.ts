import { completeLongFormJson } from '@/lib/ai/longFormComplete';
import { assertLongFormDraftReady } from '@/lib/ai/longFormComplete';
import { estimateModelCostUsd } from '@/lib/ai/pricing';
import { resolveModelForRole } from '@/lib/ai/roles';
import { emptyWorkspace, ensureWorkspace, isOpenFinding, reviewCycleLimit, splitLines } from '@/lib/articles/meta';
import { getIntelligenceAi } from '@/lib/intelligence/actions';
import { completeReview } from '@/lib/intelligence/review';
import type { BrandBrain, BrandStrategy, ContentBrief, ContentTheme } from '@/lib/intelligence/types';
import { articleInlinePlan, planMedia } from '@/lib/media/planner';
import { classifyArticleForDestination } from '@/lib/publishing/classifyForDestination';
import { editorialDestinationForBrand, loadDestinationTaxonomy } from '@/lib/publishing/destinationRegistry';
import type { ResearchRecord } from '@/lib/agent/types';
import { getNativeContentStore } from '@/lib/media/store';
import { publicAsset } from '@/lib/media/images';
import type { ArticleBriefDetails, ArticleEditorialFinding, ArticleRecord, ArticleResearch, ArticleSection } from './types';
import { postProcessPlainDraft } from '@/lib/content/postProcessGeneration';
import { normaliseUrl } from './researchPackage';
import { commitRevision } from './revisions';
import { reviewCurrentRevision } from './reviewRun';
import { articleWordCount, assembleSections, cleanSectionBody, parseSections, validateArticleStructure } from './structure';

const TARGETS = [1500, 3000, 5000] as const;

export function normaliseTargetWords(value: number | undefined): number {
	if (!value || value < 800) return 1500;
	if (value >= 4500) return 5000;
	if (value >= 2500) return 3000;
	if (value > 1500) return Math.round(value);
	return 1500;
}

function sectionCount(target: number): number {
	if (target >= 5000) return 8;
	if (target >= 3000) return 6;
	return 4;
}

function slugify(title: string): string {
	return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80);
}

export type GenerationStage = (stage: string) => Promise<void>;

type SectionDraft = { body: string; model?: string; promptTokens: number; completionTokens: number };

type EvidenceItem = { text: string; source: string; url?: string };

async function draftArticleSection(input: {
	ai: ReturnType<typeof getIntelligenceAi>;
	ownerUserId: string;
	item: { heading: string; purpose: string };
	previousHeading: string | null;
	nextHeading: string | null;
	isLast: boolean;
	wordsPerSection: number;
	voice: string;
	evidence: EvidenceItem[];
	gaps: string[];
	brief?: ArticleBriefDetails;
}): Promise<SectionDraft> {
	const sectionRange = {
		min: Math.max(120, Math.round(input.wordsPerSection * 0.65)),
		max: Math.round(input.wordsPerSection * 1.35),
	};
	const messages = [
		{
			role: 'system' as const,
			content: [
				'Write one article section as JSON with a body string in markdown.',
				'The section heading is added separately: do not write it, and do not use # or ## headings. Use ### only for sub-steps.',
				'Use the supplied evidence only. When you use a sourced item, link its URL in markdown. Do not invent customers, metrics, studies or quotations.',
				'Finish the section with a complete sentence.',
			].join(' '),
		},
		{
			role: 'user' as const,
			content: JSON.stringify({
				heading: input.item.heading,
				purpose: input.item.purpose,
				previousSection: input.previousHeading,
				nextSection: input.nextHeading,
				guidance: `Target ${sectionRange.min}-${sectionRange.max} words. Fewer is acceptable if the point is fully made.`,
				voice: input.voice,
				tone: input.brief?.tone || undefined,
				avoid: input.brief?.avoid || undefined,
				callToAction: input.isLast ? input.brief?.cta || undefined : undefined,
				requiredLinks: splitLines(input.brief?.requiredLinks),
				evidence: input.evidence,
				gaps: input.gaps,
			}),
		},
	];

	if (process.env.VITEST === 'true') {
		const drafted = await input.ai.completeJson<{ body?: string }>('WRITING', messages, 'article_section', input.ownerUserId);
		const body = drafted.data.body?.trim();
		if (!body) throw new Error('Article section did not return body text.');
		return { body, model: drafted.model, promptTokens: drafted.promptTokens ?? 0, completionTokens: drafted.completionTokens ?? 0 };
	}

	const drafted = await completeLongFormJson<{ body?: string }>({
		messages,
		feature: 'article_section',
		userId: input.ownerUserId,
		wordRange: sectionRange,
		extractText: (data) => data.body ?? '',
		mergeContinuation: (previous, piece) => ({
			...previous,
			body: `${(previous.body ?? '').trim()}\n\n${piece}`.trim(),
		}),
	});
	const body = drafted.data.body?.trim();
	if (!body) throw new Error(`The section “${input.item.heading}” came back empty.`);
	assertLongFormDraftReady({
		text: body,
		finishReason: drafted.meta.finishReason,
		incompleteReason: drafted.meta.incompleteReason,
	});
	return {
		body,
		model: drafted.model,
		promptTokens: drafted.rawUsage?.promptTokens ?? 0,
		completionTokens: drafted.rawUsage?.completionTokens ?? 0,
	};
}

/** Research for callers without an approved package. Sources are deduplicated by URL and labelled with their own titles. */
function researchFromBrand(brain: BrandBrain, strategy: BrandStrategy | null, packets: ResearchRecord[] = []): ArticleResearch {
	const facts = [
		...(brain.knowledge.brandFacts ?? []),
		...(brain.knowledge.productFacts ?? []),
		...(brain.knowledge.proofPoints ?? []),
		...(strategy?.proofPoints ?? []),
	].filter(Boolean);
	const seenUrls = new Set<string>();
	const sources: ArticleResearch['sources'] = [{ label: 'Brand Brain', kind: 'brand_brain' }];
	for (const packet of packets) {
		for (const source of packet.sources) {
			if (!source.url) continue;
			const key = normaliseUrl(source.url);
			if (seenUrls.has(key)) continue;
			seenUrls.add(key);
			sources.push({ label: source.title || new URL(source.url).hostname, kind: 'supplied', url: source.url, retrievedAt: source.retrievedAt });
		}
	}
	const seenClaims = new Set<string>();
	const claims: ArticleResearch['claims'] = [];
	for (const text of facts) {
		const key = text.toLowerCase().trim();
		if (seenClaims.has(key)) continue;
		seenClaims.add(key);
		claims.push({ text, sourceLabel: 'Brand Brain', confidence: 'stored', kind: 'brand' });
	}
	for (const packet of packets) {
		for (const claim of packet.claims) {
			if (!claim.text || !claim.sourceUrl) continue;
			const key = claim.text.toLowerCase().trim();
			if (seenClaims.has(key)) continue;
			seenClaims.add(key);
			const source = sources.find((item) => item.url === claim.sourceUrl);
			claims.push({ text: claim.text, sourceLabel: source?.label ?? claim.sourceUrl, sourceUrl: claim.sourceUrl, confidence: 'supplied', kind: 'topic' });
		}
	}
	return {
		sources,
		claims,
		gaps: [
			'No independent customer evidence is stored.',
			'Current or numerical claims need a dated research source before they are stated as fact.',
		],
		usedExternalResearch: sources.length > 1,
	};
}

function fallbackOutline(topic: string, questions: string[]) {
	const headings = questions.length
		? questions.slice(0, 6)
		: [`What ${topic} involves`, 'A practical sequence', 'Common problems and how to fix them', 'What to do next'];
	return headings.map((heading) => ({ id: crypto.randomUUID(), heading, purpose: `Develop “${heading}” with approved evidence.` }));
}

function evidenceFrom(research: ArticleResearch): EvidenceItem[] {
	return research.claims.map((claim) => ({ text: claim.text, source: claim.sourceLabel, url: claim.sourceUrl }));
}

export async function generateArticle(input: {
	ownerUserId: string;
	brand: BrandBrain;
	strategy: BrandStrategy | null;
	themes: ContentTheme[];
	objective?: string;
	topic?: string;
	targetWords?: number;
	instruction?: string;
	researchRecords?: ResearchRecord[];
	/** Approved research. When present it replaces brand-wide research lookup. */
	research?: ArticleResearch;
	brief?: ArticleBriefDetails;
	articleId?: string;
	destinationId?: string;
	primaryKeyword?: string;
	audience?: string;
	searchIntent?: string;
	contentType?: string;
	skipAutoRevision?: boolean;
	onStage?: GenerationStage;
}): Promise<ArticleRecord> {
	const stage = input.onStage ?? (async () => {});
	const targetWords = normaliseTargetWords(input.targetWords);
	const store = getNativeContentStore();
	const existing = input.articleId ? await store.getArticle(input.ownerUserId, input.articleId) : null;
	const theme = input.themes.find((item) => item.status === 'active') ?? input.themes[0];
	const research = input.research ?? researchFromBrand(input.brand, input.strategy, input.researchRecords ?? []);
	const topic = input.topic ?? theme?.title ?? input.strategy?.objectives[0] ?? input.brand.identity.name;
	const questions = splitLines(input.brief?.questions);
	const ai = getIntelligenceAi();
	await stage('Planning the outline');
	const outlineCompletion = await ai.completeJson<{ title?: string; searchIntent?: string; sections?: Array<{ heading?: string; purpose?: string }> }>(
		'STRATEGY',
		[
			{
				role: 'system',
				content:
					'Plan a long-form article. Return JSON with title, searchIntent, and sections (heading, purpose). Every question in the brief must be answered by a section. Headings are short reader-facing phrases, never copied research sentences. Use only the supplied evidence. Do not pad the outline.',
			},
			{
				role: 'user',
				content: JSON.stringify({
					topic,
					workingTitle: existing?.title,
					objective: input.objective ?? input.strategy?.objectives[0],
					searchIntent: input.searchIntent,
					primaryKeyword: input.primaryKeyword,
					secondaryKeywords: splitLines(input.brief?.secondaryKeywords),
					questions,
					avoid: input.brief?.avoid,
					instructions: [input.brief?.instructions, input.instruction].filter(Boolean).join('\n'),
					referenceMaterial: input.brief?.referenceMaterial,
					sectionCount: sectionCount(targetWords),
					evidence: research.claims.map((claim) => claim.text),
					gaps: research.gaps,
				}),
			},
		],
		'article_outline',
		input.ownerUserId,
	);
	const proposed = Array.isArray(outlineCompletion.data.sections) ? outlineCompletion.data.sections : [];
	const outline = proposed.length
		? proposed.slice(0, sectionCount(targetWords) + 1).map((section) => ({
				id: crypto.randomUUID(),
				heading: (section.heading?.trim() || 'Untitled section').replace(/^#+\s*/, ''),
				purpose: section.purpose?.trim() || 'Develop the heading with approved evidence.',
			}))
		: fallbackOutline(topic, questions);
	const wordsPerSection = Math.round(targetWords / outline.length);
	const evidence = evidenceFrom(research);
	const sections: ArticleSection[] = [];
	let promptTokens = outlineCompletion.promptTokens ?? 0;
	let completionTokens = outlineCompletion.completionTokens ?? 0;
	let modelUsed = outlineCompletion.model ?? resolveModelForRole('LONG_FORM_WRITING');
	for (const [index, item] of outline.entries()) {
		await stage(`Writing section ${index + 1} of ${outline.length}: ${item.heading}`);
		const drafted = await draftArticleSection({
			ai,
			ownerUserId: input.ownerUserId,
			item,
			previousHeading: outline[index - 1]?.heading ?? null,
			nextHeading: outline[index + 1]?.heading ?? null,
			isLast: index === outline.length - 1,
			wordsPerSection,
			voice: input.brand.voice.tone ?? '',
			evidence,
			gaps: research.gaps,
			brief: input.brief,
		});
		promptTokens += drafted.promptTokens;
		completionTokens += drafted.completionTokens;
		if (drafted.model) modelUsed = drafted.model;
		sections.push({
			...item,
			body: cleanSectionBody(drafted.body, item.heading),
			claims: evidence.filter((entry) => entry.url && drafted.body.includes(entry.url)).map((entry) => entry.text).slice(0, 5),
		});
	}
	const assembled = assembleSections(sections);
	const searchIntent = input.searchIntent?.trim() || outlineCompletion.data.searchIntent?.trim() || existing?.searchIntent || 'informational';
	const title = existing?.title?.trim() || outlineCompletion.data.title?.trim() || topic;
	await stage('Checking brand guardrails');
	const brief: ContentBrief = {
		objective: input.objective ?? 'authority',
		audience: input.audience ?? input.strategy?.audiences[0]?.name ?? input.brand.identity.audiences?.[0] ?? 'the brand audience',
		channel: 'blog',
		contentType: 'article',
		funnelStage: 'awareness',
		topic,
		angle: theme?.keyArguments[0] ?? topic,
		hookDirection: title,
		centralArgument: theme?.keyArguments[0] ?? topic,
		supportingPoints: theme?.keyArguments ?? [],
		evidence: research.claims.map((claim) => claim.text),
		proofPoints: input.brand.knowledge.proofPoints ?? [],
		relevantBrandContext: [],
		voiceRequirements: [input.brand.voice.tone ?? ''],
		cta: input.brief?.cta || 'Invite a closer look. No hard sell.',
		guardrails: input.brand.guardrails.phrasesToAvoid ?? [],
		prohibitedPhrases: input.brand.guardrails.prohibitedClaims ?? [],
		relatedPreviousContent: [],
		differentiationFromRecent: [],
		sourceRequirements: ['Use only approved research and stored brand facts.'],
		optimizationObjective: 'authority',
	};
	const brandReview = await completeReview({ draft: assembled, brain: input.brand, brief });
	const assembledWords = articleWordCount(assembled);
	const candidate = brandReview.improvedDraft ? postProcessPlainDraft(brandReview.improvedDraft) : assembled;
	const candidateReport = validateArticleStructure(candidate, { expectedSections: outline.length });
	const finalBody = candidate !== assembled && candidateReport.ok && candidateReport.wordCount >= assembledWords * 0.9 ? candidate : assembled;

	await stage('Validating document structure');
	const structure = validateArticleStructure(finalBody, { expectedSections: outline.length });
	if (!structure.ok) {
		const problems = structure.issues.filter((issue) => issue.severity === 'critical').map((issue) => issue.message);
		throw new Error(`The generated article failed structure validation and was not saved: ${problems.join(' ')}`);
	}

	const destinationId = input.destinationId ?? existing?.workspace?.destinationId ?? editorialDestinationForBrand(input.brand.id);
	const taxonomy = destinationId ? await loadDestinationTaxonomy(destinationId) : null;
	let classification: Awaited<ReturnType<typeof classifyArticleForDestination>> | null = null;
	if (taxonomy && !existing?.categories?.[0]) {
		await stage('Suggesting a category');
		classification = await classifyArticleForDestination({
			ai,
			ownerUserId: input.ownerUserId,
			topic,
			searchIntent,
			audience: input.audience ?? input.strategy?.audiences[0]?.name,
			objective: input.objective ?? input.strategy?.objectives[0],
			taxonomy,
		});
	}

	await stage('Saving the draft');
	const now = new Date().toISOString();
	const latest = input.articleId ? await store.getArticle(input.ownerUserId, input.articleId) : null;
	const base: ArticleRecord = latest ?? {
		id: input.articleId ?? crypto.randomUUID(),
		ownerUserId: input.ownerUserId,
		brandId: input.brand.id,
		objective: input.objective ?? input.strategy?.objectives[0] ?? 'Support the active strategy',
		topic,
		searchIntent,
		secondaryTopics: [],
		research,
		outline: [],
		sections: [],
		title,
		slug: slugify(title),
		excerpt: '',
		body: '',
		seo: { title, seoTitle: title, slug: slugify(title), excerpt: '', metaDescription: '', canonical: null, primaryKeyword: null, secondaryTopics: [] },
		author: null,
		categories: classification ? [classification.categoryId] : [],
		tags: classification?.tags ?? theme?.keywords ?? [],
		inlineAssetIds: [],
		mediaPlan: null,
		internalLinkOpportunities: [],
		status: 'draft',
		approval: { required: true, approver: 'human', status: 'pending' },
		publication: null,
		performanceContentId: '',
		wordCount: 0,
		targetWords,
		review: null,
		versions: [],
		distribution: { disclosure: null, sponsorship: 'none', contentCluster: theme?.title ?? null, authorProfileId: null },
		createdAt: now,
		updatedAt: now,
		workspace: emptyWorkspace(),
	};
	const article: ArticleRecord = { ...base, workspace: ensureWorkspace(base) };
	const secondary = splitLines(input.brief?.secondaryKeywords);
	article.topic = topic;
	article.searchIntent = searchIntent;
	article.audience = input.audience ?? article.audience;
	article.primaryKeyword = input.primaryKeyword ?? article.primaryKeyword ?? theme?.keywords[0];
	article.secondaryTopics = input.brief ? secondary : article.secondaryTopics.length ? article.secondaryTopics : input.strategy?.contentPillars ?? [];
	article.research = research;
	article.outline = outline;
	article.title = title;
	article.targetWords = targetWords;
	article.seo = {
		...article.seo,
		title,
		seoTitle: article.seo.seoTitle || title,
		primaryKeyword: article.primaryKeyword ?? null,
		secondaryTopics: article.secondaryTopics,
	};
	if (!article.slug) article.slug = slugify(title);
	article.status = article.status === 'published' ? 'published' : 'draft';
	article.approval = { required: true, approver: 'human', status: 'pending' };
	const assets = (await store.listAssets(input.ownerUserId, input.brand.id)).map(publicAsset);
	article.mediaPlan = {
		hero: planMedia({ channel: 'BLOG', topic, objective: input.objective, contentType: 'article', assets }),
		inline: articleInlinePlan(sections),
		note: 'Images are proposed, not generated, until an approved media action runs.',
	};
	commitRevision(article, finalBody, 'generation', `Generated with ${modelUsed}${research.packageVersion ? ` from research version ${research.packageVersion}` : ''}.`);
	article.sections = sections;
	article.performanceContentId = article.id;
	article.publishDestination = destinationId ?? article.publishDestination;
	const workspace = ensureWorkspace(article);
	workspace.destinationId = destinationId ?? workspace.destinationId;
	workspace.contentType = input.contentType ?? workspace.contentType;
	workspace.workingTitle = workspace.workingTitle || title;
	workspace.assignedModelRole = 'LONG_FORM_WRITING';
	workspace.assignedModel = modelUsed;
	workspace.researchSummary.searchIntent = searchIntent;
	if (classification && latest) {
		workspace.categorySuggestion = {
			categoryId: classification.categoryId,
			reason: 'Suggested from the topic during generation. Accept it or choose another category.',
			source: 'ai',
			tags: classification.tags,
			createdAt: now,
		};
	}
	workspace.generation = {
		...workspace.generation,
		model: modelUsed,
		promptTokens,
		completionTokens,
		estimatedCostUsd: estimateModelCostUsd({ model: modelUsed, inputTokens: promptTokens, outputTokens: completionTokens }),
		status: 'processing',
		stage: 'Running editorial review',
		updatedAt: now,
		error: null,
		researchVersion: research.packageVersion ?? null,
	};
	workspace.editorial = { ...workspace.editorial, cyclesUsed: 0, exhausted: false };
	article.workspace = workspace;
	await stage('Running editorial review');
	await reviewCurrentRevision({ article, brain: input.brand, taxonomy, ai, ownerUserId: input.ownerUserId });

	const maxCycles = input.skipAutoRevision || process.env.VITEST === 'true' ? 0 : reviewCycleLimit();
	let current = article;
	while (current.workspace && current.workspace.editorial.cyclesUsed < maxCycles) {
		const open = current.workspace.editorial.findings.filter((finding) => finding.severity === 'critical' && isOpenFinding(finding));
		if (!open.length) break;
		await stage(`Applying revision cycle ${current.workspace.editorial.cyclesUsed + 1}`);
		const revised = await applyArticleRevision({ ownerUserId: input.ownerUserId, article: current, brand: input.brand, findings: open });
		current = revised.article;
		const ws = ensureWorkspace(current);
		ws.editorial.cyclesUsed += 1;
		current.workspace = ws;
		await reviewCurrentRevision({ article: current, brain: input.brand, taxonomy, ai, ownerUserId: input.ownerUserId });
	}
	const finalWorkspace = ensureWorkspace(current);
	finalWorkspace.generation = { ...finalWorkspace.generation, status: 'completed', stage: 'Completed', updatedAt: new Date().toISOString() };
	current.workspace = finalWorkspace;
	current.updatedAt = new Date().toISOString();
	await store.saveArticle(current);
	return current;
}

export type RevisionOutcome = {
	article: ArticleRecord;
	applied: Array<{ id: string; change: string }>;
	notApplied: Array<{ id: string; reason: string }>;
	model: string | null;
};

/**
 * Applies recommendations to the current revision and saves the result as a new revision. The model reports
 * which recommendations it implemented; anything it did not report as applied stays open.
 */
export async function applyArticleRevision(input: {
	ownerUserId: string;
	article: ArticleRecord;
	brand: BrandBrain;
	findings?: ArticleEditorialFinding[];
	instruction?: string;
	sectionId?: string;
}): Promise<RevisionOutcome> {
	const ai = getIntelligenceAi();
	const article = input.article;
	const target = input.sectionId ? article.sections.find((section) => section.id === input.sectionId) : undefined;
	const recommendations = (input.findings ?? []).map((finding) => ({ id: finding.id, severity: finding.severity, instruction: finding.instruction }));
	if (input.instruction?.trim()) recommendations.push({ id: 'instruction', severity: 'major', instruction: input.instruction.trim() });
	if (!recommendations.length) throw new Error('There is nothing to apply.');
	const sourceText = target ? target.body : article.body;
	const messages = [
		{
			role: 'system' as const,
			content: [
				'Revise the article by applying each recommendation. Return JSON with body (the complete revised markdown) and results (array of id, applied boolean, change describing what you changed or why you did not).',
				'Return the whole text, including every unchanged section. Never summarise or abbreviate unchanged parts.',
				target ? 'This is one section body: do not add a heading.' : 'Keep ## for section headings and ### for sub-steps. Do not repeat a heading.',
				'Do not add facts, statistics or sources that are not already in the text or the approved research.',
				'Mark applied false if a recommendation cannot be carried out without inventing evidence.',
			].join(' '),
		},
		{
			role: 'user' as const,
			content: JSON.stringify({
				recommendations,
				approvedResearch: article.research.claims.slice(0, 30).map((claim) => ({ text: claim.text, source: claim.sourceUrl ?? claim.sourceLabel })),
				text: sourceText,
			}),
		},
	];
	type RevisionJson = { body?: string; results?: Array<{ id?: string; applied?: boolean; change?: string }> };
	let data: RevisionJson;
	let model: string | null = null;
	if (process.env.VITEST === 'true') {
		const completion = await ai.completeJson<RevisionJson>('WRITING', messages, 'article_revision', input.ownerUserId);
		data = completion.data;
		model = completion.model ?? null;
	} else {
		const completion = await completeLongFormJson<RevisionJson>({
			messages,
			feature: 'article_revision',
			userId: input.ownerUserId,
			extractText: (value) => value.body ?? '',
			mergeContinuation: (previous, piece) => ({ ...previous, body: `${(previous.body ?? '').trim()}\n\n${piece}`.trim() }),
		});
		data = completion.data;
		model = completion.model ?? null;
	}
	const revisedText = data.body?.trim();
	if (!revisedText) throw new Error('The revision returned no text. The current revision is unchanged.');
	let nextBody: string;
	if (target) {
		const cleaned = cleanSectionBody(revisedText, target.heading);
		nextBody = assembleSections(
			parseSections(article.body).map((section) => (section.heading === target.heading ? { heading: section.heading, body: cleaned } : section)),
		);
	} else {
		nextBody = postProcessPlainDraft(revisedText);
	}
	const before = validateArticleStructure(article.body);
	const after = validateArticleStructure(nextBody);
	if (!after.ok) {
		throw new Error(`The revised article failed structure validation, so it was not saved: ${after.issues.filter((issue) => issue.severity === 'critical').map((issue) => issue.message).join(' ')}`);
	}
	const shrinkAllowed = recommendations.some((item) => /cut|shorten|remove|trim|too long|repeat/i.test(item.instruction));
	if (!shrinkAllowed && after.wordCount < before.wordCount * 0.8) {
		throw new Error(`The revision dropped from ${before.wordCount} to ${after.wordCount} words without a recommendation to cut. It was not saved because text may have been lost.`);
	}
	const results = Array.isArray(data.results) ? data.results : [];
	const applied: RevisionOutcome['applied'] = [];
	const notApplied: RevisionOutcome['notApplied'] = [];
	for (const item of recommendations) {
		const result = results.find((entry) => entry.id === item.id);
		if (result?.applied) applied.push({ id: item.id, change: result.change?.trim() || 'Applied.' });
		else notApplied.push({ id: item.id, reason: result?.change?.trim() || 'The revision did not report this as applied.' });
	}
	commitRevision(article, nextBody, 'revision', `Applied ${applied.length} of ${recommendations.length} recommendation${recommendations.length === 1 ? '' : 's'}.`);
	return { article, applied, notApplied, model };
}

/** Compatibility wrapper for agent tools that revise with a free-text instruction. */
export async function reviseArticle(input: {
	ownerUserId: string;
	article: ArticleRecord;
	brand: BrandBrain;
	instruction: string;
	sectionId?: string;
}): Promise<ArticleRecord> {
	const article = { ...input.article, workspace: ensureWorkspace(input.article) };
	const outcome = await applyArticleRevision({ ...input, article });
	const workspace = ensureWorkspace(outcome.article);
	workspace.editorial.status = 'not_run';
	outcome.article.workspace = workspace;
	outcome.article.approval = { required: true, approver: 'human', status: 'pending' };
	if (outcome.article.status === 'approved') outcome.article.status = 'draft';
	outcome.article.updatedAt = new Date().toISOString();
	await getNativeContentStore().saveArticle(outcome.article);
	return outcome.article;
}

export { TARGETS };
