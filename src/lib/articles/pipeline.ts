import { getIntelligenceAi } from '@/lib/intelligence/actions';
import { completeReview } from '@/lib/intelligence/review';
import type { BrandBrain, BrandStrategy, ContentBrief, ContentTheme } from '@/lib/intelligence/types';
import { articleInlinePlan, planMedia } from '@/lib/media/planner';
import { getNativeContentStore } from '@/lib/media/store';
import { publicAsset } from '@/lib/media/images';
import type { ArticleRecord, ArticleSection } from './types';

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

function wordCount(text: string): number {
	return text.split(/\s+/).filter(Boolean).length;
}

function researchFromBrand(brain: BrandBrain, strategy: BrandStrategy | null) {
	const claims = [
		...(brain.knowledge.brandFacts ?? []),
		...(brain.knowledge.productFacts ?? []),
		...(brain.knowledge.proofPoints ?? []),
		...(strategy?.proofPoints ?? []),
	].filter(Boolean);
	const gaps = [
		'No independent customer evidence is stored.',
		'Founder biography and measured proof are incomplete.',
		'Current or numerical claims need a dated research source before they are stated as fact.',
	];
	return {
		sources: [{ label: 'Brand Brain', kind: 'brand_brain' as const }],
		claims: claims.map((text) => ({ text, sourceLabel: 'Brand Brain', confidence: 'stored' as const })),
		gaps,
	};
}

function fallbackOutline(theme: ContentTheme | undefined, strategy: BrandStrategy | null) {
	const subject = theme?.title ?? strategy?.contentPillars[0] ?? 'the brand argument';
	const points = theme?.keyArguments?.length ? theme.keyArguments : strategy?.keyMessages ?? [subject];
	const headings = [
		`What ${subject} is actually about`,
		points[0] ? `The argument: ${points[0]}` : 'The argument',
		'What should not be claimed',
		'What the reader can do with this',
	];
	return headings.map((heading, index) => ({
		id: crypto.randomUUID(),
		heading,
		purpose: index === 2 ? 'Keep the piece inside stored facts and name the gaps.' : `Develop ${heading} without padding.`,
	}));
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
}): Promise<ArticleRecord> {
	const targetWords = normaliseTargetWords(input.targetWords);
	const theme = input.themes.find((item) => item.status === 'active') ?? input.themes[0];
	const research = researchFromBrand(input.brand, input.strategy);
	const topic = input.topic ?? theme?.title ?? input.strategy?.objectives[0] ?? input.brand.identity.name;
	const ai = getIntelligenceAi();
	const outlineCompletion = await ai.completeJson<{ title?: string; searchIntent?: string; sections?: Array<{ heading?: string; purpose?: string }> }>(
		'STRATEGY',
		[
			{ role: 'system', content: 'Plan a long-form article. Return JSON with title, searchIntent, and sections. Use only the supplied brand facts. Do not invent proof. Do not pad the outline.' },
			{ role: 'user', content: JSON.stringify({ topic, objective: input.objective ?? input.strategy?.objectives[0], instruction: input.instruction, sectionCount: sectionCount(targetWords), claims: research.claims.map((claim) => claim.text), gaps: research.gaps }) },
		],
		'article_outline',
		input.ownerUserId,
	);
	const proposed = Array.isArray(outlineCompletion.data.sections) ? outlineCompletion.data.sections : [];
	const outline = proposed.length
		? proposed.slice(0, sectionCount(targetWords)).map((section) => ({
				id: crypto.randomUUID(),
				heading: section.heading?.trim() || 'Untitled section',
				purpose: section.purpose?.trim() || 'Develop the heading with stored facts only.',
			}))
		: fallbackOutline(theme, input.strategy);
	const wordsPerSection = Math.round(targetWords / outline.length);
	const sections: ArticleSection[] = [];
	for (const item of outline) {
		const drafted = await ai.completeJson<{ body?: string }>(
			'WRITING',
			[
				{ role: 'system', content: 'Write one article section as JSON with a body string. Stop when the point is made. Do not add filler to hit a word count. Do not invent customers, metrics, or quotations.' },
				{
					role: 'user',
					content: JSON.stringify({
						heading: item.heading,
						purpose: item.purpose,
						guidance: `About ${wordsPerSection} words is enough if the point is complete. Fewer is better than padding.`,
						voice: input.brand.voice.tone,
						claims: research.claims.map((claim) => claim.text),
						gaps: research.gaps,
					}),
				},
			],
			'article_section',
			input.ownerUserId,
		);
		const body = drafted.data.body?.trim();
		if (!body) throw new Error('Article section did not return body text.');
		sections.push({ ...item, body, claims: research.claims.map((claim) => claim.text).slice(0, 3) });
	}
	const title = outlineCompletion.data.title?.trim() || `${topic}`;
	const body = sections.map((section) => `## ${section.heading}\n\n${section.body}`).join('\n\n');
	const excerpt = sections[0]?.body.split(/(?<=\.)\s/).slice(0, 2).join(' ').slice(0, 280) ?? '';
	const metaDescription = excerpt.slice(0, 155);
	const brief: ContentBrief = {
		objective: input.objective ?? 'authority',
		audience: input.strategy?.audiences[0]?.name ?? input.brand.identity.audiences?.[0] ?? 'the brand audience',
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
		cta: 'Invite a closer look. No hard sell.',
		guardrails: input.brand.guardrails.phrasesToAvoid ?? [],
		prohibitedPhrases: input.brand.guardrails.prohibitedClaims ?? [],
		relatedPreviousContent: [],
		differentiationFromRecent: [],
		sourceRequirements: ['Use only stored brand facts.'],
		optimizationObjective: 'authority',
	};
	const coherence = await ai.completeJson<{ coherent?: boolean; findings?: string[] }>(
		'REVIEW',
		[
			{ role: 'system', content: 'Review the article for continuity between sections. Return JSON with coherent (boolean) and findings (string array). Do not rewrite the article. Do not add facts that are not in the draft.' },
			{ role: 'user', content: body },
		],
		'article_coherence',
		input.ownerUserId,
	);
	const coherenceFindings = Array.isArray(coherence.data.findings) ? coherence.data.findings.filter((item) => typeof item === 'string' && item.trim()).slice(0, 8) : [];
	const review = await completeReview({ draft: body, brain: input.brand, brief });
	const finalBody = review.improvedDraft || body;
	const assets = (await getNativeContentStore().listAssets(input.ownerUserId, input.brand.id)).map(publicAsset);
	const hero = planMedia({ channel: 'BLOG', topic, objective: input.objective, contentType: 'article', assets });
	const inline = articleInlinePlan(sections);
	const now = new Date().toISOString();
	const article: ArticleRecord = {
		id: crypto.randomUUID(),
		ownerUserId: input.ownerUserId,
		brandId: input.brand.id,
		objective: input.objective ?? input.strategy?.objectives[0] ?? 'Support the active strategy',
		audience: input.strategy?.audiences[0]?.name,
		topic,
		searchIntent: outlineCompletion.data.searchIntent?.trim() || 'informational',
		primaryKeyword: theme?.keywords[0],
		secondaryTopics: input.strategy?.contentPillars ?? [],
		research,
		outline,
		sections,
		title,
		slug: slugify(title),
		excerpt,
		body: finalBody,
		seo: {
			title,
			seoTitle: title,
			slug: slugify(title),
			excerpt,
			metaDescription,
			canonical: null,
			primaryKeyword: theme?.keywords[0] ?? null,
			secondaryTopics: input.strategy?.contentPillars ?? [],
		},
		author: null,
		categories: theme ? [theme.title] : [],
		tags: theme?.keywords ?? [],
		inlineAssetIds: [],
		mediaPlan: { hero, inline, note: 'Images are proposed, not generated, until an approved media action runs.' },
		internalLinkOpportunities: [],
		status: 'draft',
		approval: { required: true, approver: 'human', status: 'pending' },
		publication: null,
		performanceContentId: '',
		wordCount: wordCount(finalBody),
		targetWords,
		review: {
			materialPassed: review.materialPassed,
			note: review.revisionReason ?? (coherence.data.coherent === false ? 'Coherence review found section issues.' : 'Reviewed against Brand Brain guardrails.'),
			coherenceFindings,
		},
		versions: [{ body: finalBody, createdAt: now }],
		distribution: { disclosure: null, sponsorship: 'none', contentCluster: theme?.title ?? null, authorProfileId: null },
		createdAt: now,
		updatedAt: now,
	};
	article.performanceContentId = article.id;
	await getNativeContentStore().saveArticle(article);
	return article;
}

export async function reviseArticle(input: {
	ownerUserId: string;
	article: ArticleRecord;
	brand: BrandBrain;
	instruction: string;
	sectionId?: string;
}): Promise<ArticleRecord> {
	const ai = getIntelligenceAi();
	const target = input.sectionId ? input.article.sections.find((section) => section.id === input.sectionId) : undefined;
	const revised = await ai.completeJson<{ body?: string }>(
		'WRITING',
		[
			{ role: 'system', content: 'Revise the article text. Return JSON with a body string. Keep stored facts. Do not add unsupported claims or filler.' },
			{ role: 'user', content: `REVISION INSTRUCTION\n${input.instruction}\n\n${target ? target.body : input.article.body}` },
		],
		'article_revision',
		input.ownerUserId,
	);
	const nextBody = revised.data.body?.trim();
	if (!nextBody) throw new Error('Article revision did not return body text.');
	const sections = input.article.sections.map((section) => (target && section.id === target.id ? { ...section, body: nextBody } : section));
	const body = target ? sections.map((section) => `## ${section.heading}\n\n${section.body}`).join('\n\n') : nextBody;
	const updated: ArticleRecord = {
		...input.article,
		sections,
		body,
		wordCount: wordCount(body),
		versions: [...input.article.versions, { body: input.article.body, createdAt: input.article.updatedAt, instruction: input.instruction }],
		updatedAt: new Date().toISOString(),
	};
	await getNativeContentStore().saveArticle(updated);
	return updated;
}

export { TARGETS };
